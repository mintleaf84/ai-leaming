// @vitest-environment node
/**
 * 错题本两处口径的回归测试（真实 SQLite + 真实迁移）。
 *
 * 为什么不用 mock：这两条都是 SQL 语义问题，mock 只能验证调用形状。
 *
 * 1. `lastWrongAnswerSql` 的相关子查询里，内层 `practice_logs` 与外层同名。
 *    不给内层起别名时，drizzle 把 `${practice_logs.question_id}` 渲染成
 *    `"practice_logs"."question_id"`，SQLite 解析到**内层**表，条件退化成自身比较
 *    —— 于是每道题的 `userLastAnswer` 都是该用户任意一题的最新错答。
 * 2. `markAsMastered` 的 upsert 无条件写 `note`，路由「重新标记已掌握」会把
 *    已有备注清成 NULL；迁移前路由自己的 upsert 只刷 `mastered_at`。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dbFile = `test-wrong-book-last-answer-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
let dbm: DbModule;

/** 9401/9402 两道错题，最近一次错答分别是 C / A —— 若子查询退化，两题会拿到同一个值 */
const QUESTIONS = [
  { id: 9401, answer: "B", tags: '["宪法"]' },
  { id: 9402, answer: "D", tags: '["民法"]' },
];

describe("错题本：最近错答子查询 与 掌握标记不丢备注", () => {
  beforeAll(async () => {
    dbm = await import("../../db");
    await dbm.initDatabase();
    await dbm.drizzleDb.run(
      "INSERT INTO users (id, username, password_hash) VALUES (1, 'wrong-book-regression', 'x')" as never,
    );
    for (const q of QUESTIONS) {
      await dbm.drizzleDb.run(
        `INSERT INTO questions (id, content, options, answer, explanation, type, tags, dimension)
         VALUES (${q.id}, '错题回归 ${q.id}', '["甲","乙","丙","丁"]', '${q.answer}', '解析占位内容', 'single', '${q.tags}', 'knowledge')` as never,
      );
    }
    // 两题各错一次，时间戳不同：先 9401 错 C，后 9402 错 A
    await dbm.drizzleDb.run(
      `INSERT INTO practice_logs (user_id, question_id, user_answer, is_correct, duration_ms, timestamp)
       VALUES (1, 9401, 'C', 0, 3000, '2026-01-01 10:00:00')` as never,
    );
    await dbm.drizzleDb.run(
      `INSERT INTO practice_logs (user_id, question_id, user_answer, is_correct, duration_ms, timestamp)
       VALUES (1, 9402, 'A', 0, 3000, '2026-01-02 10:00:00')` as never,
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

  it("userLastAnswer 按题目各自取最近一次错答，而不是取到别的题", async () => {
    const { wrongQuestionService } = await import("../wrong-question");
    const rows = await wrongQuestionService.listWrongBook(1);

    const byId = new Map(rows.map((r) => [String(r.questionId), r]));
    expect(byId.get("9401")?.userLastAnswer).toBe("C");
    expect(byId.get("9402")?.userLastAnswer).toBe("A");
  });

  it("重新标记已掌握时保留已有备注", async () => {
    const { wrongQuestionService } = await import("../wrong-question");

    await wrongQuestionService.markAsMastered(1, 9401, "易混淆：宪法与法律");
    // 路由「重新标记已掌握」不带备注
    await wrongQuestionService.markAsMastered(1, 9401);

    const rows = (await dbm.drizzleDb.all(
      "SELECT note FROM mastered_questions WHERE user_id = 1 AND question_id = 9401" as never,
    )) as unknown as Array<{ note: string | null }>;
    expect(rows[0].note).toBe("易混淆：宪法与法律");
  });
});
