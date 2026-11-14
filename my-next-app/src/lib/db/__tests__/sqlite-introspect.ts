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
  /**
   * `PRAGMA table_xinfo` 的 hidden 标记：0 = 普通列，1 = 虚拟表隐藏列，
   * 2 = VIRTUAL 生成列，3 = STORED 生成列。`columnsOf` 已过滤掉 1，
   * 这里保留原值只为排障时能看出列的种类。
   */
  hidden: number;
};

export type ForeignKeyInfo = {
  /** `PRAGMA foreign_key_list` 的约束编号：同一复合外键的多行共享同一个 id。 */
  id: number;
  /** 约束内的列序号（从 0 开始），复合外键按它还原列序。 */
  seq: number;
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
   * 索引键的表达式文本，按索引里的顺序（token 之间以单空格连接，字符串
   * 字面量与引号标识符的内容原样保留）。普通列就是列名；表达式索引（如
   * `date("ts")`）来自 `sqlite_master.sql`，因为 `PRAGMA index_info` 对表达式
   * 列返回 NULL。
   */
  columns: string[];
  /** 是否部分索引（`CREATE INDEX ... WHERE <predicate>`）。 */
  partial: boolean;
  /** 部分索引谓词的文本；非部分索引为 null。 */
  where: string | null;
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

/**
 * 列：用 `table_xinfo` 而不是 `table_info`。后者**不返回生成列**，声明里加了
 * `generatedAlwaysAs` 时会被误报成「迁移缺列」。`table_xinfo` 多返回一行
 * hidden 标记，这里只排除虚拟表的隐藏列（hidden = 1），保留生成列（2/3）。
 */
export async function columnsOf(db: any, table: string): Promise<ColumnInfo[]> {
  const list = await rows<any>(db, `PRAGMA table_xinfo(\`${table}\`)`);
  return list
    .filter((r) => Number(r.hidden ?? 0) !== 1)
    .map((r) => ({
      name: String(r.name),
      type: String(r.type || "").toUpperCase(),
      notnull: Number(r.notnull),
      pk: Number(r.pk),
      dflt:
        r.dflt_value === null || r.dflt_value === undefined
          ? null
          : String(r.dflt_value),
      hidden: Number(r.hidden ?? 0),
    }));
}

/**
 * 外键：一行一列，但带上约束 id 与列序号。复合外键 `(a, b) REFERENCES p(x, y)`
 * 在 `PRAGMA foreign_key_list` 里是两行、共享 id，调用方必须按 id 分组再比较，
 * 否则只能比到第一列，其余列会被误判成「多余外键」。
 */
export async function foreignKeysOf(
  db: any,
  table: string,
): Promise<ForeignKeyInfo[]> {
  const list = await rows<any>(db, `PRAGMA foreign_key_list(\`${table}\`)`);
  return list
    .map((r) => ({
      id: Number(r.id),
      seq: Number(r.seq),
      table: String(r.table),
      from: String(r.from),
      to: r.to === null ? null : String(r.to),
      onDelete: String(r.on_delete || "NO ACTION").toUpperCase(),
      onUpdate: String(r.on_update || "NO ACTION").toUpperCase(),
    }))
    .sort((a, b) => a.id - b.id || a.seq - b.seq);
}

/**
 * 一条外键约束（已按 id 聚合）：`from`/`to` 是逗号分隔的完整列对，
 * 顺序与约束里的列序一致（复合外键的两端必须整条比较）。
 */
export type ForeignKeyConstraintInfo = {
  from: string;
  table: string;
  to: string;
  onDelete: string;
  onUpdate: string;
};

/**
 * 按约束 id 把一行一列的 `foreignKeysOf` 聚合成「一条外键 = 若干列对」。
 * 只取第一列会把复合外键 `(a,b) REFERENCES p(x,y)` 的 `b -> y` 误报成多余外键；
 * 按 id 分组、按 seq 排序才不会混入同一张表的其他外键。
 */
export async function foreignKeyConstraintsOf(
  db: any,
  table: string,
): Promise<ForeignKeyConstraintInfo[]> {
  const rows = await foreignKeysOf(db, table);
  const byId = new Map<number, ForeignKeyInfo[]>();
  for (const row of rows) {
    const group = byId.get(row.id) ?? [];
    group.push(row);
    byId.set(row.id, group);
  }
  return [...byId.values()].map((group) => {
    const ordered = [...group].sort((a, b) => a.seq - b.seq);
    return {
      from: ordered.map((r) => r.from).join(","),
      table: ordered[0].table,
      to: ordered.map((r) => r.to ?? "").join(","),
      onDelete: ordered[0].onDelete,
      onUpdate: ordered[0].onUpdate,
    };
  });
}

/**
 * 索引：`PRAGMA index_list` 给名称/唯一性，键的表达式文本与部分索引谓词
 * 都从建索引 SQL 解析（`PRAGMA index_info` 对表达式列返回 NULL，且丢 DESC，
 * 也不暴露 `WHERE` 谓词）。自动索引没有 SQL，退回 `index_info` 的列名。
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
    const parsed = parseIndexDefinition(created[0]?.sql ?? null);
    result.push({
      name,
      unique: Number(idx.unique) === 1,
      origin: String(idx.origin || ""),
      columns: parsed && parsed.keys.length > 0 ? parsed.keys : fallback,
      partial: parsed !== null && parsed.where !== null,
      where: parsed?.where ?? null,
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ *
 * 小型 SQL tokenizer
 *
 * 为什么需要：索引键/默认值/部分索引谓词都是自由形式的 SQL 片段，比较时既要
 * 吸收「关键字大小写、空白、表名限定、外层括号」这类书写差异，又**不能**动
 * 字符串字面量的内容 —— `x || 'A'` 与 `x || 'a'` 是两个不同的索引。
 * 所以先切成 token，再只对引号外的记号做规范化。
 *
 * 支持的引号形式（SQLite 全部标识符/字符串写法）：
 *   - `'...'` 字符串字面量，`''` 表示一个单引号（内容原样保留，含大小写）；
 *   - `"..."` 双引号标识符，`""` 转义；
 *   - `` `...` `` 反引号标识符（MySQL 兼容），`` `` `` 转义；
 *   - `[...]` 方括号标识符（MS Access/SQL Server 兼容），到第一个 `]` 结束。
 * ------------------------------------------------------------------ */

export type SqlToken = {
  type: "word" | "number" | "string" | "ident" | "punct";
  /** 字符串/标识符 token 含其引号；其余为记号本身。 */
  text: string;
};

const MULTI_CHAR_OPERATORS = ["->>", "->", "||", "<=", ">=", "<>", "!=", "=="];

export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      const escaped = ch + ch;
      let j = i + 1;
      let closed = false;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql.slice(j, j + 2) === escaped) {
            j += 2;
            continue;
          }
          j += 1;
          closed = true;
          break;
        }
        j++;
      }
      // 未闭合时按到末尾处理：内省数据不该出现，但别抛错打断整轮对拍
      tokens.push({
        type: ch === "'" ? "string" : "ident",
        text: sql.slice(i, closed ? j : sql.length),
      });
      i = j;
      continue;
    }

    if (ch === "[") {
      const end = sql.indexOf("]", i + 1);
      const j = end < 0 ? sql.length : end + 1;
      tokens.push({ type: "ident", text: sql.slice(i, j) });
      i = j;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(sql[i + 1] ?? ""))) {
      // 手写扫描（不用 /.../.exec(...)：评审工具对 exec 的非字面量入参一律报警）
      let j = i;
      if (sql[j] === "0" && /[xX]/.test(sql[j + 1] ?? "")) {
        j += 2;
        while (j < sql.length && /[0-9a-fA-F]/.test(sql[j])) j++;
      } else {
        while (j < sql.length && /[0-9]/.test(sql[j])) j++;
        if (sql[j] === ".") {
          j++;
          while (j < sql.length && /[0-9]/.test(sql[j])) j++;
        }
        if (/[eE]/.test(sql[j] ?? "")) {
          const exponentStart = j;
          let k = j + 1;
          if (sql[k] === "+" || sql[k] === "-") k++;
          if (/[0-9]/.test(sql[k] ?? "")) {
            j = k;
            while (j < sql.length && /[0-9]/.test(sql[j])) j++;
          } else {
            j = exponentStart; // `1e` 之类不是指数，停在 e 之前
          }
        }
      }
      tokens.push({ type: "number", text: sql.slice(i, j) });
      i = j;
      continue;
    }

    if (/[A-Za-z_$\u0080-\uffff]/.test(ch)) {
      let j = i;
      while (j < sql.length && /[A-Za-z0-9_$\u0080-\uffff]/.test(sql[j])) j++;
      tokens.push({ type: "word", text: sql.slice(i, j) });
      i = j;
      continue;
    }

    const multi = MULTI_CHAR_OPERATORS.find((op) => sql.startsWith(op, i));
    const text = multi ?? ch;
    tokens.push({ type: "punct", text });
    i += text.length;
  }
  return tokens;
}

