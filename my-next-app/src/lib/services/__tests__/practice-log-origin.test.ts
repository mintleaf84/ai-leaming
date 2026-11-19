// @vitest-environment node
/**
 * practice_logs 来源/状态语义（P0-2 / P0-3）回归测试（真实 SQLite + 真实迁移）。
 *
 * 线上库快照（2026-11-14）的三条污染路径：
 *   1. 空答案被当成「做错」并进入 FSRS（348 条）；
 *   2. 外部 Agent 导入的对错由调用方判定、服务端不复核，同样进了 SRS；
 *   3. 日志无来源标记，事后无法区分。
 *
 * 约定：
 *   origin = web | agent | import
 *   status = answered | skipped（空答案）| wrong_book（错题本收藏，仅 PDF 导入）
 *   SRS 同步只吃 status='answered' 且 origin != 'agent'。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dbFile = `test-practice-log-origin-${process.pid}.db`;
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

describe("练习日志来源与作答状态", () => {
  beforeAll(async () => {
    dbm = await import("../../db");
    await dbm.initDatabase();
    await dbm.drizzleDb.run(
      "INSERT INTO users (id, username, password_hash) VALUES (1, 'log-origin-tester', 'x')" as never,
    );
    for (const id of [9201, 9202, 9203]) {
      await dbm.drizzleDb.run(
        `INSERT INTO questions (id, content, options, answer, type)
         VALUES (${id}, '测试题 ${id}', '["甲","乙","丙","丁"]', 'B', 'single')` as never,
      );
    }
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("空答案提交 → status=skipped，不建 SRS 卡", async () => {
    const { practiceService } = await import("../practice");
    await practiceService.submitAnswer(1, null, 9201, "   ", false, 1000);

    const log = (await dbm.drizzleDb.all(
      "SELECT origin, status, is_correct FROM practice_logs WHERE question_id=9201" as never,
    )) as unknown as Record<string, unknown>[];
    expect(log[0].origin).toBe("web");
    expect(log[0].status).toBe("skipped");
    expect(await scalar("SELECT count(*) FROM question_srs WHERE question_id=9201")).toBe(0);
  });

  it("正常作答 → status=answered，SRS 建卡", async () => {
    const { practiceService } = await import("../practice");
    await practiceService.submitAnswer(1, null, 9201, "B", true, 2000);

    const rows = (await dbm.drizzleDb.all(
      "SELECT origin, status FROM practice_logs WHERE question_id=9201 ORDER BY id" as never,
    )) as unknown as Record<string, unknown>[];
    expect(rows.at(-1)?.origin).toBe("web");
    expect(rows.at(-1)?.status).toBe("answered");
    expect(await scalar("SELECT count(*) FROM question_srs WHERE question_id=9201")).toBe(1);
  });

  it("Agent 导入 → origin=agent，批量同步不建 SRS", async () => {
    const { importService } = await import("../import-service");
    await importService.importAgentAnswers(1, {
      sessionKey: "agent-origin-test-1",
      answers: [
        { questionId: 9202, userAnswer: "B", isCorrect: true, durationMs: 3000 },
      ],
    });

    const log = (await dbm.drizzleDb.all(
      "SELECT origin, status FROM practice_logs WHERE question_id=9202" as never,
    )) as unknown as Record<string, unknown>[];
    expect(log[0].origin).toBe("agent");
    expect(log[0].status).toBe("answered");

    const { srsService } = await import("../srs");
    await srsService.syncFromPracticeLogs(1);
    expect(await scalar("SELECT count(*) FROM question_srs WHERE question_id=9202")).toBe(0);
  });

  it("skipped 历史日志同样被同步跳过", async () => {
    await dbm.drizzleDb.run(
      `INSERT INTO practice_logs (user_id, question_id, user_answer, is_correct, duration_ms, origin, status)
       VALUES (1, 9203, '', 0, 0, 'import', 'skipped')` as never,
    );
    const { srsService } = await import("../srs");
    await srsService.syncFromPracticeLogs(1);
    expect(await scalar("SELECT count(*) FROM question_srs WHERE question_id=9203")).toBe(0);
  });
});
