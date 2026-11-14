// @vitest-environment node
/**
 * 列级 schema 漂移门禁：真实迁移建出的库 **逐列** 对拍 `drizzle-schema.ts`。
 *
 * 为什么需要它：
 *   - `schema-parity.test.ts` 只校验「内存夹具 vs 迁移」，不校验查询用的
 *     `drizzle-schema.ts`；
 *   - 在 `drizzle-schema.ts` 加一列却忘了写 `drizzle/*.sql` 时，TypeScript
 *     全绿，运行期查询才炸（"no such column"）。本测试把这种漂移挡在 CI。
 *
 * 对拍维度：表集合、列（名称 / 类型 / NOT NULL / 主键 / 默认值）、
 * 索引（非唯一索引的名称 / 唯一性 / 键与顺序 / 部分索引谓词）、唯一约束（按列
 * 元组）、外键（完整列对 / 目标 / 级联动作）。
 *
 * 失败信息一次性列出全部差异（表 → 列 → 期望 / 实际），不会在第一条就中断。
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  getTableConfig,
  SQLiteSyncDialect,
  SQLiteTable,
} from "drizzle-orm/sqlite-core";
import { is } from "drizzle-orm";
import * as schemaModule from "../drizzle-schema";
import {
  canonicalSql,
  columnsOf,
  foreignKeyConstraintsOf,
  indexesOf,
  stripOuterParens,
  tableDefinitions,
} from "./sqlite-introspect";

const dbFile = `test-schema-column-parity-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
let dbm: DbModule;

/**
 * 忽略的表，逐条说明理由。除这些之外，迁移建出的表必须与
 * `drizzle-schema.ts` 导出的表**双向完全相等**。
 */
const IGNORED_TABLES: Record<string, string> = {
  __drizzle_migrations:
    "drizzle-kit migrator 自己的记账表（hash + created_at），由迁移器维护，不属于业务 schema",
  sqlite_sequence:
    "SQLite 为 AUTOINCREMENT 维护的内部表；tableDefinitions 已按 sqlite_% 前缀过滤，此处登记以免有人手改过滤规则后失去记录",
};

/**
 * sqlite-vec 的虚拟表与影子表：由 `vector-setup.ts` 在**运行期**按扩展可用性
 * 创建（`CREATE VIRTUAL TABLE ... USING vec0`），不是迁移产物，也没有 drizzle
 * 声明。vec0 会额外生成 `<table>_info/_chunks/_rowids/_vector_chunksNN` 等影子表，
 * 扩展版本不同名字可能变化，所以按前缀整体忽略，而不是逐个列名。
 */
const VECTOR_TABLE_PREFIXES = ["questions_vec", "rag_chunks_vec"];

function isIgnoredTable(name: string, createSql: string | null): string | null {
  const reason = IGNORED_TABLES[name];
  if (reason) return reason;
  if (VECTOR_TABLE_PREFIXES.some((p) => name === p || name.startsWith(`${p}_`)))
    return "sqlite-vec 虚拟表/影子表（运行期按扩展可用性创建，无 drizzle 声明）";
  if (/\bUSING\s+vec0\b/i.test(createSql ?? ""))
    return "sqlite-vec 虚拟表（CREATE VIRTUAL TABLE ... USING vec0）";
  return null;
}

/**
 * drizzle 列类 → SQLite 声明类型（**兜底**）。
 *
 * 首选 `column.getSQLType()`（见 `expectedSqlType`）：`SQLiteTimestamp`
 * （`integer(..., { mode: "timestamp" })` 的 columnType）与 `SQLiteBoolean`
 * 的 columnType 都和真实 SQL 类型不同名，手工映射表漏一项就会误报
 * `SQLITETIMESTAMP vs INTEGER`。这张表只在该列没实现 `getSQLType()` 时兜底，
 * 值必须与列实现的返回一致。
 */
