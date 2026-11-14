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
 * 索引（名称 / 唯一性 / 键与顺序）、唯一约束、外键（列 / 目标 / 级联动作）。
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
  columnsOf,
  foreignKeysOf,
  indexesOf,
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
 * drizzle 列类 → SQLite 声明类型。
 *
 * 依据 drizzle-orm/sqlite-core 各列实现的 `getSQLType()`：
 * 「SQLiteInteger / SQLiteBoolean 都声明为 integer，SQLiteReal → real，
 * SQLiteText（含 json 模式）→ text，SQLiteBlob → blob，SQLiteNumeric → numeric」。
 * 比较的是**声明类型文本**，即 `PRAGMA table_info.type`，不是 SQLite 亲和性推断结果。
 */
const DECLARED_TYPE_BY_COLUMN_TYPE: Record<string, string> = {
  SQLiteInteger: "INTEGER",
  SQLiteBoolean: "INTEGER",
  SQLiteReal: "REAL",
  SQLiteText: "TEXT",
  SQLiteBlob: "BLOB",
  SQLiteNumeric: "NUMERIC",
};

const dialect = new SQLiteSyncDialect();

type ExpectedTable = ReturnType<typeof getTableConfig>;

function drizzleTables(): ExpectedTable[] {
  const tables: ExpectedTable[] = [];
  for (const value of Object.values(schemaModule)) {
    if (is(value, SQLiteTable)) tables.push(getTableConfig(value));
  }
  return tables;
}

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

/** 默认值等价判断：吸收引号/大小写/外层括号/数字写法差异。 */
function defaultsEquivalent(
  expected: string | null,
  actual: string | null,
): boolean {
  if (expected === null && actual === null) return true;
  if (expected === null || actual === null) return false;
  const e = stripOuterParens(expected.trim());
  const a = stripOuterParens(actual.trim());
  if (/^current_timestamp$/i.test(e) && /^current_timestamp$/i.test(a)) {
    return true;
  }
  if (/^-?\d+(\.\d+)?$/.test(e) && /^-?\d+(\.\d+)?$/.test(a)) {
    return Number(e) === Number(a);
  }
  const unquote = (v: string) =>
    v.startsWith("'") && v.endsWith("'")
      ? v.slice(1, -1).replace(/''/g, "'")
      : v;
  return unquote(e).toLowerCase() === unquote(a).toLowerCase();
}

function stripOuterParens(value: string): string {
  let v = value;
  while (v.startsWith("(") && v.endsWith(")")) v = v.slice(1, -1).trim();
  return v;
}

