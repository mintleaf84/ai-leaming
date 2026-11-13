// @vitest-environment node
/**
 * 迁移 / 测试 schema 一致性门禁。
 *
 * 背景：`src/lib/db/test-schema-utils.ts` 里的 DDL 是**手写**的，用于给集成测试
 * 提供内存库。它与 `drizzle/` 里的真实迁移存在双份维护，一旦漂移，内存库测试
 * 永远绿、真实库却会炸（列缺失、默认值不同、外键级联行为不同都会导致这种偏差）。
 *
 * 注：SRS 同步失效**不是**这类漂移导致的 —— 根因是事务内用了全局 `drizzleDb`
 * （见 srs.ts 的 exec 执行器修复）。此处只负责"夹具与迁移一致"。
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { TEST_SCHEMA_SQL } from "../../db/test-schema-utils";

const dbFile = `test-schema-parity-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
let dbm: DbModule;

type ForeignKeyInfo = {
  table: string;
  from: string;
  to: string | null;
  onDelete: string;
  onUpdate: string;
};

type ColumnInfo = {
  name: string;
  type: string;
  notnull: number;
  pk: number;
  dflt: string | null;
};

/**
 * 测试夹具**有意只覆盖核心表**（10 张），其余 27 张仅存在于迁移中。
 * 这里显式列出"允许只存在于迁移"的表，任何**新增**的迁移专属表都会让人
 * 回头确认：是漏进夹具，还是确实与测试无关。
 */
const MIGRATION_ONLY_TABLES = new Set([
  "__drizzle_migrations",
  "admin_logs",
  "ai_challenge_cache",
  "ai_configs",
  "ai_model_routes",
  "ai_quiz_cache",
  "api_audit_logs",
  "api_call_logs",
  "chat_messages",
  "chat_sessions",
  "daily_usage",
  "first_principles_cache",
  "knowledge_cards",
  "mastered_questions",
  "mindmaps",
  "note_tag_relations",
  "note_tags",
  "notes",
  "payment_records",
  "prompt_templates",
  "question_feedback",
  "question_folder_items",
  "question_folders",
  "subscription_plans",
  "text_annotations",
  "textbook_chapters",
  "textbooks",
  "user_subscriptions",
]);

async function columnsOf(db: any, table: string): Promise<ColumnInfo[]> {
  const rows = (await db.all(`PRAGMA table_info(\`${table}\`)`)) as any[];
  return rows.map((r) => ({
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

async function foreignKeysOf(
  db: any,
  table: string,
): Promise<ForeignKeyInfo[]> {
  const rows = (await db.all(`PRAGMA foreign_key_list(\`${table}\`)`)) as any[];
  return rows
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

async function tableNames(db: any): Promise<string[]> {
  const rows = (await db.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  )) as any[];
  return rows.map((r) => String(r.name));
}

describe("迁移与测试 schema 一致性", () => {
  let memory: any;
  let memoryDb: any;

  beforeAll(async () => {
    // 真实迁移（文件库）
    dbm = await import("../../db");
    await dbm.initDatabase();

    // 测试用内存库（手写 DDL）
    memory = createClient({ url: ":memory:" });
    for (const statement of TEST_SCHEMA_SQL.split(";")) {
      if (statement.trim()) await memory.execute(statement);
    }
    memoryDb = drizzle(memory);
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("表集合双向对齐：测试 schema 不得有迁移里没有的表", async () => {
    const migrated = new Set(await tableNames(dbm.drizzleDb));
    const testTables = await tableNames(memoryDb);
    const testOnly = testTables.filter((t) => !migrated.has(t));
    expect(
      testOnly,
      `这些表只存在于测试 schema：${testOnly.join(", ")}`,
    ).toEqual([]);
  });

  it("迁移新增的表必须先登记（MIGRATION_ONLY_TABLES 或补进夹具）", async () => {
    const migrated = await tableNames(dbm.drizzleDb);
    const testTables = new Set(await tableNames(memoryDb));
    const unregistered = migrated.filter(
      (t) => !testTables.has(t) && !MIGRATION_ONLY_TABLES.has(t),
    );
    expect(
      unregistered,
      `这些表只在迁移里且未登记，请确认是否漏进夹具：${unregistered.join(", ")}`,
    ).toEqual([]);
  });

  it("测试 schema 与真实迁移的列、类型、NOT NULL 必须一致", async () => {
    const testTables = await tableNames(memoryDb);
    const drift: string[] = [];

    for (const table of testTables) {
      const inTest = await columnsOf(memoryDb, table);
      const inReal = await columnsOf(dbm.drizzleDb, table);
      if (inReal.length === 0) continue; // 上面那条用例负责报缺失表

      const realMap = new Map(inReal.map((c) => [c.name, c]));
      const testMap = new Map(inTest.map((c) => [c.name, c]));

      for (const col of inReal) {
        if (!testMap.has(col.name)) {
          drift.push(`${table}.${col.name}: 真实库有，测试 schema 缺失`);
          continue;
        }
        const t = testMap.get(col.name)!;
        if (t.type !== col.type) {
          drift.push(
            `${table}.${col.name}: 类型不一致（真实=${col.type}，测试=${t.type}）`,
          );
        }
        if (t.dflt !== col.dflt) {
          drift.push(
            `${table}.${col.name}: 默认值不一致（真实=${col.dflt}，测试=${t.dflt}）`,
          );
        }
        if (t.pk !== col.pk) {
          drift.push(
            `${table}.${col.name}: 主键序号不一致（真实=${col.pk}，测试=${t.pk}）`,
          );
        }
        // 只有「单列 INTEGER 主键」才是 rowid 别名：SQLite 对它忽略 NOT NULL
        // 并允许显式 NULL 自动分配（已实测）。复合主键里的 INTEGER 列不是别名，
        // 必须照常比较可空性。
        const pkColumnCount = inReal.filter((c) => c.pk > 0).length;
        const isRowidAlias =
          pkColumnCount === 1 && col.pk === 1 && col.type === "INTEGER";
        if (!isRowidAlias && t.notnull !== col.notnull) {
          drift.push(
            `${table}.${col.name}: NOT NULL 不一致（真实=${col.notnull}，测试=${t.notnull}）`,
          );
        }
      }
      for (const col of inTest) {
        if (!realMap.has(col.name)) {
          drift.push(`${table}.${col.name}: 测试 schema 有，真实库缺失`);
        }
      }

      // 外键：目标表、列、级联行为必须一致（否则删除行为在两边不同）
      const realFks = await foreignKeysOf(dbm.drizzleDb, table);
      const testFks = await foreignKeysOf(memoryDb, table);
      const realFkKeys = new Set(
        realFks.map(
          (f) => `${f.from}>${f.table}.${f.to}:${f.onDelete}/${f.onUpdate}`,
        ),
      );
      for (const fk of testFks) {
        const key = `${fk.from}>${fk.table}.${fk.to}:${fk.onDelete}/${fk.onUpdate}`;
        if (!realFkKeys.has(key))
          drift.push(`${table}: 外键不一致（测试专有 ${key}）`);
      }
      const testFkKeys = new Set(
        testFks.map(
          (f) => `${f.from}>${f.table}.${f.to}:${f.onDelete}/${f.onUpdate}`,
        ),
      );
      for (const fk of realFks) {
        const key = `${fk.from}>${fk.table}.${fk.to}:${fk.onDelete}/${fk.onUpdate}`;
        if (!testFkKeys.has(key))
          drift.push(`${table}: 外键不一致（真实专有 ${key}）`);
      }
    }

    expect(drift, `schema 漂移：\n${drift.join("\n")}`).toEqual([]);
  });
});
