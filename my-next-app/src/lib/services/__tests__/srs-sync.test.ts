// @vitest-environment node
/**
 * SRS 同步回归测试（真实 SQLite + 真实迁移）
 *
 * 背景：drizzle 对自增主键会显式写入 NULL（`values (null, ...)`），依赖 SQLite
 * 「INTEGER PRIMARY KEY 为 NULL 时自动分配 rowid」的语义。但 0004 建表时把
 * question_srs.id 写成了 `NOT NULL`，导致每次 upsert 都报 NOT NULL constraint
 * failed；该错误被 syncFromPracticeLogs 的逐题 try/catch 吞掉，最后整个事务以
 * SQLITE_BUSY 回滚 —— SRS 同步长期静默失效。迁移 0010 重建表修掉。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dbFile = `test-srs-sync-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
type SrsModule = typeof import("../srs");

let dbm: DbModule;
let srsService: SrsModule["srsService"];

describe("SRS 同步（真实 SQLite）", () => {
  beforeAll(async () => {
    dbm = await import("../../db");
    await dbm.initDatabase();
    await dbm.drizzleDb.run(
      "INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (1, 'srs-tester', 'x')" as any,
    );
    await dbm.drizzleDb.run(
      `INSERT OR IGNORE INTO questions (id, content, options, answer, type, external_id)
       VALUES (901, '测试题目：1+1=?', '["A. 1","B. 2"]', 'B', 'single', 'srs-ext-901')` as any,
    );
    await dbm.drizzleDb.run(
      `INSERT OR IGNORE INTO practice_sessions (id, user_id, session_name, practice_mode)
       VALUES ('sess-srs-1', 1, 'SRS 同步测试', 'import')` as any,
    );
    await dbm.drizzleDb.run(
      `INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms, timestamp)
       VALUES ('sess-srs-1', 1, 901, 'B', 1, 5000, '2026-11-10 10:00:00')` as any,
    );
    srsService = (await import("../srs")).srsService;
  });

  afterAll(() => {
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("迁移 0010 后 question_srs.id 可接受 NULL（自增语义）", async () => {
    const cols = (await dbm.drizzleDb.all(
      "PRAGMA table_info(question_srs)" as any,
    )) as any[];
    const idCol = cols.find((c) => c.name === "id");
    expect(idCol).toBeTruthy();
    // notnull = 0：SQLite 才能在显式 NULL 时分配 rowid
    expect(Number(idCol.notnull)).toBe(0);
  });

  it("syncFromPracticeLogs 真正写入 SRS，而不是被静默回滚", async () => {
    const synced = await srsService.syncFromPracticeLogs(1);
    expect(synced).toBeGreaterThanOrEqual(1);

    const rows = (await dbm.drizzleDb.all(
      "SELECT id, user_id, question_id, reps, state, due_date FROM question_srs WHERE user_id = 1 AND question_id = 901" as any,
    )) as any[];
    expect(rows.length).toBe(1);
    expect(Number(rows[0].reps)).toBeGreaterThanOrEqual(1);
    // 必须是 updateQuestionSrs 写入的 ISO 时间（形如 2026-11-10T10:00:00.000Z），
    // 而不是建表默认值 CURRENT_TIMESTAMP（形如 2026-11-10 10:00:00）
    expect(String(rows[0].due_date)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // 自增主键由 SQLite 分配，而不是 0/NULL
    expect(Number(rows[0].id)).toBeGreaterThan(0);
  });

  it("卡片生成之后的新作答仍会被回放（不会被永久跳过）", async () => {
    const before = (await dbm.drizzleDb.all(
      "SELECT reps FROM question_srs WHERE user_id = 1 AND question_id = 901" as any,
    )) as any[];
    const beforeReps = Number(before[0].reps);

    await dbm.drizzleDb.run(
      `INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms, timestamp)
       VALUES ('sess-srs-1', 1, 901, 'A', 0, 7000, '2026-11-11 09:00:00')` as any,
    );
    await srsService.syncFromPracticeLogs(1);

    const after = (await dbm.drizzleDb.all(
      "SELECT reps, lapses FROM question_srs WHERE user_id = 1 AND question_id = 901" as any,
    )) as any[];
    // 新日志被回放到已有卡片上（FSRS 的 lapses 只在 Relearning 阶段累加，
    // 故这里以 reps 增长作为"确实又复习了一次"的判据）
    expect(Number(after[0].reps)).toBeGreaterThan(beforeReps);
  });

  it("再次同步同一批日志不产生重复卡片（唯一约束 + upsert）", async () => {
    await srsService.syncFromPracticeLogs(1);
    const rows = (await dbm.drizzleDb.all(
      "SELECT COUNT(*) AS c FROM question_srs WHERE user_id = 1 AND question_id = 901" as any,
    )) as any[];
    expect(Number(rows[0].c)).toBe(1);
  });
});