const DECLARED_TYPE_BY_COLUMN_TYPE: Record<string, string> = {
  SQLiteInteger: "INTEGER",
  SQLiteBoolean: "INTEGER",
  SQLiteReal: "REAL",
  SQLiteText: "TEXT",
  SQLiteBlob: "BLOB",
  SQLiteNumeric: "NUMERIC",
};

/** 声明列 → SQL 声明类型（大写）。优先列自身的 getSQLType()。 */
function expectedSqlType(column: any): string {
  if (typeof column.getSQLType === "function") {
    const sqlType = column.getSQLType();
    if (typeof sqlType === "string" && sqlType.length > 0) {
      return sqlType.toUpperCase();
    }
  }
  return (
    DECLARED_TYPE_BY_COLUMN_TYPE[column.columnType] ?? column.columnType
  ).toUpperCase();
}

const dialect = new SQLiteSyncDialect();

type ExpectedTable = ReturnType<typeof getTableConfig>;

function drizzleTables(): ExpectedTable[] {
  const tables: ExpectedTable[] = [];
  for (const value of Object.values(schemaModule)) {
    if (is(value, SQLiteTable)) tables.push(getTableConfig(value));
  }
  return tables;
}

/**
 * 默认值的解析结果。**字符串字面量与 SQL 表达式必须分开**：
 *   - `'CURRENT_TIMESTAMP'` 是固定字符串，`CURRENT_TIMESTAMP` 是每次插入取当前时间；
 *   - `'Admin'` 与 `'admin'` 是两个不同的字符串。
 * 所以字符串只做字面量解码后**精确比较**（区分大小写、保留字面量内容），
 * 只有表达式侧才允许规范化大小写/空白/外层括号。
 */
type ParsedDefault =
  | { kind: "null" }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "expr"; value: string };

/** 期望默认值 → SQL 文本；无默认值返回 null。 */
function expectedDefault(column: any): string | null {
  if (!column.hasDefault || column.default === undefined) return null;
  const value = column.default;
  if (value && typeof value === "object" && "queryChunks" in value) {
    return dialect.sqlToQuery(value).sql;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  return String(value);
}

/** 解码单引号字符串字面量（`''` → `'`）；不是单一字面量时返回 null。 */
function decodeStringLiteral(text: string): string | null {
  if (text.length < 2 || text[0] !== "'" || text[text.length - 1] !== "'") {
    return null;
  }
  let out = "";
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] !== "'") {
      out += text[i];
      continue;
    }
    if (text[i + 1] === "'") {
      out += "'";
      i++;
      continue;
    }
    return null; // 中间有未转义的单引号 → 不是单个字面量
  }
  return out;
}

function decodeNumericLiteral(text: string): number | null {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text))
    return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function parseSqlDefault(raw: string | null): ParsedDefault | null {
  if (raw === null) return null;
  const text = stripOuterParens(raw.trim());
  if (/^null$/i.test(text)) return { kind: "null" };
  // SQLite 的 TRUE/FALSE 就是整数字面量 1/0，统一按数字比较
  if (/^true$/i.test(text)) return { kind: "number", value: 1 };
  if (/^false$/i.test(text)) return { kind: "number", value: 0 };
  const literal = decodeStringLiteral(text);
  if (literal !== null) return { kind: "string", value: literal };
  const numeric = decodeNumericLiteral(text);
  if (numeric !== null) return { kind: "number", value: numeric };
  return { kind: "expr", value: canonicalSql(text) };
}

/** 默认值等价判断：种类必须相同；字符串精确比较，表达式按规范化文本比较。 */
function defaultsEquivalent(
  expected: string | null,
  actual: string | null,
): boolean {
  const e = parseSqlDefault(expected);
  const a = parseSqlDefault(actual);
  if (e === null || a === null) return e === a;
  if (e.kind !== a.kind) return false;
  switch (e.kind) {
    case "null":
      return true;
    case "number":
      return a.kind === "number" && e.value === a.value;
    case "string":
      return a.kind === "string" && e.value === a.value;
    case "expr":
      return a.kind === "expr" && e.value === a.value;
  }
}

