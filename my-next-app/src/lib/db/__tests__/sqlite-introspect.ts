/**
 * SQLite 内省工具（**测试专用**）。
 *
 * 迁移后的真实库与 `drizzle-schema.ts` 的声明是两份独立事实：
 *   - 真实库来自 `drizzle/*.sql`；
 *   - 声明来自 `sqliteTable(...)`。
 * 二者的一致性由 `schema-column-parity.test.ts` 逐列对拍，
 * 旧夹具（`test-schema-utils.ts`）的一致性由 `schema-parity.test.ts` 对拍。
 *
 * 为什么不用 drizzle 的 `getTableConfig` 反推真实库：
 * 那正是待验证的声明本身，必须走 `PRAGMA` + `sqlite_master` 读数据库的实际情况。
 */

export type ColumnInfo = {
  name: string;
  type: string;
  notnull: number;
  pk: number;
  dflt: string | null;
};

export type ForeignKeyInfo = {
  table: string;
  from: string;
  to: string | null;
  onDelete: string;
  onUpdate: string;
};

export type IndexInfo = {
  name: string;
  unique: boolean;
  /** `c` = CREATE INDEX / `u` = UNIQUE 约束 / `pk` = 主键索引 */
  origin: string;
  /**
   * 索引键的原始表达式文本，按索引里的顺序。
   * 普通列就是列名；表达式索引（如 `"created_at" DESC`、`date("ts")`）来自
   * `sqlite_master.sql`，因为 `PRAGMA index_info` 对表达式列返回 NULL。
   */
  columns: string[];
};

async function rows<T>(db: any, query: string): Promise<T[]> {
  return (await db.all(query)) as T[];
}

/** 所有表（含 `__drizzle_migrations`，不含 `sqlite_%` 内部表）。 */
export async function tableNames(db: any): Promise<string[]> {
  const list = await rows<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  return list.map((r) => String(r.name));
}

/** 表名 + 建表 SQL，供调用方识别虚拟表/影子表（`sqlite_%` 内部表已排除）。 */
export async function tableDefinitions(
  db: any,
): Promise<{ name: string; sql: string | null }[]> {
  const list = await rows<{ name: string; sql: string | null }>(
    db,
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  return list.map((r) => ({ name: String(r.name), sql: r.sql ?? null }));
}

export async function tableSql(db: any, table: string): Promise<string> {
  const list = await rows<{ sql: string | null }>(
    db,
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='${escapeLiteral(table)}'`,
  );
  return list[0]?.sql ?? "";
}

export async function columnsOf(db: any, table: string): Promise<ColumnInfo[]> {
  const list = await rows<any>(db, `PRAGMA table_info(\`${table}\`)`);
  return list.map((r) => ({
    name: String(r.name),
    type: String(r.type || "").toUpperCase(),
    notnull: Number(r.notnull),
    pk: Number(r.pk),
    dflt:
      r.dflt_value === null || r.dflt_value === undefined
        ? null
        : String(r.dflt_value),
  }));
}

export async function foreignKeysOf(
  db: any,
  table: string,
): Promise<ForeignKeyInfo[]> {
  const list = await rows<any>(db, `PRAGMA foreign_key_list(\`${table}\`)`);
  return list
    .map((r) => ({
      table: String(r.table),
      from: String(r.from),
      to: r.to === null ? null : String(r.to),
      onDelete: String(r.on_delete || "NO ACTION").toUpperCase(),
      onUpdate: String(r.on_update || "NO ACTION").toUpperCase(),
    }))
    .sort((a, b) =>
      `${a.from}>${a.table}`.localeCompare(`${b.from}>${b.table}`),
    );
}

/**
 * 索引：`PRAGMA index_list` 给名称/唯一性，键的表达式文本优先从建索引 SQL 解析
 * （`PRAGMA index_info` 对表达式列返回 NULL，且丢 DESC）。自动索引没有 SQL，
 * 退回 `PRAGMA index_info` 的列名。
 */
export async function indexesOf(db: any, table: string): Promise<IndexInfo[]> {
  const list = await rows<any>(db, `PRAGMA index_list(\`${table}\`)`);
  const result: IndexInfo[] = [];
  for (const idx of list) {
    const name = String(idx.name);
    const info = await rows<any>(db, `PRAGMA index_info(\`${name}\`)`);
    const fallback = info
      .map((r: any) => (r.name === null ? null : String(r.name)))
      .filter((n): n is string => n !== null);
    const created = await rows<{ sql: string | null }>(
      db,
      `SELECT sql FROM sqlite_master WHERE type='index' AND name='${escapeLiteral(name)}'`,
    );
    result.push({
      name,
      unique: Number(idx.unique) === 1,
      origin: String(idx.origin || ""),
      columns: parseIndexColumns(created[0]?.sql ?? null, fallback),
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/** 从 `CREATE [UNIQUE] INDEX x ON t (a, b DESC)` 里取出按序的键表达式。 */
function parseIndexColumns(
  createSql: string | null,
  fallback: string[],
): string[] {
  if (!createSql) return fallback;
  // 只取 ON <table> 之后的第一个括号组；断言 SQL 里不含 WHERE（无部分索引）。
  const match = /ON\s+[^\s(]+\s*\(([\s\S]*)\)\s*$/.exec(createSql);
  if (!match) return fallback;
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of match[1]) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  const parsed = parts.map((p) => p.trim()).filter((p) => p.length > 0);
  return parsed.length > 0 ? parsed : fallback;
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
