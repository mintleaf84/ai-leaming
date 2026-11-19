// @vitest-environment node
/**
 * 兜底题重复清理（P1-1 存量）：dry-run / apply / 幂等（真实 SQLite + 真实迁移）。
 *
 * 线上库事实：80 条兜底题与真实题同题干；20 条被刷过（22 条日志/20 张 SRS），
 * 4 个用户同题双卡；4 条无副本。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dbFile = `test-dedupe-cleanup-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
let dbm: DbModule;

async function scalar(sqlText: string): Promise<number> {
  const rows = (await dbm.drizzleDb.all(sqlText as never)) as unknown as Record<
    string,
    unknown
  >[];
  return Number(Object.values(rows[0])[0]);
}

describe("兜底题重复清理", () => {
  beforeAll(async () => {
    dbm = await import("../../db");
    await dbm.initDatabase();
    await dbm.drizzleDb.run(
      "INSERT INTO users (id, username, password_hash) VALUES (1, 'cleanup-1', 'x'), (2, 'cleanup-2', 'x')" as never,
    );
    // 兜底题 9301（type NULL）与真实题 9302（multi）同题干
    await dbm.drizzleDb.run(
      `INSERT INTO questions (id, content, options, answer, type, source)
       VALUES (9301, '清理测试题干', '["甲","乙"]', '甲', NULL, NULL),
              (9302, '清理测试题干', '["甲","乙"]', '["甲","乙"]', 'multi', NULL),
              (9303, '孤本兜底题干', '["A","B"]', 'A', NULL, NULL)` as never,
    );
    await dbm.drizzleDb.run(
      `INSERT INTO practice_logs (user_id, question_id, user_answer, is_correct, duration_ms)
       VALUES (1, 9301, '甲', 1, 100), (2, 9301, '乙', 0, 200), (1, 9302, '["甲","乙"]', 1, 300),
              (1, 9303, 'A', 1, 400)` as never,
    );
    // 用户 1 同题双卡（9301 reps=2 / 9302 reps=5）；用户 2 只有兜底题卡
    await dbm.drizzleDb.run(
      `INSERT INTO question_srs (user_id, question_id, stability, difficulty, reps, lapses, state, last_review, due_date)
       VALUES (1, 9301, 1, 5, 2, 0, 2, '2026-05-01T00:00:00.000Z', '2026-05-02T00:00:00.000Z'),
              (1, 9302, 4, 5, 5, 0, 2, '2026-05-10T00:00:00.000Z', '2026-05-11T00:00:00.000Z'),
              (2, 9301, 1, 5, 1, 0, 2, '2026-05-03T00:00:00.000Z', '2026-05-04T00:00:00.000Z')` as never,
    );
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("dry-run 只统计、不写库", async () => {
    const { dedupeFallbackQuestions } =
      await import("../question-dedupe-cleanup");
    const report = await dedupeFallbackQuestions({ dryRun: true });
    expect(report.fallbackPairs).toBe(1);
    expect(report.orphanFallbacks).toBe(1);
    expect(report.logsMoved).toBe(2);
    expect(report.srsMoved).toBe(1);
    expect(report.srsMerged).toBe(1);
    expect(report.deletedQuestions).toBe(1);
    expect(report.markedFallback).toBe(1);

    expect(await scalar("SELECT count(*) FROM questions WHERE id=9301")).toBe(
      1,
    );
    expect(
      await scalar("SELECT count(*) FROM practice_logs WHERE question_id=9301"),
    ).toBe(2);
  });

  it("apply：日志合并、SRS 去重、删兜底题、孤本打标记", async () => {
    const { dedupeFallbackQuestions } =
      await import("../question-dedupe-cleanup");
    const report = await dedupeFallbackQuestions({ dryRun: false });
    expect(report.deletedQuestions).toBe(1);

    expect(await scalar("SELECT count(*) FROM questions WHERE id=9301")).toBe(
      0,
    );
    // 2 条兜底题日志 + 原真实题 1 条 = 3 条，全部指向真实题
    expect(
      await scalar("SELECT count(*) FROM practice_logs WHERE question_id=9302"),
    ).toBe(3);
    // 用户 1：保留 reps=5 的卡；用户 2：兜底卡迁移到真实题
    expect(
      await scalar("SELECT count(*) FROM question_srs WHERE question_id=9301"),
    ).toBe(0);
    expect(
      await scalar(
        "SELECT reps FROM question_srs WHERE question_id=9302 AND user_id=1",
      ),
    ).toBe(5);
    expect(
      await scalar(
        "SELECT count(*) FROM question_srs WHERE question_id=9302 AND user_id=2",
      ),
    ).toBe(1);
    // 孤本打标
    expect(
      await scalar(
        "SELECT count(*) FROM questions WHERE id=9303 AND source='fallback'",
      ),
    ).toBe(1);
    // content_hash 已回填
    expect(
      await scalar("SELECT count(*) FROM questions WHERE content_hash IS NULL"),
    ).toBe(0);
  });

  it("幂等：再次执行不再删除/迁移", async () => {
    const { dedupeFallbackQuestions } =
      await import("../question-dedupe-cleanup");
    const again = await dedupeFallbackQuestions({ dryRun: false });
    expect(again.deletedQuestions).toBe(0);
    expect(again.logsMoved).toBe(0);
    expect(again.srsMoved).toBe(0);
    expect(again.srsMerged).toBe(0);
    expect(again.markedFallback).toBe(0);
    expect(again.remainingDuplicateGroups).toBe(0);
  });
});