/** 去掉引号标识符的引号并还原转义；不是标识符时原样返回。 */
export function unquoteIdentifier(text: string): string {
  const first = text[0];
  if (first === '"' || first === "`") {
    const inner = text.slice(1, text.lastIndexOf(first) > 0 ? -1 : undefined);
    return inner.split(first + first).join(first);
  }
  if (first === "[") {
    return text.replace(/^\[/, "").replace(/\]$/, "");
  }
  return text;
}

/**
 * 表达式规范化：**只**动引号外的记号 ——
 *   - 字符串字面量原样保留（引号、大小写、内部空白都不动）；
 *   - 引号标识符去引号后小写（SQLite 标识符不区分大小写）；
 *   - 关键字/函数名小写，表名限定 `<tbl>.` 去掉；
 *   - token 之间统一补一个空格（吸收换行/多空格的差异）。
 */
export function canonicalSql(sql: string): string {
  const tokens = tokenizeSql(stripOuterParens(sql));
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    const afterNext = tokens[i + 2];
    const isNamed = token.type === "word" || token.type === "ident";
    if (
      isNamed &&
      next?.text === "." &&
      (afterNext?.type === "word" || afterNext?.type === "ident")
    ) {
      // 表名限定符：整段丢弃，只留列名（下标多走一步吃掉点号）
      i += 1;
      continue;
    }
    if (token.type === "string") {
      out.push(token.text);
    } else if (token.type === "ident") {
      out.push(unquoteIdentifier(token.text).toLowerCase());
    } else if (token.type === "word") {
      out.push(token.text.toLowerCase());
    } else {
      out.push(token.text);
    }
  }
  return out.join(" ");
}

