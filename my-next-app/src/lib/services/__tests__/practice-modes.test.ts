// @vitest-environment node
/**
 * §31 离线作答服务端重判 + §32 tag/wrong 练习模式（真实 SQLite + 真实迁移）。
 *
 * 为什么不用 mock DB：这两条都是「写库 + 判分」的关键路径，mock 只能验证
 * 调用形状，验证不了「客户端传 true 究竟落了什么值」「掌握题有没有被排除」。
 *
 * 用例与验收条款一一对应：
 *   - 客户端 isCorrect=true 但答案错 → 入库 is_correct=0，regraded=1
 *   - 客户端 isCorrect=false 但答案对 → 入库 is_correct=1，regraded=1
 *   - 一致 → regraded=0
 *   - 幂等重发同 sessionKey → duplicated、不再写日志、regraded=0
 *   - 含不存在 questionId → InvalidQuestionIdsError（路由层映射 400）
 *   - tag 模式只出该 tag 的题且不含已掌握；wrong 模式只出做错过的题；无匹配回空
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dbFile = `test-practice-modes-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
let dbm: DbModule;

async function rows(sqlText: string): Promise<Record<string, unknown>[]> {
  return (await dbm.drizzleDb.all(sqlText as never)) as unknown as Record<
    string,
    unknown
  >[];
}

async function count(sqlText: string): Promise<number> {
  const r = await rows(sqlText);
  return Number(Object.values(r[0])[0]);
}

// 9301 宪法/法律（用户已答对）、9302 民法（答错过）、9303 宪法（答错过但已掌握）、
// 9304 民法（没做过）、9311/9312 供离线回传判分用
const QUESTIONS: Array<{
  id: number;
  tags: string;
  answer: string;
  type: string;
}> = [
  { id: 9301, tags: '["宪法","法律"]', answer: "B", type: "single" },
  { id: 9302, tags: '["民法"]', answer: "A", type: "single" },
  { id: 9303, tags: '["宪法"]', answer: "C", type: "single" },
  { id: 9304, tags: '["民法"]', answer: "D", type: "single" },
  { id: 9311, tags: '["宪法"]', answer: "B", type: "single" },
  { id: 9312, tags: '["民法"]', answer: '["甲","丙"]', type: "multi" },
];

describe("§31/§32 离线作答重判与 tag/wrong 练习模式", () => {
  beforeAll(async () => {
    dbm = await import("../../db");
    await dbm.initDatabase();
    await dbm.drizzleDb.run(
      "INSERT INTO users (id, username, password_hash) VALUES (1, 'practice-modes-tester', 'x')" as never,
    );
    for (const q of QUESTIONS) {
      await dbm.drizzleDb.run(
        `INSERT INTO questions (id, content, options, answer, explanation, type, tags, dimension)
         VALUES (${q.id}, '模式测试题 ${q.id}', '["甲","乙","丙","丁"]', '${q.answer}', '解析占位内容', '${q.type}', '${q.tags}', 'knowledge')` as never,
      );
    }
    // 9301 答对过；9302 答错过；9303 答错过但已标记掌握
    await dbm.drizzleDb.run(
      `INSERT INTO practice_logs (user_id, question_id, user_answer, is_correct, duration_ms)
       VALUES (1, 9301, 'B', 1, 3000)` as never,
    );
    await dbm.drizzleDb.run(
      `INSERT INTO practice_logs (user_id, question_id, user_answer, is_correct, duration_ms)
       VALUES (1, 9302, 'C', 0, 3000)` as never,
    );
    await dbm.drizzleDb.run(
      `INSERT INTO practice_logs (user_id, question_id, user_answer, is_correct, duration_ms)
       VALUES (1, 9303, 'A', 0, 3000)` as never,
    );
    await dbm.drizzleDb.run(
      "INSERT INTO mastered_questions (user_id, question_id) VALUES (1, 9303)" as never,
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

  describe("§32 tag 模式", () => {
    it("只出该 tag 的题，且排除已掌握", async () => {
      const { practiceService } = await import("../practice");
      const result = await practiceService.createTagSession(1, "宪法", 10);

      const ids = result.questions.map((q) => q.id).sort();
      // 9303 同 tag 但已掌握 → 排除；9311 未掌握 → 在
      expect(ids).toEqual([9301, 9311]);
      expect(result.sessionId).not.toBe("");

      const session = await rows(
        `SELECT practice_mode FROM practice_sessions WHERE id = '${result.sessionId}'`,
      );
      expect(session[0].practice_mode).toBe("tag");
    });

    it("tag 不存在时返回空会话而不是报错", async () => {
      const { practiceService } = await import("../practice");
      const result = await practiceService.createTagSession(
        1,
        "不存在的知识点",
      );

      expect(result.questions).toEqual([]);
      expect(result.sessionId).toBe("");
    });

    it("tag 与已掌握集合都为同一用户口径（别人的掌握不影响本人）", async () => {
      await dbm.drizzleDb.run(
        "INSERT INTO users (id, username, password_hash) VALUES (2, 'other-user', 'x')" as never,
      );
      const { practiceService } = await import("../practice");
      const result = await practiceService.createTagSession(2, "宪法", 10);

      expect(result.questions.map((q) => q.id).sort()).toEqual([
        9301, 9303, 9311,
      ]);
    });
  });

  describe("§32 wrong 模式", () => {
    it("只出做错过的题，且排除已掌握", async () => {
      const { practiceService } = await import("../practice");
      const result = await practiceService.createWrongSession(1, 10);

      // 9302 答错过；9303 答错过但已掌握 → 排除；9301 一直答对 → 不出
      expect(result.questions.map((q) => q.id)).toEqual([9302]);
      expect(result.sessionId).not.toBe("");

      const session = await rows(
        `SELECT practice_mode FROM practice_sessions WHERE id = '${result.sessionId}'`,
      );
      expect(session[0].practice_mode).toBe("wrong");
    });

    it("会话行可被 getSessionById 复原（questions_json 存对象）", async () => {
      const { practiceService } = await import("../practice");
      const created = await practiceService.createWrongSession(1, 10);
      const loaded = await practiceService.getSessionById(1, created.sessionId);

      expect(loaded?.questions.map((q) => q.id)).toEqual([9302]);
      expect(loaded?.practiceMode).toBe("wrong");
    });

    it("没有任何错题时返回空会话", async () => {
      const { practiceService } = await import("../practice");
      const result = await practiceService.createWrongSession(2, 10);

      expect(result.questions).toEqual([]);
      expect(result.sessionId).toBe("");
    });
  });

  describe("§31 离线作答服务端重判", () => {
    it("客户端传 isCorrect=true 但答案错 → 入库 0 且 regraded=1", async () => {
      const { importService } = await import("../import-service");
      const result = await importService.importAgentAnswers(1, {
        sessionKey: "regrade-wrong-1",
        answers: [
          { questionId: 9311, userAnswer: "A", isCorrect: true, durationMs: 0 },
        ],
      });

      expect(result.inserted).toBe(1);
      expect(result.regraded).toBe(1);
      expect(result.duplicated).toBe(false);

      const logs = await rows(
        "SELECT is_correct FROM practice_logs WHERE question_id = 9311",
      );
      expect(Number(logs[0].is_correct)).toBe(0);

      // 会话正确数同样按服务端判分统计
      const session = await rows(
        `SELECT correct_count, total_questions FROM practice_sessions WHERE id = '${result.sessionId}'`,
      );
      expect(Number(session[0].correct_count)).toBe(0);
      expect(Number(session[0].total_questions)).toBe(1);
    });

    it("客户端传 isCorrect=false 但答案对 → 入库 1 且 regraded=1", async () => {
      const { importService } = await import("../import-service");
      const result = await importService.importAgentAnswers(1, {
        sessionKey: "regrade-correct-1",
        answers: [
          {
            questionId: 9311,
            userAnswer: "B",
            isCorrect: false,
            durationMs: 0,
          },
        ],
      });

      expect(result.regraded).toBe(1);
      const logs = await rows(
        "SELECT is_correct FROM practice_logs WHERE question_id = 9311 ORDER BY id DESC",
      );
      expect(Number(logs[0].is_correct)).toBe(1);
    });

    it("客户端判定与服务端一致时 regraded=0", async () => {
      const { importService } = await import("../import-service");
      const result = await importService.importAgentAnswers(1, {
        sessionKey: "regrade-consistent-1",
        answers: [
          { questionId: 9311, userAnswer: "B", isCorrect: true, durationMs: 0 },
        ],
      });

      expect(result.regraded).toBe(0);
      expect(result.inserted).toBe(1);
    });

    it("多选按集合口径重判（选项顺序不同也算对）", async () => {
      const { importService } = await import("../import-service");
      const result = await importService.importAgentAnswers(1, {
        sessionKey: "regrade-multi-1",
        answers: [
          {
            // 正确答案是 ["甲","丙"]，客户端给的是标号且顺序不同
            questionId: 9312,
            userAnswer: '["C","A"]',
            isCorrect: false,
            durationMs: 0,
          },
        ],
      });

      expect(result.regraded).toBe(1);
      const logs = await rows(
        "SELECT is_correct FROM practice_logs WHERE question_id = 9312",
      );
      expect(Number(logs[0].is_correct)).toBe(1);
    });

    it("幂等重发同 sessionKey 不重复计数", async () => {
      const { importService } = await import("../import-service");
      const payload = {
        sessionKey: "regrade-idempotent-1",
        answers: [
          { questionId: 9311, userAnswer: "A", isCorrect: true, durationMs: 0 },
        ],
      };

      const first = await importService.importAgentAnswers(1, payload);
      expect(first.duplicated).toBe(false);
      expect(first.regraded).toBe(1);

      const before = await count(
        "SELECT count(*) FROM practice_logs WHERE question_id = 9311",
      );

      const second = await importService.importAgentAnswers(1, payload);
      expect(second.duplicated).toBe(true);
      expect(second.inserted).toBe(0);
      expect(second.regraded).toBe(0);

      expect(
        await count(
          "SELECT count(*) FROM practice_logs WHERE question_id = 9311",
        ),
      ).toBe(before);
    });

    it("含不存在的 questionId 仍整批拒绝", async () => {
      const { importService, InvalidQuestionIdsError } =
        await import("../import-service");
      await expect(
        importService.importAgentAnswers(1, {
          sessionKey: "regrade-missing-1",
          answers: [
            {
              questionId: 999999,
              userAnswer: "A",
              isCorrect: true,
              durationMs: 0,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(InvalidQuestionIdsError);

      expect(
        await count(
          "SELECT count(*) FROM practice_sessions WHERE source_key = 'agent:regrade-missing-1'",
        ),
      ).toBe(0);
    });
  });
});