/**
 * 索引键表达式归一化：只规范化引号外的记号（大小写、空白、表名限定、外层括号），
 * 字符串字面量原样保留 —— 否则 `x || 'A'` 与 `x || 'a'` 会被压成同一串。
 */
function normalizeExpr(expr: string): string {
  return canonicalSql(expr);
}

function normalizeAction(action: string | undefined): string {
  return (action ?? "NO ACTION").toUpperCase();
}

type ExpectedIndex = {
  name: string;
  unique: boolean;
  columns: string[];
  /** 部分索引谓词（已规范化）；非部分索引为 null。 */
  where: string | null;
};

/** 声明里的单个索引键 → 表达式文本（列直接取列名，SQL 表达式走方言渲染）。 */
function indexKeyText(column: any): string {
  if (typeof column === "string") return column;
  if (column && typeof column.name === "string") return column.name;
  return dialect.sqlToQuery(column).sql;
}

/**
 * drizzle 声明里的**显式索引**（`index(...)` / `uniqueIndex(...)`）。
 *
 * 列上的 `.unique()` 与表级 `unique(...)` 只是唯一**约束**：迁移可以写成内联
 * UNIQUE（内省只剩 `sqlite_autoindex_*`），也可以是显式唯一索引。名字在两种
 * 写法下不同，所以它们不参与按名字的索引对拍，只进唯一键元组那一轮比较。
 */
function expectedExplicitIndexes(table: ExpectedTable): ExpectedIndex[] {
  return table.indexes.map((idx) => ({
    name: idx.config.name,
    unique: idx.config.unique ?? false,
    columns: idx.config.columns.map(indexKeyText),
    where: idx.config.where
      ? canonicalSql(dialect.sqlToQuery(idx.config.where).sql)
      : null,
  }));
}

/** 部分索引谓词等价：任一侧有谓词而另一侧没有 → 不等价（明确失败）。 */
function whereEquivalent(
  expected: string | null,
  actual: string | null,
): boolean {
  if (expected === null || actual === null) return expected === actual;
  return normalizeExpr(expected) === normalizeExpr(actual);
}

/**
 * 唯一键的规范化标识：列元组（排序后）+ 部分索引谓词。
 * 谓词参与比较，避免「同名同列但只覆盖部分行」的唯一索引被当成全量唯一。
 */
function uniqueKeyOf(columns: string[], where: string | null): string {
  const tuple = columns.map(normalizeExpr).sort().join(",");
  return where === null ? tuple : `${tuple} WHERE ${normalizeExpr(where)}`;
}

