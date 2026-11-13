// @vitest-environment node
/**
 * P3a：agent 导入答题记录（POST /api/external/practice/answers）
 *
 * 真实 SQLite（真实迁移）+ 真实鉴权中间件，不 mock SQL 也不 mock service：
 * 幂等/事务/掌握度这类契约只有真跑一遍库才算验证过（docs/engineering.md 规则三）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { setupTestDb, type TestDbHelper } from "@/lib/__tests__/test-db-utils";
import * as schema from "@/lib/db/drizzle-schema";

let testDbHelper: TestDbHelper;

vi.mock("@/lib/db", () => ({
  get drizzleDb() {
    return testDbHelper.db;
  },
  get drizzleSchema() {
    return schema;
  },
}));

import externalApp from "../external";

/**
 * 挂到 `/api/external` 下再请求，与生产挂载点一致
 * （审计里记录的 path 因此是 `/api/external/practice/answers`）。
 */
const API_PREFIX = "/api/external";
const ANSWERS_PATH = `${API_PREFIX}/practice/answers`;

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, externalApp);
  return root;
}

const WRITE_USER_ID = 7;
const OTHER_USER_ID = 8;

/** 造两把 key：user A 的 write key、user A 的 read key */
async function seedKeys() {
  await testDbHelper.seedUser(WRITE_USER_ID, "agent-writer");
  await testDbHelper.seedUser(OTHER_USER_ID, "other-user");
  await testDbHelper.db.insert(schema.api_keys).values([
    {
      key_string: "write-key",
      is_active: 1,
      scopes: "write",
      user_id: WRITE_USER_ID,
    },
    {
      key_string: "read-key",
      is_active: 1,
      scopes: "read",
      user_id: WRITE_USER_ID,
    },
  ]);
}

/** 造 3 道题：q1(历史) / q2(地理) / q3(历史+地理) */
async function seedQuestions() {
  const rows = await testDbHelper.db
    .insert(schema.questions)
    .values([
      {
        content: "秦朝统一六国的年份？",
        options: JSON.stringify(["A", "B"]),
        answer: "A",
        tags: JSON.stringify(["历史"]),
        type: "single",
      },
      {
        content: "长江发源于哪座山脉？",
        options: JSON.stringify(["A", "B"]),
        answer: "B",
        tags: JSON.stringify(["地理"]),
        type: "single",
      },
      {
        content: "丝绸之路的起点？",
        options: JSON.stringify(["A", "B"]),
        answer: "A",
        tags: JSON.stringify(["历史", "地理"]),
        type: "single",
      },
    ])
    .returning({ id: schema.questions.id });
  return (rows as Array<{ id: number }>).map((r) => r.id);
}

