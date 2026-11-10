// @vitest-environment node
/**
 * 答题提交链路（真实 SQLite + 真实迁移）。
 *
 * 一次 submitAnswer 会写三处：practice_logs、practice_sessions 统计、user_mastery。
 * 这条链路是"练习 → 掌握度 → 抽题"的数据源头，之前没有真实库测试覆盖。
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- 直接执行原始 SQL 并断言未类型化行 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dbFile = `test-practice-answer-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
let dbm: DbModule;
let practiceService: (typeof import("../practice"))["practiceService"];

async function scalar(sqlText: string): Promise<number> {
  const rows = (await dbm.drizzleDb.all(sqlText as any)) as any[];
  return Number(Object.values(rows[0])[0]);
}

describe("答题提交（真实 SQLite）", () => {
  beforeAll(async () => {
    dbm = await import("../../db");
    await dbm.initDatabase();
    practiceService = (await import("../practice")).practiceService;

    await dbm.drizzleDb.run(
      "INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (1, 'answer-tester', 'x')" as any,
    );
    await dbm.drizzleDb.run(
      `INSERT OR IGNORE INTO questions (id, content, options, answer, explanation, tags, dimension, type, external_id)
       VALUES (701, '测试题：光合作用的场所', '["A. 线粒体","B. 叶绿体"]', 'B', '解析', '["细胞","代谢"]', 'knowledge', 'single', 'ans-ext-701')` as any,
    );
    await dbm.drizzleDb.run(
      `INSERT OR IGNORE INTO practice_sessions (id, user_id, session_name, total_questions, correct_count, practice_mode)
       VALUES ('sess-answer-1', 1, '答题测试', 2, 0, 'random')` as any,
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

  it("答对一次：写入日志、会话正确数 +1、两个标签的掌握度各 +1 次", async () => {
    await practiceService.submitAnswer(
      1,
      "sess-answer-1",
      701,
      "B",
      true,
      4000,
    );

    expect(
      await scalar(
        "SELECT COUNT(*) AS c FROM practice_logs WHERE session_id='sess-answer-1'",
      ),
    ).toBe(1);
    expect(
      await scalar(
        "SELECT correct_count AS c FROM practice_sessions WHERE id='sess-answer-1'",
      ),
    ).toBe(1);

    const mastery = (await dbm.drizzleDb.all(
      "SELECT tag_name, correct_count, total_count, score FROM user_mastery WHERE user_id=1 ORDER BY tag_name" as any,
    )) as any[];
    expect(mastery.length).toBe(2);
    for (const row of mastery) {
      expect(Number(row.correct_count)).toBe(1);
      expect(Number(row.total_count)).toBe(1);
      expect(Number(row.score)).toBe(100);
    }
  });

  it("答错一次：会话正确数不变，掌握度总数 +1、正确数不变、分数变 50", async () => {
    await practiceService.submitAnswer(
      1,
      "sess-answer-1",
      701,
      "A",
      false,
      9000,
    );

    expect(
      await scalar(
        "SELECT correct_count AS c FROM practice_sessions WHERE id='sess-answer-1'",
      ),
    ).toBe(1);
    const [row] = (await dbm.drizzleDb.all(
      "SELECT correct_count, total_count, score FROM user_mastery WHERE user_id=1 AND tag_name='细胞'" as any,
    )) as any[];
    expect(Number(row.correct_count)).toBe(1);
    expect(Number(row.total_count)).toBe(2);
    expect(Number(row.score)).toBeCloseTo(50, 5);
  });

  it("答题日志按 session 聚合，不会写进别的会话", async () => {
    expect(
      await scalar("SELECT COUNT(*) AS c FROM practice_logs WHERE user_id=1"),
    ).toBe(2);
    expect(
      await scalar(
        "SELECT COUNT(*) AS c FROM practice_logs WHERE session_id <> 'sess-answer-1'",
      ),
    ).toBe(0);
  });
});