describe("迁移列级 schema 与 drizzle-schema.ts 一致", () => {
  beforeAll(async () => {
    dbm = await import("../../db");
    await dbm.initDatabase();
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("表 / 列 / 索引 / 唯一约束 / 外键全部对齐", async () => {
    const drift: string[] = [];

    // --- 实际库（已跑真实迁移）---
    const definitions = await tableDefinitions(dbm.drizzleDb);
    const actualTables = definitions
      .filter((d) => !isIgnoredTable(d.name, d.sql))
      .map((d) => d.name)
      .sort();
    const expectedTables = drizzleTables()
      .map((t) => t.name)
      .sort();

    // 防止"导出方式变了 → 一张表都没比较"的空跑式通过
    expect(
      expectedTables.length,
      "drizzle-schema.ts 未导出任何表，门禁失去意义",
    ).toBeGreaterThan(20);

    for (const name of actualTables) {
      if (!expectedTables.includes(name)) {
        drift.push(`表 ${name}: 迁移建了，但 drizzle-schema.ts 未声明`);
      }
    }
    for (const name of expectedTables) {
      if (!actualTables.includes(name)) {
        drift.push(`表 ${name}: drizzle-schema.ts 声明了，但迁移里没有`);
      }
    }

    // --- 逐表对拍 ---
    for (const table of drizzleTables()) {
      const tableName = table.name;
      if (!actualTables.includes(tableName)) continue; // 上面已报

      const actualColumns = await columnsOf(dbm.drizzleDb, tableName);
      const actualByName = new Map(actualColumns.map((c) => [c.name, c]));
      const expectedByName = new Map(
        table.columns.map((c: any) => [c.name, c]),
      );

      for (const column of table.columns as any[]) {
        const actual = actualByName.get(column.name);
        if (!actual) {
          drift.push(`${tableName}.${column.name}: 声明有，迁移缺列`);
          continue;
        }
        const expectedType = expectedSqlType(column);
        if (expectedType !== actual.type) {
          drift.push(
            `${tableName}.${column.name}: 类型不一致（期望 ${expectedType}，实际 ${actual.type || "<空>"}）`,
          );
        }
        const expectedDflt = expectedDefault(column);
        if (!defaultsEquivalent(expectedDflt, actual.dflt)) {
          drift.push(
            `${tableName}.${column.name}: 默认值不一致（期望 ${expectedDflt ?? "<无>"}，实际 ${actual.dflt ?? "<无>"}）`,
          );
        }
        if (!isRowidAlias(actualColumns, actual)) {
          if (column.notNull && actual.notnull !== 1) {
            drift.push(
              `${tableName}.${column.name}: NOT NULL 不一致（期望 1，实际 0）`,
            );
          }
          if (!column.notNull && actual.notnull !== 0) {
            drift.push(
              `${tableName}.${column.name}: NOT NULL 不一致（期望 0，实际 1）`,
            );
          }
        }
      }
      for (const actual of actualColumns) {
        if (!expectedByName.has(actual.name)) {
          drift.push(`${tableName}.${actual.name}: 迁移有列，但声明缺失`);
        }
      }

      // 主键：列集合 + 顺序（复合主键的顺序决定 PRAGMA 的 pk 序号）
      const expectedPk =
        table.primaryKeys.length > 0
          ? table.primaryKeys[0].columns.map((c: any) => c.name)
          : (table.columns as any[])
              .filter((c) => c.primary)
              .map((c) => c.name);
      const actualPk = actualColumns
        .filter((c) => c.pk > 0)
        .sort((a, b) => a.pk - b.pk)
        .map((c) => c.name);
      if (expectedPk.join(",") !== actualPk.join(",")) {
        drift.push(
          `${tableName}: 主键不一致（期望 ${expectedPk.join(",") || "<无>"}，实际 ${actualPk.join(",") || "<无>"}）`,
        );
      }

      // 索引：非唯一索引按名称严格对拍；唯一索引只在唯一键元组那一轮比较
      // （内联 UNIQUE 的自动索引没有稳定名称，不能要求两端同名）。
      const actualIndexes = await indexesOf(dbm.drizzleDb, tableName);
      const namedActual = new Map(
        actualIndexes
          .filter((i) => !i.name.startsWith("sqlite_autoindex_"))
          .map((i) => [i.name, i]),
      );
      const declaredIndexes = expectedExplicitIndexes(table);
      const declaredPlain = declaredIndexes.filter((i) => !i.unique);
      const actualPlain = [...namedActual.values()].filter((i) => !i.unique);
      for (const expected of declaredPlain) {
        if (!namedActual.has(expected.name)) {
          drift.push(
            `${tableName}: 索引缺失（声明 ${expected.name}，迁移未建）`,
          );
        }
      }
      for (const actual of actualPlain) {
        if (!declaredPlain.some((e) => e.name === actual.name)) {
          drift.push(
            `${tableName}: 索引多余（迁移建了 ${actual.name}，声明没有）`,
          );
        }
      }
      for (const expected of declaredPlain) {
        const actual = namedActual.get(expected.name);
        if (!actual) continue;
        const expectedKey = expected.columns.map(normalizeExpr).join(",");
        const actualKey = actual.columns.map(normalizeExpr).join(",");
        if (expectedKey !== actualKey) {
          drift.push(
            `${tableName}.${expected.name}: 索引键不一致（期望 [${expected.columns.join(", ")}]，实际 [${actual.columns.join(", ")}]）`,
          );
        }
        if (!whereEquivalent(expected.where, actual.where)) {
          drift.push(
            `${tableName}.${expected.name}: 部分索引谓词不一致（期望 ${expected.where ?? "<无>"}，实际 ${actual.where ?? "<无>"}）`,
          );
        }
      }

      // 唯一约束：按「列元组 + 部分索引谓词」比较，内联 UNIQUE（自动索引）与
      // 显式 CREATE UNIQUE INDEX 一视同仁；名字不参与比较（两种写法名字不同）。
      const expectedUniqueKeys = new Set<string>();
      for (const idx of declaredIndexes) {
        if (idx.unique) {
          expectedUniqueKeys.add(uniqueKeyOf(idx.columns, idx.where));
        }
      }
      for (const uniq of table.uniqueConstraints) {
        expectedUniqueKeys.add(
          uniqueKeyOf(
            uniq.columns.map((c: any) => c.name),
            null,
          ),
        );
      }
      for (const column of table.columns as any[]) {
        if (column.isUnique) {
          expectedUniqueKeys.add(uniqueKeyOf([column.name], null));
        }
      }
      const actualUniqueKeys = new Set(
        actualIndexes
          .filter((i) => i.unique && i.origin !== "pk" && i.columns.length > 0)
          .map((i) => uniqueKeyOf(i.columns, i.where)),
      );
      const missingUnique = [...expectedUniqueKeys].filter(
        (k) => !actualUniqueKeys.has(k),
      );
      const extraUnique = [...actualUniqueKeys].filter(
        (k) => !expectedUniqueKeys.has(k),
      );
      if (missingUnique.length > 0 || extraUnique.length > 0) {
        drift.push(
          `${tableName}: 唯一约束不一致（声明缺少 [${missingUnique.join(" | ")}]，迁移多出 [${extraUnique.join(" | ")}]）`,
        );
      }

      // 外键：完整列对 → 目标表.列 + 级联动作（复合外键按约束 id 分组）
      const expectedFks = table.foreignKeys.map((fk) => {
        const ref = fk.reference();
        return {
          from: ref.columns.map((c: any) => c.name).join(","),
          table: getTableConfig(ref.foreignTable as SQLiteTable).name,
          to: ref.foreignColumns.map((c: any) => c.name).join(","),
          onDelete: normalizeAction(fk.onDelete),
          onUpdate: normalizeAction(fk.onUpdate),
        };
      });
      const actualFks = await foreignKeyConstraintsOf(dbm.drizzleDb, tableName);
      const keyOf = (fk: (typeof expectedFks)[number]) =>
        `${fk.from}->${fk.table}.${fk.to} ON DELETE ${fk.onDelete} ON UPDATE ${fk.onUpdate}`;
      const expectedFkKeys = new Set(expectedFks.map(keyOf));
      const actualFkKeys = new Set(actualFks.map(keyOf));
      for (const key of expectedFkKeys) {
        if (!actualFkKeys.has(key)) {
          drift.push(`${tableName}: 外键缺失（声明 ${key}）`);
        }
      }
      for (const key of actualFkKeys) {
        if (!expectedFkKeys.has(key)) {
          drift.push(`${tableName}: 外键多余（迁移 ${key}）`);
        }
      }
    }

    expect(
      drift,
      `列级 schema 漂移（共 ${drift.length} 条）：\n${drift.join("\n")}`,
    ).toEqual([]);
  });
});

/**
 * 单列 INTEGER 主键是 rowid 别名：SQLite 对它会忽略 NOT NULL 并允许显式 NULL
 * 自动分配（已实测，见 drizzle/0010 的说明）。迁移里这两种写法（带/不带 NOT NULL）
 * 语义相同，故不比较可空性。复合主键里的 INTEGER 列不是别名，照常比较。
 */
function isRowidAlias(
  columns: { name: string; type: string; pk: number }[],
  column: { name: string; type: string; pk: number },
): boolean {
  const pkColumns = columns.filter((c) => c.pk > 0);
  return pkColumns.length === 1 && column.pk === 1 && column.type === "INTEGER";
}
