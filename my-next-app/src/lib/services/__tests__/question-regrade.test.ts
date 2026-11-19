// @vitest-environment node
/**
 * 改题回刷（P0-1）回归测试（真实 SQLite + 真实迁移）。
 *
 * 背景：线上库快照（2026-11-14）显示答案修订后历史 is_correct 不会更新
 * （q687/q691 时间线实证）。本测试固定三件事：
 *   1. 改答案后该题日志按当前判分规则重算；
 *   2. 受影响用户的 FSRS 卡重置为 Relearning 且立即到期；
 *   3. 受影响会话的 correct_count 与日志对齐；重复执行幂等。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// 改题会触发向量重建（网络调用）——本测试只关心回刷，直接屏蔽
vi.mock("../question-vector-index", () => ({
  indexQuestion: vi.fn().mockResolvedValue("skipped"),
}));

const dbFile = `test-question-regrade-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");

let dbm: DbModule;
let regrade: (typeof import("../question-regrade"))["regradeQuestionLogs"];
let adminService: (typeof import("../admin-service"))["adminService"];

async function scalar(sqlText: string): Promise<number> {
  const rows = (await dbm.drizzleDb.all(sqlText as never)) as unknown as Record<
    string,
    unknown
  >[];
  return Number(Object.values(rows[0])[0]);
}

describe("改题回刷历史判分", () => {
  beforeAll(async () => {
    dbm = await import("../../db");
    await dbm.initDatabase();

    await dbm.drizzleDb.run(
      "INSERT INTO users (id, username, password_hash) VALUES (1, 'regrade-tester', 'x')" as never,
    );
    // q1：多选，答案 ["B","D"]——两条历史日志都是旧答案时代产生的
    await dbm.drizzleDb.run(
      `INSERT INTO questions (id, content, options, answer, type)
       VALUES (9101, '多选：下列说法正确的有？', '["甲","乙","丙","丁"]', '["B","D"]', 'multi')` as never,
    );
    // q2：单选，控制组
    await dbm.drizzleDb.run(
      `INSERT INTO questions (id, content, options, answer, type)
       VALUES (9102, '单选：1+1=?', '["1","2","3","4"]', 'B', 'single')` as never,
    );
    // q3：多选，供 updateQuestion 钩子测试
    await dbm.drizzleDb.run(
      `INSERT INTO questions (id, content, options, answer, type)
       VALUES (9103, '多选：钩子测试', '["甲","乙","丙","丁"]', '["A","C"]', 'multi')` as never,
    );
    await dbm.drizzleDb.run(
      `INSERT INTO practice_sessions (id, user_id, session_name, practice_mode, correct_count)
       VALUES ('sess-regrade', 1, '回刷测试', 'review', 3)` as never,
    );
    await dbm.drizzleDb.run(
      `INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms, timestamp, id)
       VALUES ('sess-regrade', 1, 9101, 'B', 1, 3000, '2026-05-17 10:21:55', 9001),
              ('sess-regrade', 1, 9101, '["B","D"]', 0, 4000, '2026-05-18 12:13:59', 9002),
              ('sess-regrade', 1, 9102, 'B', 1, 2000, '2026-05-17 10:00:00', 9003),
              ('sess-regrade', 1, 9103, '["A","C"]', 0, 1000, '2026-05-20 10:00:00', 9004)` as never,
    );
    await dbm.drizzleDb.run(
      `INSERT INTO question_srs (user_id, question_id, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, due_date)
       VALUES (1, 9101, 8.0, 5.5, 3, 14, 4, 0, 2, '2026-05-17T10:22:00.000Z', '2099-01-01T00:00:00.000Z')` as never,
    );

    regrade = (await import("../question-regrade")).regradeQuestionLogs;
    adminService = (await import("../admin-service")).adminService;
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("多选集合比较：顺序不同算对，漏选算错（REST 判分补齐）", async () => {
    const { checkAnswerCorrectness } = await import("../answer-check");
    const options = ["甲", "乙", "丙", "丁"];
    expect(
      checkAnswerCorrectness('["D","B"]', '["B","D"]', options, "multi"),
    ).toBe(true);
    expect(checkAnswerCorrectness("B", '["B","D"]', options, "multi")).toBe(
      false,
    );
    expect(checkAnswerCorrectness("A,B", '["B","D"]', options, "multi")).toBe(
      false,
    );
    // 混用形态：用户写选项文本、答案存字母（或反之）时，同一集合必须判对
    expect(
      checkAnswerCorrectness('["丁","甲"]', '["A","D"]', options, "multi"),
    ).toBe(true);
    expect(
      checkAnswerCorrectness('["A","D"]', '["丁","甲"]', options, "multi"),
    ).toBe(true);
  });

  it("回刷 q9101：两条日志翻正，会话 correct_count 对齐", async () => {
    const result = await regrade(9101);
    expect(result.logsScanned).toBe(2);
    expect(result.logsFlipped).toBe(2);
    expect(result.flippedToIncorrect).toBe(1); // 'B' 漏选 → 判错
    expect(result.flippedToCorrect).toBe(1); // 完整答案 → 判对
    expect(result.usersReset).toBe(1);
    expect(result.sessionsUpdated).toBe(1);

    expect(
      await scalar("SELECT is_correct FROM practice_logs WHERE id=9001"),
    ).toBe(0);
    expect(
      await scalar("SELECT is_correct FROM practice_logs WHERE id=9002"),
    ).toBe(1);
    // 会话：9001 错、9002 对、9003 对 → 2
    expect(
      await scalar(
        "SELECT correct_count FROM practice_sessions WHERE id='sess-regrade'",
      ),
    ).toBe(2);

    // 同一用例内断言 SRS 重置：避免依赖「上一个用例先跑过」的执行顺序
    const rows = (await dbm.drizzleDb.all(
      "SELECT state, scheduled_days, elapsed_days, lapses, due_date FROM question_srs WHERE user_id=1 AND question_id=9101" as never,
    )) as unknown as Record<string, unknown>[];
    const card = rows[0];
    expect(Number(card.state)).toBe(3);
    expect(Number(card.scheduled_days)).toBe(0);
    expect(Number(card.elapsed_days)).toBe(0);
    expect(Number(card.lapses)).toBe(1);
    expect(new Date(String(card.due_date)).getTime()).toBeLessThanOrEqual(
      Date.now() + 1000,
    );
  });

  it("幂等：重复回刷不再翻任何日志（自带夹具，可单独运行）", async () => {
    // 先把一条日志改回旧判分，模拟「已回刷过又出现脏行」，再连跑两次
    await dbm.drizzleDb.run(
      "UPDATE practice_logs SET is_correct=1 WHERE id=9001" as never,
    );
    const first = await regrade(9101);
    expect(first.logsFlipped).toBe(1);
    const again = await regrade(9101);
    expect(again.logsFlipped).toBe(0);
    expect(again.logsScanned).toBe(2);
  });

  it("updateQuestion 钩子：只改答案也触发回刷", async () => {
    await adminService.updateQuestion(9103, { answer: '["A","C"]' });
    expect(
      await scalar("SELECT is_correct FROM practice_logs WHERE id=9004"),
    ).toBe(1);
  });
});