function postAnswers(body: unknown, key: string | null = "write-key") {
  return createRootApp().request(ANSWERS_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function countOf(table: any): Promise<number> {
  const rows = (await testDbHelper.db.select().from(table)) as unknown[];
  return rows.length;
}

async function masteryOf(userId: number, tag: string) {
  const rows = await testDbHelper.db
    .select()
    .from(schema.user_mastery)
    .where(
      and(
        eq(schema.user_mastery.user_id, userId),
        eq(schema.user_mastery.tag_name, tag),
      ),
    );
  return rows[0];
}

describe("POST /api/external/practice/answers（agent 导入答题记录）", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await seedKeys();
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  describe("正常导入", () => {
    it("写入会话 + 逐题日志，并按 tags 累加掌握度", async () => {
      const [q1, q2, q3] = await seedQuestions();

      const res = await postAnswers({
        sessionKey: "agent-run-normal",
        sessionName: "由 agent 导入",
        answers: [
          {
            questionId: q1,
            userAnswer: "A",
            isCorrect: true,
            durationMs: 9000,
          },
          {
            questionId: q2,
            userAnswer: "A",
            isCorrect: false,
            durationMs: 7000,
          },
          {
            questionId: q3,
            userAnswer: "A",
            isCorrect: true,
            durationMs: 5000,
          },
        ],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ inserted: 3, duplicated: false });
      expect(typeof body.sessionId).toBe("string");

      // 会话行：practice_mode=import、source_key 带 agent: 前缀、计数正确
      const sessions = await testDbHelper.db
        .select()
        .from(schema.practice_sessions);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        id: body.sessionId,
        user_id: WRITE_USER_ID,
        session_name: "由 agent 导入",
        source_key: "agent:agent-run-normal",
        practice_mode: "import",
        total_questions: 3,
        correct_count: 2,
        total_duration_ms: 21000,
      });
      // 存纯 id 数组：getSessionById 只对「数字/字符串数组」走 id 分支
      expect(JSON.parse(sessions[0].questions_json as string)).toEqual([
        q1,
        q2,
        q3,
      ]);

      // 逐题日志
      const logs = (await testDbHelper.db
        .select()
        .from(schema.practice_logs)) as Array<
        typeof schema.practice_logs.$inferSelect
      >;
      expect(logs).toHaveLength(3);
      expect(logs.map((l) => l.question_id).sort((a, b) => a - b)).toEqual(
        [q1, q2, q3].sort((a, b) => a - b),
      );
      expect(logs.every((l) => l.user_id === WRITE_USER_ID)).toBe(true);
      expect(logs.every((l) => l.session_id === body.sessionId)).toBe(true);
      expect(logs.find((l) => l.question_id === q2)).toMatchObject({
        is_correct: false,
        duration_ms: 7000,
      });

      // 掌握度：历史 = q1 + q3（都对 → 2/2），地理 = q2(错) + q3(对) → 1/2
      expect(await masteryOf(WRITE_USER_ID, "历史")).toMatchObject({
        correct_count: 2,
        total_count: 2,
        score: 100,
      });
      expect(await masteryOf(WRITE_USER_ID, "地理")).toMatchObject({
        correct_count: 1,
        total_count: 2,
        score: 50,
      });
    });

    it("sessionName 省略时使用默认名", async () => {
      const [q1] = await seedQuestions();
      const res = await postAnswers({
        sessionKey: "agent-run-default-name",
        answers: [{ questionId: q1, userAnswer: "A", isCorrect: true }],
      });
      expect(res.status).toBe(200);
      const sessions = await testDbHelper.db
        .select()
        .from(schema.practice_sessions);
      expect(sessions[0].session_name).toBe("由 agent 导入");
    });
  });

  describe("幂等（sessionKey）", () => {
    it("同一 sessionKey 重复提交：duplicated=true、inserted=0、日志与掌握度不再增长", async () => {
      const [q1, q2] = await seedQuestions();
      const payload = {
        sessionKey: "agent-run-idem",
        answers: [
          { questionId: q1, userAnswer: "A", isCorrect: true },
          { questionId: q2, userAnswer: "A", isCorrect: false },
        ],
      };

      const first = await postAnswers(payload);
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody.duplicated).toBe(false);

      const logsAfterFirst = await countOf(schema.practice_logs);
      const masteryAfterFirst = await masteryOf(WRITE_USER_ID, "历史");

      const second = await postAnswers(payload);
      expect(second.status).toBe(200);
      const secondBody = await second.json();
      expect(secondBody).toMatchObject({
        sessionId: firstBody.sessionId, // 复用既有会话
        inserted: 0,
        duplicated: true,
      });

      // 没有新增任何行
      expect(await countOf(schema.practice_sessions)).toBe(1);
      expect(await countOf(schema.practice_logs)).toBe(logsAfterFirst);
      expect(await masteryOf(WRITE_USER_ID, "历史")).toEqual(masteryAfterFirst);
    });

    it("不同 sessionKey 是两次独立导入（不误判重复）", async () => {
      const [q1] = await seedQuestions();
      const body = (sessionKey: string) => ({
        sessionKey,
        answers: [{ questionId: q1, userAnswer: "A", isCorrect: true }],
      });

      expect((await postAnswers(body("agent-run-a"))).status).toBe(200);
      expect((await postAnswers(body("agent-run-b"))).status).toBe(200);

      expect(await countOf(schema.practice_sessions)).toBe(2);
      expect(await countOf(schema.practice_logs)).toBe(2);
      expect(await masteryOf(WRITE_USER_ID, "历史")).toMatchObject({
        correct_count: 2,
        total_count: 2,
      });
    });
  });

  describe("权限", () => {
    it("write key 之外读接口仍可读（read 守卫是兜底，不是上限）", async () => {
      const res = await createRootApp().request(`${API_PREFIX}/questions`, {
        headers: { Authorization: "Bearer write-key" },
      });
      expect(res.status).toBe(200);
    });

    it("read key → 403", async () => {
      const [q1] = await seedQuestions();
      const res = await postAnswers(
        {
          sessionKey: "agent-run-read-key",
          answers: [{ questionId: q1, isCorrect: true }],
        },
        "read-key",
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("write");
      // 越权请求不得写入任何数据
      expect(await countOf(schema.practice_sessions)).toBe(0);
      expect(await countOf(schema.practice_logs)).toBe(0);
    });

    it("无 key → 401", async () => {
      const [q1] = await seedQuestions();
      const res = await postAnswers(
        {
          sessionKey: "agent-run-anon",
          answers: [{ questionId: q1, isCorrect: true }],
        },
        null,
      );
      expect(res.status).toBe(401);
      expect(await countOf(schema.practice_sessions)).toBe(0);
    });

    it("无效 key → 401", async () => {
      const [q1] = await seedQuestions();
      const res = await postAnswers(
        {
          sessionKey: "agent-run-bad-key",
          answers: [{ questionId: q1, isCorrect: true }],
        },
        "not-a-real-key",
      );
      expect(res.status).toBe(401);
    });
  });

  describe("题目校验", () => {
    it("存在不存在的 questionId → 400，且没有任何行落库（事务回滚）", async () => {
      const [q1] = await seedQuestions();
      const res = await postAnswers({
        sessionKey: "agent-run-invalid",
        answers: [
          { questionId: q1, userAnswer: "A", isCorrect: true },
          { questionId: 999999, userAnswer: "A", isCorrect: false },
        ],
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.invalidQuestionIds).toEqual([999999]);
      expect(body.error).toContain("999999");

      // 关键：整批拒绝，不能留下"半截会话"或部分日志/掌握度
      expect(await countOf(schema.practice_sessions)).toBe(0);
      expect(await countOf(schema.practice_logs)).toBe(0);
      expect(await countOf(schema.user_mastery)).toBe(0);
    });

    it("非法 ID 只回前 5 个，避免响应体过大", async () => {
      const res = await postAnswers({
        sessionKey: "agent-run-many-invalid",
        answers: Array.from({ length: 8 }, (_, i) => ({
          questionId: 900000 + i,
          isCorrect: true,
        })),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.invalidQuestionIds).toHaveLength(5);
      expect(body.invalidQuestionIds[0]).toBe(900000);
      expect(await countOf(schema.practice_sessions)).toBe(0);
    });

    it("请求体不合法（answers 为空 / 缺 sessionKey）→ 400", async () => {
      const emptyAnswers = await postAnswers({
        sessionKey: "agent-run-empty",
        answers: [],
      });
      expect(emptyAnswers.status).toBe(400);

      const missingKey = await postAnswers({
        answers: [{ questionId: 1, isCorrect: true }],
      });
      expect(missingKey.status).toBe(400);

      expect(await countOf(schema.practice_sessions)).toBe(0);
    });
  });

  describe("跨用户", () => {
    /**
     * 题库（questions 表）在本项目里是**全局共享**的，没有 user_id 列，
     * 因此"不可见的题目"唯一形态就是"题库里不存在"。
     * 这里验证：A 的 key 提交一个不属于 A 的数据集（不存在的 id）时整批拒绝，
     * 且 A / B 两侧都不会落任何行 —— 不会把别人的题目 id 悄悄记到自己名下。
     */
    it("A 的 key 提交不属于自己的 questionId → 400，A/B 均无落库", async () => {
      const [q1] = await seedQuestions();
      // B 名下有一条历史导入记录，用于确认跨用户不会串写
      await testDbHelper.db.insert(schema.practice_sessions).values({
        id: "session-of-b",
        user_id: OTHER_USER_ID,
        session_name: "B 的历史会话",
        total_questions: 1,
      });

      const res = await postAnswers({
        sessionKey: "agent-run-cross-user",
        answers: [
          { questionId: q1, isCorrect: true },
          { questionId: 424242, isCorrect: true }, // 题库中不存在
        ],
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.invalidQuestionIds).toEqual([424242]);

      // A 没有任何新会话；B 只有那条预置会话
      const sessions = await testDbHelper.db
        .select()
        .from(schema.practice_sessions);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].user_id).toBe(OTHER_USER_ID);
      expect(await countOf(schema.practice_logs)).toBe(0);
      expect(await countOf(schema.user_mastery)).toBe(0);
    });
  });

  describe("审计（api_audit_logs）", () => {
    it("成功请求记一条 path=/api/external/practice/answers、status=200、key_id 正确", async () => {
      const [q1] = await seedQuestions();

      const res = await postAnswers({
        sessionKey: "agent-run-audit",
        answers: [{ questionId: q1, userAnswer: "A", isCorrect: true }],
      });
      expect(res.status).toBe(200);

      const [keyRow] = await testDbHelper.db
        .select()
        .from(schema.api_keys)
        .where(eq(schema.api_keys.key_string, "write-key"));

      // 审计走 after()（测试环境退化为即时异步），稍等它落库
      await vi.waitFor(async () => {
        const rows = await testDbHelper.db.select().from(schema.api_audit_logs);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          key_id: keyRow.id,
          user_id: WRITE_USER_ID,
          method: "POST",
          path: ANSWERS_PATH,
          status: 200,
        });
      });
    });

    it("越权（read key 403）也留痕；匿名（401）不记", async () => {
      const [q1] = await seedQuestions();
      const body = {
        sessionKey: "agent-run-audit-403",
        answers: [{ questionId: q1, isCorrect: true }],
      };

      expect((await postAnswers(body, "read-key")).status).toBe(403);
      expect((await postAnswers(body, null)).status).toBe(401);

      await vi.waitFor(async () => {
        const rows = await testDbHelper.db.select().from(schema.api_audit_logs);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          method: "POST",
          path: ANSWERS_PATH,
          status: 403,
          user_id: WRITE_USER_ID,
        });
      });
    });
  });
});