/** 索引键表达式归一化：去引号、去表名限定、压空白、小写。 */
function normalizeExpr(expr: string): string {
  return expr
    .replace(/["`]/g, "")
    .replace(/\b[A-Za-z_][A-Za-z0-9_]*\.(?=[A-Za-z_"])/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeAction(action: string | undefined): string {
  return (action ?? "NO ACTION").toUpperCase();
}

type ExpectedIndex = { name: string; unique: boolean; columns: string[] };

/**
 * drizzle 声明里"应该有"的索引：
 *   1. `index(...)` / `uniqueIndex(...)`（显式命名）；
 *   2. `unique(...)` 表级唯一约束（drizzle 会按 `<table>_<cols>_unique` 命名）；
 *   3. 列上的 `.unique()`（按 `<table>_<col>_unique` 命名）。
 * 迁移 SQL 由 drizzle-kit 生成时用的是同一套命名，所以名称可以严格对拍。
 */
function expectedIndexes(table: ExpectedTable): ExpectedIndex[] {
  const result: ExpectedIndex[] = [];
  for (const idx of table.indexes) {
    result.push({
      name: idx.config.name,
      unique: idx.config.unique ?? false,
      columns: idx.config.columns.map((c: any) =>
        typeof c === "string"
          ? c
          : c.name
            ? c.name
            : normalizeExpr(dialect.sqlToQuery(c).sql),
      ),
    });
  }
  for (const uniq of table.uniqueConstraints) {
    result.push({
      name:
        uniq.name ??
        `${table.name}_${uniq.columns.map((c: any) => c.name).join("_")}_unique`,
      unique: true,
      columns: uniq.columns.map((c: any) => c.name),
    });
  }
  for (const column of table.columns) {
    if (!column.isUnique) continue;
    result.push({
      name: column.uniqueName ?? `${table.name}_${column.name}_unique`,
      unique: true,
      columns: [column.name],
    });
  }
  return result;
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
        const expectedType =
          DECLARED_TYPE_BY_COLUMN_TYPE[column.columnType] ?? column.columnType;
        if (expectedType.toUpperCase() !== actual.type) {
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

      // 索引：名称 / 唯一性 / 键与顺序
      const actualIndexes = await indexesOf(dbm.drizzleDb, tableName);
      const namedActual = new Map(
        actualIndexes
          .filter((i) => !i.name.startsWith("sqlite_autoindex_"))
          .map((i) => [i.name, i]),
      );
      const expectedIndexList = expectedIndexes(table);
      const expectedNames = new Set(expectedIndexList.map((i) => i.name));
      for (const name of expectedNames) {
        if (!namedActual.has(name)) {
          drift.push(`${tableName}: 索引缺失（声明 ${name}，迁移未建）`);
        }
      }
      for (const name of namedActual.keys()) {
        if (!expectedNames.has(name)) {
          drift.push(`${tableName}: 索引多余（迁移建了 ${name}，声明没有）`);
        }
      }
      for (const expected of expectedIndexList) {
        const actual = namedActual.get(expected.name);
        if (!actual) continue;
        if (actual.unique !== expected.unique) {
          drift.push(
            `${tableName}.${expected.name}: 唯一性不一致（期望 ${expected.unique}，实际 ${actual.unique}）`,
          );
        }
        const expectedKey = expected.columns.map(normalizeExpr).join(",");
        const actualKey = actual.columns.map(normalizeExpr).join(",");
        if (expectedKey !== actualKey) {
          drift.push(
            `${tableName}.${expected.name}: 索引键不一致（期望 [${expected.columns.join(", ")}]，实际 [${actual.columns.join(", ")}]）`,
          );
        }
      }

      // 唯一约束：把内联 UNIQUE（自动索引）也算进来，避免只比命名索引漏掉。
      // 含表达式的唯一索引不参与这轮元组比较（无法还原列名），它们的名称与键
      // 已在上面按命名索引比过。
      const uniqueIndexKeys = table.indexes
        .filter((i) => i.config.unique ?? false)
        .map((i) =>
          i.config.columns.map((c: any) =>
            typeof c === "string" ? c : c.name,
          ),
        )
        .filter((cols: any[]) => cols.length > 0 && cols.every(Boolean))
        .map((cols: string[]) => cols.map(normalizeExpr).sort().join(","));
      const expectedUniqueKeys = new Set([
        ...table.uniqueConstraints.map((u: any) =>
          u.columns
            .map((c: any) => c.name)
            .sort()
            .join(","),
        ),
        ...(table.columns as any[])
          .filter((c) => c.isUnique)
          .map((c) => c.name),
        ...uniqueIndexKeys,
      ]);
      const actualUniqueKeys = new Set(
        actualIndexes
          .filter((i) => i.unique && i.origin !== "pk" && i.columns.length > 0)
          .map((i) => i.columns.map(normalizeExpr).sort().join(",")),
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

      // 外键：列 → 目标表.列 + 级联动作
      const expectedFks = table.foreignKeys.map((fk) => {
        const ref = fk.reference();
        return {
          from: ref.columns[0].name,
          table: getTableConfig(ref.foreignTable as SQLiteTable).name,
          to: ref.foreignColumns[0].name,
          onDelete: normalizeAction(fk.onDelete),
          onUpdate: normalizeAction(fk.onUpdate),
        };
      });
      const actualFks = (await foreignKeysOf(dbm.drizzleDb, tableName)).map(
        (fk) => ({
          from: fk.from,
          table: fk.table,
          to: fk.to ?? "",
          onDelete: normalizeAction(fk.onDelete),
          onUpdate: normalizeAction(fk.onUpdate),
        }),
      );
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