/**
 * 剥掉包住整串的最外层括号：`((0))` → `0`，`(a) + (b)` 不动。
 * 靠 token 判断，所以字符串里的括号（`')'`）不会被误算。
 */
export function stripOuterParens(value: string): string {
  let v = value.trim();
  for (;;) {
    if (!v.startsWith("(") || !v.endsWith(")")) return v;
    const tokens = tokenizeSql(v);
    if (tokens[0]?.text !== "(") return v;
    let depth = 0;
    let wrapsWhole = false;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].text === "(") depth++;
      else if (tokens[i].text === ")") {
        depth--;
        if (depth === 0) {
          wrapsWhole = i === tokens.length - 1;
          break;
        }
      }
    }
    if (!wrapsWhole) return v;
    v = v.slice(1, -1).trim();
  }
}

/**
 * 从 `CREATE [UNIQUE] INDEX x ON t (a, coalesce(b, ')') DESC) [WHERE ...]` 里
 * 取出按序的键表达式与部分索引谓词。
 *
 * 关键词（ON/WHERE）大小写不敏感；切分键时只看**括号深度**——引号内的括号与
 * 逗号已经在 tokenizer 里被收进单个 token，所以天然不参与切分。
 */
export function parseIndexDefinition(
  createSql: string | null,
): { keys: string[]; where: string | null } | null {
  if (!createSql) return null;
  const tokens = tokenizeSql(createSql);

  let onIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "word" && tokens[i].text.toLowerCase() === "on") {
      onIndex = i;
      break;
    }
  }
  if (onIndex < 0) return null;

  let open = -1;
  for (let i = onIndex + 1; i < tokens.length; i++) {
    if (tokens[i].text === "(") {
      open = i;
      break;
    }
  }
  if (open < 0) return null;

  const keys: string[] = [];
  let current: string[] = [];
  let depth = 0;
  let close = -1;
  for (let i = open + 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.text === "(") {
      depth++;
      current.push(token.text);
      continue;
    }
    if (token.text === ")") {
      if (depth === 0) {
        close = i;
        break;
      }
      depth--;
      current.push(token.text);
      continue;
    }
    if (token.text === "," && depth === 0) {
      keys.push(current.join(" "));
      current = [];
      continue;
    }
    current.push(token.text);
  }
  keys.push(current.join(" "));

  let where: string | null = null;
  if (close >= 0) {
    let whereIndex = -1;
    for (let i = close + 1; i < tokens.length; i++) {
      if (
        tokens[i].type === "word" &&
        tokens[i].text.toLowerCase() === "where"
      ) {
        whereIndex = i;
        break;
      }
    }
    if (whereIndex >= 0) {
      const predicate = tokens
        .slice(whereIndex + 1)
        .map((t) => t.text)
        .join(" ")
        .trim();
      where = predicate.length > 0 ? predicate : null;
    }
  }

  return {
    keys: keys.map((k) => k.trim()).filter((k) => k.length > 0),
    where,
  };
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
