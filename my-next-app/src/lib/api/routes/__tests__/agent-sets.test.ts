// @vitest-environment node
/**
 * AI 题集（Agent 推题）集成测试（docs/agent-question-set-plan.md §2–§4.3）。
 *
 * 真实依赖：真实 SQLite（真实迁移）、真实 API Key 鉴权与 JWT 鉴权、真实服务层。
 * 不 mock 数据库，也不 mock 判分（逐题判分必须走 `checkAnswerCorrectness`
 * 的唯一实现 —— 题集练习复用 `POST /practice/session/{id}/submit`）。
 *
 * §4.3 的冻结形状也在断言里钉住：列表 `{data, meta}`、消费侧详情不含
 * answer/explanation、agent 侧详情含答案、结果回流
 * `{setId, summary, items, flagged}`、成卷与试卷详情同形（含 lastAttempt）、
 * 分数 0–1、durationMs 整数毫秒。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { eq } from "drizzle-orm";
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
  getLegacyDb() {
    return testDbHelper.db;
  },
}));

import externalApp from "../external";
import agentSetsApp from "../agent-sets";
import questionsApp from "../questions";
import practiceApp from "../practice";
import examApp from "../exam";
import wrongBookApp from "../wrong-book";

/** 用户 A（题集所有者）与用户 B（跨用户访客） */
const A = 961;
const B = 962;

const ADMIN_KEY = "agent-set-admin-key"; // 绑 A，admin 作用域
const OTHER_ADMIN_KEY = "agent-set-other-admin-key"; // 绑 B，admin 作用域
const GLOBAL_ADMIN_KEY = "agent-set-global-admin-key"; // 未绑 userId（全局 key）

/** Agent 题的标签：隔离/转正的所有断言都按它定位 */
const AGENT_TAG = "agent-考点";

const OPTIONS = ["甲", "乙", "丙", "丁"];

function createRootApp() {
  const root = new Hono();
  root.route("/api/external", externalApp);
  root.route("/api/agent-sets", agentSetsApp);
  root.route("/api/questions", questionsApp);
  root.route("/api/practice", practiceApp);
  root.route("/api/exam", examApp);
  root.route("/api/wrong-book", wrongBookApp);
  return root;
}

async function tokenFor(userId: number): Promise<string> {
  return sign(
    {
      user: {
        id: userId,
        username: `agent-set-user-${userId}`,
        role: "student",
        token_version: 0,
      },
    },
    process.env.JWT_SECRET as string,
    "HS256",
  );
}

function keyHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function jwtHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/** 一道合法的单选题（overrides 用于构造非法条目） */
function agentQuestion(index: number, overrides: Record<string, unknown> = {}) {
  return {
    externalId: `q${index}`,
    content: `AI 出的第 ${index} 道题：下列哪项符合教育法的规定？`,
    options: OPTIONS,
    answer: "A",
    explanation: `第 ${index} 题解析：《教育法》是教育基本法律。`,
    tags: [AGENT_TAG],
    dimension: "knowledge",
    type: "single",
    ...overrides,
  };
}

function batchBody(overrides: Record<string, unknown> = {}) {
  return {
    batchKey: "batch-2026-11-21-a",
    title: "教育法专项（AI 生成）",
    agent: "claude-code",
    model: "test-model",
    promptVersion: "v1",
    targetTags: [AGENT_TAG],
    note: "按你最近的错题出的",
    questions: Array.from({ length: 10 }, (_, i) => agentQuestion(i + 1)),
    ...overrides,
  };
}

// --- §4.3 冻结形状 ---

interface CreateSetBody {
  id: number | null;
  batchKey: string;
  duplicate: boolean;
  questionCount: number;
  dryRun?: boolean;
}

interface AgentSetSummary {
  id: number;
  batchKey: string;
  title: string;
  questionCount: number;
  doneCount: number;
  flaggedCount: number;
  status: string;
}

interface ConsumerSetSummary {
  id: number;
  title: string;
  agent: string | null;
  targetTags: string[];
  questionCount: number;
  pendingCount: number;
  unreadCount: number;
  lastScore: number | null;
  createdAt: string | null;
}

interface ListBody<T> {
  data: T[];
  meta: { limit: number; offset: number; total: number };
}

interface ConsumerQuestion {
  id: number;
  content: string;
  options: string[];
  type: string | null;
  dimension: string | null;
  tags: string[];
  material: string | null;
}

interface ConsumerDetail {
  set: ConsumerSetSummary;
  questions: ConsumerQuestion[];
  flaggedCount: number;
}

interface AgentDetail {
  set: AgentSetSummary;
  questions: Array<{
    id: number;
    position: number | null;
    externalId: string | null;
    answer: string;
    explanation: string | null;
  }>;
}

interface SetResults {
  setId: number;
  summary: {
    answered: number;
    total: number;
    correctRate: number;
    avgDurationMs: number;
    tagBreakdown: Array<{
      tag: string;
      answered: number;
      correctRate: number;
    }>;
  };
  items: Array<{
    questionId: number;
    answered: boolean;
    isCorrect: boolean;
    durationMs: number | null;
    flagged: boolean;
    flagReason: string | null;
  }>;
  flagged: Array<{
    questionId: number;
    content: string;
    reason: string | null;
  }>;
}

interface AttemptBody {
  sessionId: string;
  questions: ConsumerQuestion[];
}

interface PaperDetailBody {
  paper: {
    id: number;
    title: string;
    kind: string;
    source: string;
    totalQuestions: number;
  };
  items: Array<{
    position: number;
    question: { id: number; content: string; options: string[] };
  }>;
  lastAttempt: { sessionId: string; score: number; submittedAt: string } | null;
}

describe("AI 题集：Agent 推题 + 消费侧闭环", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await testDbHelper.seedUser(A, "agent-set-owner");
    await testDbHelper.seedUser(B, "agent-set-intruder");

    await testDbHelper.db.insert(schema.api_keys).values([
      {
        key_string: ADMIN_KEY,
        is_active: 1,
        scopes: "admin",
        user_id: A,
      },
      {
        key_string: OTHER_ADMIN_KEY,
        is_active: 1,
        scopes: "admin",
        user_id: B,
      },
      {
        key_string: GLOBAL_ADMIN_KEY,
        is_active: 1,
        scopes: "admin",
        user_id: null,
      },
    ]);

    // 一道正常题库题：用来对照"题库列表里应该有 import 题、但不应有 agent 题"
    await testDbHelper.db.insert(schema.questions).values({
      content: "正常题库题：教育目的的核心是什么？",
      options: JSON.stringify(OPTIONS),
      answer: "A",
      explanation: "题库题的解析文本。",
      tags: JSON.stringify(["import-考点"]),
      dimension: "knowledge",
      type: "single",
    });
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  type SetRow = typeof schema.agent_question_sets.$inferSelect;
  type QuestionRow = typeof schema.questions.$inferSelect;
  type MasteryRow = typeof schema.user_mastery.$inferSelect;

  async function setRows(): Promise<SetRow[]> {
    return testDbHelper.db.select().from(schema.agent_question_sets);
  }

  async function questionRowsForSet(setId: number): Promise<QuestionRow[]> {
    return testDbHelper.db
      .select()
      .from(schema.questions)
      .where(eq(schema.questions.agent_set_id, setId));
  }

  async function masteryRows(userId: number): Promise<MasteryRow[]> {
    return testDbHelper.db
      .select()
      .from(schema.user_mastery)
      .where(eq(schema.user_mastery.user_id, userId));
  }

  /** 全表题目（隔离断言用）；`testDbHelper.db` 是 any，这里给行类型兜底 */
  async function allQuestionRows(): Promise<QuestionRow[]> {
    return testDbHelper.db.select().from(schema.questions);
  }

  async function postExternalAgent(
    routePath: string,
    body: unknown,
    options: { key?: string; dryRun?: boolean } = {},
  ): Promise<Response> {
    const { key = ADMIN_KEY, dryRun = false } = options;
    return createRootApp().request(
      `/api/external/agent${routePath}${dryRun ? "?dryRun=true" : ""}`,
      {
        method: "POST",
        headers: keyHeaders(key),
        body: JSON.stringify(body),
      },
    );
  }

  async function getExternalAgent(
    routePath: string,
    key = ADMIN_KEY,
  ): Promise<Response> {
    return createRootApp().request(`/api/external/agent${routePath}`, {
      method: "GET",
      headers: keyHeaders(key),
    });
  }

  async function pushBatch(
    overrides: Record<string, unknown> = {},
    options: { key?: string; dryRun?: boolean } = {},
  ): Promise<CreateSetBody> {
    const res = await postExternalAgent(
      "/question-sets",
      batchBody(overrides),
      options,
    );
    expect(res.status, await res.clone().text()).toBe(200);
    return (await res.json()) as CreateSetBody;
  }

  describe("推题：批次的幂等与原子性", () => {
    it("10 题整批落库；同 batchKey 重推 duplicate=true 且不新增", async () => {
      const first = await pushBatch();
      expect(first.duplicate).toBe(false);
      expect(first.questionCount).toBe(10);
      expect(first.id).not.toBeNull();
      expect(first.batchKey).toBe("batch-2026-11-21-a");
      expect(first.dryRun).toBeUndefined();

      const rows = await questionRowsForSet(first.id as number);
      expect(rows).toHaveLength(10);
      expect(rows.every((r) => r.origin === "agent")).toBe(true);
      expect(rows.map((r) => r.agent_position)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);
      // 幂等键按 (userId, batchKey) 命名空间化，不会跨用户撞 external_id
      expect(rows.every((r) => r.external_id?.startsWith(`agent:${A}:`))).toBe(
        true,
      );

      // 重推（内容故意不同：批次不可变，只返回原批次）
      const second = await pushBatch({
        questions: [
          agentQuestion(1, { content: "完全不同的题干内容，长度够" }),
        ],
      });
      expect(second.duplicate).toBe(true);
      expect(second.questionCount).toBe(10);
      expect(second.id).toBe(first.id);

      expect(await setRows()).toHaveLength(1);
      expect(await questionRowsForSet(first.id as number)).toHaveLength(10);
    });

    it("任一条不合法 → 整批 400 且一条都不写（不做部分成功）", async () => {
      const res = await postExternalAgent(
        "/question-sets",
        batchBody({
          questions: [
            agentQuestion(1),
            agentQuestion(2, { answer: "Z" }), // 答案既不是选项也不是合法标号
            agentQuestion(3, { tags: [] }), // 标签至少 1 个
          ],
        }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        issues: string[];
        issueCount: number;
      };
      expect(body.issues.join("\n")).toContain("questions.1.answer");
      expect(body.issues.join("\n")).toContain("questions.2.tags");
      expect(body.issueCount).toBeGreaterThanOrEqual(2);

      expect(await setRows()).toHaveLength(0);
      const all = await allQuestionRows();
      expect(all.filter((q) => q.origin === "agent")).toHaveLength(0);
    });

    it("?dryRun=true 库内零变更，但会报告将新建几道", async () => {
      const body = await pushBatch(
        { batchKey: "batch-dry-run" },
        { dryRun: true },
      );
      expect(body.dryRun).toBe(true);
      expect(body.id).toBeNull();
      expect(body.duplicate).toBe(false);
      expect(body.questionCount).toBe(10);

      expect(await setRows()).toHaveLength(0);
      const all = await allQuestionRows();
      expect(all.filter((q) => q.origin === "agent")).toHaveLength(0);
    });

    it("超过 100 题 → 400（单批上限）", async () => {
      const res = await postExternalAgent(
        "/question-sets",
        batchBody({
          batchKey: "batch-too-many",
          questions: Array.from({ length: 101 }, (_, i) =>
            agentQuestion(i + 1),
          ),
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("100");
      expect(await setRows()).toHaveLength(0);
    });
  });

  describe("隔离：agent 题不进题库/组卷/掌握度，但进错题本", () => {
    it("题库列表（内/外两处）与自动组卷候选都看不到 agent 题", async () => {
      const created = await pushBatch();
      const setId = created.id as number;
      const agentContents = (await questionRowsForSet(setId)).map(
        (q) => q.content,
      );

      // 内部题库列表（JWT）
      const tokenA = await tokenFor(A);
      const innerRes = await createRootApp().request(
        "/api/questions?limit=100",
        { headers: jwtHeaders(tokenA) },
      );
      expect(innerRes.status).toBe(200);
      const inner = (await innerRes.json()) as {
        items: Array<{ content: string }>;
      };
      expect(inner.items.some((q) => q.content.startsWith("正常题库题"))).toBe(
        true,
      );
      for (const content of agentContents) {
        expect(inner.items.some((q) => q.content === content)).toBe(false);
      }

      // 外部题库列表（API Key，admin 即可读）
      const extRes = await createRootApp().request(
        "/api/external/questions?limit=100",
        { headers: keyHeaders(ADMIN_KEY) },
      );
      expect(extRes.status).toBe(200);
      const ext = (await extRes.json()) as { data: Array<{ content: string }> };
      for (const content of agentContents) {
        expect(ext.data.some((q) => q.content === content)).toBe(false);
      }

      // 自动组卷候选：按 agent 题独有的 tag 抽 1 道 → 候选不足 400
      const genRes = await createRootApp().request(
        "/api/exam/papers/generate",
        {
          method: "POST",
          headers: jwtHeaders(tokenA),
          body: JSON.stringify({
            title: "试图从题库抽 AI 题",
            count: 1,
            tags: [AGENT_TAG],
          }),
        },
      );
      expect(genRes.status).toBe(400);
      const genBody = (await genRes.json()) as {
        code?: string;
        available?: number;
      };
      expect(genBody.code).toBe("exam.paper.shortfall");
      expect(genBody.available).toBe(0);
    });

    it("答错后进错题本并带 origin=agent（可辨来源）", async () => {
      const created = await pushBatch();
      const setId = created.id as number;
      const tokenA = await tokenFor(A);

      const started = await createRootApp().request(
        `/api/agent-sets/${setId}/attempts`,
        { method: "POST", headers: jwtHeaders(tokenA), body: "{}" },
      );
      expect(started.status, await started.clone().text()).toBe(200);
      const attempt = (await started.json()) as AttemptBody;
      const first = attempt.questions[0];

      const submitted = await createRootApp().request(
        `/api/practice/session/${attempt.sessionId}/submit`,
        {
          method: "POST",
          headers: jwtHeaders(tokenA),
          body: JSON.stringify({
            questionId: first.id,
            userAnswer: "B", // 正确答案是 A → 答错
            duration: 8000,
          }),
        },
      );
      expect(submitted.status, await submitted.clone().text()).toBe(200);
      expect(
        ((await submitted.json()) as { isCorrect: boolean }).isCorrect,
      ).toBe(false);

      const wrongBook = await createRootApp().request("/api/wrong-book", {
        headers: jwtHeaders(tokenA),
      });
      expect(wrongBook.status).toBe(200);
      const items = (await wrongBook.json()) as Array<{
        questionId: string;
        origin: string;
        questionContent: string;
      }>;
      const row = items.find((item) => item.questionId === String(first.id));
      expect(row).toBeDefined();
      expect(row?.origin).toBe("agent");
      expect(row?.questionContent).toBe(first.content);
    });

    it("agent 题作答不计入掌握度聚合（user_mastery 无该 tag 行）", async () => {
      const created = await pushBatch();
      const setId = created.id as number;
      const tokenA = await tokenFor(A);

      const started = await createRootApp().request(
        `/api/agent-sets/${setId}/attempts`,
        { method: "POST", headers: jwtHeaders(tokenA), body: "{}" },
      );
      const attempt = (await started.json()) as AttemptBody;

      await createRootApp().request(
        `/api/practice/session/${attempt.sessionId}/submit`,
        {
          method: "POST",
          headers: jwtHeaders(tokenA),
          body: JSON.stringify({
            questionId: attempt.questions[0].id,
            userAnswer: "A",
            duration: 5000,
          }),
        },
      );

      const rows = await masteryRows(A);
      expect(rows.some((r) => r.tag_name === AGENT_TAG)).toBe(false);
    });
  });

  describe("做题闭环：attempts → 逐题判分 → results 回流（§4.3 形状）", () => {
    it("逐题对错/耗时正确，summary 聚合正确率与 tag 分布正确", async () => {
      const created = await pushBatch();
      const setId = created.id as number;
      const tokenA = await tokenFor(A);

      const started = await createRootApp().request(
        `/api/agent-sets/${setId}/attempts`,
        { method: "POST", headers: jwtHeaders(tokenA), body: "{}" },
      );
      expect(started.status).toBe(200);
      const attempt = (await started.json()) as AttemptBody;
      expect(attempt.questions).toHaveLength(10);
      // 消费侧：题目不得带答案/解析
      expect(
        (attempt.questions[0] as unknown as { answer?: unknown }).answer,
      ).toBeUndefined();
      expect(
        (attempt.questions[0] as unknown as { explanation?: unknown })
          .explanation,
      ).toBeUndefined();
      // 字段名按 §4.3：id（不是 questionId）
      expect(attempt.questions[0]).toMatchObject({
        id: expect.any(Number),
        content: expect.any(String),
        options: expect.any(Array),
        tags: [AGENT_TAG],
      });

      // 答 3 题：2 对 1 错
      const plan = [
        { question: attempt.questions[0], answer: "A", duration: 4000 },
        { question: attempt.questions[1], answer: "A", duration: 6000 },
        { question: attempt.questions[2], answer: "D", duration: 8000 },
      ];
      const expected = new Map<number, boolean>();
      for (const item of plan) {
        const res = await createRootApp().request(
          `/api/practice/session/${attempt.sessionId}/submit`,
          {
            method: "POST",
            headers: jwtHeaders(tokenA),
            body: JSON.stringify({
              questionId: item.question.id,
              userAnswer: item.answer,
              duration: item.duration,
            }),
          },
        );
        expect(res.status, await res.clone().text()).toBe(200);
        expected.set(item.question.id, item.answer === "A");
      }

      const resultsRes = await getExternalAgent(
        `/question-sets/${setId}/results`,
      );
      expect(resultsRes.status, await resultsRes.clone().text()).toBe(200);
      const results = (await resultsRes.json()) as SetResults;

      expect(results.setId).toBe(setId);
      expect(results.summary).toEqual({
        answered: 3,
        total: 10,
        correctRate: 2 / 3,
        avgDurationMs: 6000,
        tagBreakdown: [{ tag: AGENT_TAG, answered: 3, correctRate: 2 / 3 }],
      });
      expect(results.flagged).toEqual([]);
      expect(results.items).toHaveLength(10);

      for (const item of results.items) {
        if (expected.has(item.questionId)) {
          expect(item.answered).toBe(true);
          expect(item.isCorrect).toBe(expected.get(item.questionId));
          expect(Number.isInteger(item.durationMs)).toBe(true);
        } else {
          expect(item.answered).toBe(false);
          expect(item.durationMs).toBeNull();
        }
      }
    });

    it("消费侧详情不含答案；Agent 侧详情含答案（§4.3）", async () => {
      const created = await pushBatch();
      const setId = created.id as number;
      const tokenA = await tokenFor(A);

      const consumer = await createRootApp().request(
        `/api/agent-sets/${setId}`,
        { headers: jwtHeaders(tokenA) },
      );
      expect(consumer.status).toBe(200);
      const consumerBody = (await consumer.json()) as ConsumerDetail;
      expect(consumerBody.flaggedCount).toBe(0);
      expect(consumerBody.set).toMatchObject({
        id: setId,
        title: "教育法专项（AI 生成）",
        agent: "claude-code",
        targetTags: [AGENT_TAG],
        questionCount: 10,
        pendingCount: 10,
        lastScore: null,
      });
      for (const q of consumerBody.questions) {
        expect(Object.keys(q).sort()).toEqual([
          "content",
          "dimension",
          "id",
          "material",
          "options",
          "tags",
          "type",
        ]);
      }

      const agentSide = await getExternalAgent(`/question-sets/${setId}`);
      expect(agentSide.status).toBe(200);
      const agentBody = (await agentSide.json()) as AgentDetail;
      expect(agentBody.questions.every((q) => q.answer === "A")).toBe(true);
      expect(agentBody.questions.every((q) => q.explanation !== null)).toBe(
        true,
      );
      expect(agentBody.questions[0].externalId).toBe("q1");
      expect(agentBody.set.questionCount).toBe(10);
    });
  });

  describe("报「这题有问题」：移出可用集并回传理由", () => {
    it("flag 后不再出现在可用集/新会话里，results.flagged 含题干与理由", async () => {
      const created = await pushBatch();
      const setId = created.id as number;
      const tokenA = await tokenFor(A);
      const rows = await questionRowsForSet(setId);
      const target = rows.find((r) => r.agent_position === 2);
      expect(target).toBeDefined();

      const flagRes = await createRootApp().request(
        `/api/agent-sets/${setId}/questions/${target?.id}/flag`,
        {
          method: "POST",
          headers: jwtHeaders(tokenA),
          body: JSON.stringify({ reason: "答案给错了，应为 C" }),
        },
      );
      expect(flagRes.status, await flagRes.clone().text()).toBe(200);
      expect(await flagRes.json()).toEqual({
        questionId: target?.id,
        flagged: true,
        remaining: 9,
      });

      // 幂等：重复标记不报错，理由不被覆盖
      const again = await createRootApp().request(
        `/api/agent-sets/${setId}/questions/${target?.id}/flag`,
        {
          method: "POST",
          headers: jwtHeaders(tokenA),
          body: JSON.stringify({ reason: "第二次说法" }),
        },
      );
      expect(again.status).toBe(200);
      expect(await again.json()).toMatchObject({ remaining: 9 });

      // 新会话不含该题
      const started = await createRootApp().request(
        `/api/agent-sets/${setId}/attempts`,
        { method: "POST", headers: jwtHeaders(tokenA), body: "{}" },
      );
      expect(started.status).toBe(200);
      const attempt = (await started.json()) as AttemptBody;
      expect(attempt.questions).toHaveLength(9);
      expect(attempt.questions.some((q) => q.id === target?.id)).toBe(false);

      const results = (await (
        await getExternalAgent(`/question-sets/${setId}/results`)
      ).json()) as SetResults;
      expect(results.flagged).toEqual([
        {
          questionId: target?.id,
          content: target?.content,
          reason: "答案给错了，应为 C",
        },
      ]);
      expect(
        results.items.find((item) => item.questionId === target?.id),
      ).toMatchObject({ flagged: true, flagReason: "答案给错了，应为 C" });

      const detail = (await (
        await createRootApp().request(`/api/agent-sets/${setId}`, {
          headers: jwtHeaders(tokenA),
        })
      ).json()) as ConsumerDetail;
      expect(detail.flaggedCount).toBe(1);
      expect(detail.questions).toHaveLength(9);
      expect(detail.questions.some((q) => q.id === target?.id)).toBe(false);
      // questionCount = 批次原始题量（含 flagged）：Web 端
      // 「已做 = questionCount − pendingCount − flaggedCount」依赖这个口径
      expect(detail.set).toMatchObject({
        questionCount: 10,
        pendingCount: 9,
      });
    });
  });

  describe("一键成卷与转正", () => {
    it("成卷：与试卷详情同形（含 lastAttempt），可走 exam 流程开始作答", async () => {
      const created = await pushBatch();
      const setId = created.id as number;
      const tokenA = await tokenFor(A);
      const rows = await questionRowsForSet(setId);

      // 先标记一道，成卷只应取剩下 9 道
      await createRootApp().request(
        `/api/agent-sets/${setId}/questions/${rows[0].id}/flag`,
        {
          method: "POST",
          headers: jwtHeaders(tokenA),
          body: JSON.stringify({}),
        },
      );

      const paperRes = await createRootApp().request(
        `/api/agent-sets/${setId}/paper`,
        {
          method: "POST",
          headers: jwtHeaders(tokenA),
          body: JSON.stringify({
            title: "AI 题集成卷",
            kind: "timed",
            durationMinutes: 20,
          }),
        },
      );
      expect(paperRes.status, await paperRes.clone().text()).toBe(200);
      const paperBody = (await paperRes.json()) as PaperDetailBody;
      expect(paperBody.paper.source).toBe("agent");
      expect(paperBody.paper.kind).toBe("timed");
      expect(paperBody.paper.totalQuestions).toBe(9);
      expect(paperBody.items).toHaveLength(9);
      // 与 GET /exam/papers/{id} 同形：items 带 position + question 预览
      expect(paperBody.items[0]).toMatchObject({
        position: 1,
        question: {
          id: expect.any(Number),
          content: expect.any(String),
          options: expect.any(Array),
        },
      });
      expect(
        paperBody.items.some((item) => item.question.id === rows[0].id),
      ).toBe(false);
      expect(paperBody.lastAttempt).toBeNull();

      // 复用 exam 流程开始作答
      const started = await createRootApp().request(
        `/api/exam/papers/${paperBody.paper.id}/attempts`,
        { method: "POST", headers: jwtHeaders(tokenA), body: "{}" },
      );
      expect(started.status, await started.clone().text()).toBe(200);
      const attempt = (await started.json()) as {
        sessionId: string;
        questions: Array<{ id: number }>;
      };
      expect(attempt.questions).toHaveLength(9);
    });

    it("转正：进题库列表与组卷候选，掌握度开始计入", async () => {
      const created = await pushBatch();
      const setId = created.id as number;
      const tokenA = await tokenFor(A);
      const rows = await questionRowsForSet(setId);
      const normalId = rows.find((r) => r.agent_position === 1)?.id as number;

      // 转正前：题库列表没有它
      const before = (await (
        await createRootApp().request("/api/questions?limit=100", {
          headers: jwtHeaders(tokenA),
        })
      ).json()) as { items: Array<{ id: number }> };
      expect(before.items.some((q) => q.id === normalId)).toBe(false);

      const promoteRes = await createRootApp().request(
        `/api/agent-sets/${setId}/promote`,
        { method: "POST", headers: jwtHeaders(tokenA), body: "{}" },
      );
      expect(promoteRes.status, await promoteRes.clone().text()).toBe(200);
      expect(await promoteRes.json()).toEqual({
        setId,
        promoted: true,
        promotedCount: 10,
      });

      // 转正后：题库列表有它
      const after = (await (
        await createRootApp().request("/api/questions?limit=100", {
          headers: jwtHeaders(tokenA),
        })
      ).json()) as { items: Array<{ id: number }> };
      expect(after.items.some((q) => q.id === normalId)).toBe(true);

      // 组卷候选：现在能按该 tag 抽到题
      const genRes = await createRootApp().request(
        "/api/exam/papers/generate",
        {
          method: "POST",
          headers: jwtHeaders(tokenA),
          body: JSON.stringify({
            title: "转正后组卷",
            count: 1,
            tags: [AGENT_TAG],
          }),
        },
      );
      expect(genRes.status, await genRes.clone().text()).toBe(200);

      // 转正后详情仍可读（不 404）：status='promoted'，questions 仍含该 set 的题
      const promotedDetail = await createRootApp().request(
        `/api/agent-sets/${setId}`,
        { headers: jwtHeaders(tokenA) },
      );
      expect(promotedDetail.status).toBe(200);
      const promotedBody = (await promotedDetail.json()) as ConsumerDetail;
      expect(promotedBody.set).toMatchObject({
        id: setId,
        questionCount: 10,
        pendingCount: 10,
        lastScore: null,
      });
      expect(promotedBody.questions).toHaveLength(10);
      expect(promotedBody.questions.some((q) => q.id === normalId)).toBe(true);
      expect(promotedBody.flaggedCount).toBe(0);

      // 题集已转正 → 不能再开会话（409）；转正后它就是普通题，走普通练习
      const started = await createRootApp().request(
        `/api/agent-sets/${setId}/attempts`,
        { method: "POST", headers: jwtHeaders(tokenA), body: "{}" },
      );
      expect(started.status).toBe(409);

      const practiceSession = await createRootApp().request(
        "/api/practice/session",
        {
          method: "POST",
          headers: jwtHeaders(tokenA),
          body: JSON.stringify({ mode: "tag", tag: AGENT_TAG, limit: 1 }),
        },
      );
      expect(practiceSession.status, await practiceSession.clone().text()).toBe(
        200,
      );
      const session = (await practiceSession.json()) as {
        sessionId: string;
        questions: Array<{ id: number }>;
      };
      expect(session.sessionId).not.toBe("");

      const submit = await createRootApp().request(
        `/api/practice/session/${session.sessionId}/submit`,
        {
          method: "POST",
          headers: jwtHeaders(tokenA),
          body: JSON.stringify({
            questionId: session.questions[0].id,
            userAnswer: "A",
            duration: 4000,
          }),
        },
      );
      expect(submit.status, await submit.clone().text()).toBe(200);

      const rows2 = await masteryRows(A);
      expect(rows2.some((r) => r.tag_name === AGENT_TAG)).toBe(true);
    });
  });

  describe("列表与跨用户、作用域", () => {
    it("打开即已读：GET 详情后 unreadCount 归零（幂等写），列表只读不写", async () => {
      const created = await pushBatch();
      const setId = created.id as number;
      const tokenA = await tokenFor(A);

      const listOnce = async () =>
        (await (
          await createRootApp().request("/api/agent-sets?limit=20", {
            headers: jwtHeaders(tokenA),
          })
        ).json()) as ListBody<ConsumerSetSummary>;

      // 列表是只读的：连读两次都不该把未读清掉
      expect((await listOnce()).data[0].unreadCount).toBe(10);
      expect((await listOnce()).data[0].unreadCount).toBe(10);

      // 打开详情 = 已读：响应里 unreadCount 已经归零（写在前、算在后）
      const detail = await createRootApp().request(`/api/agent-sets/${setId}`, {
        headers: jwtHeaders(tokenA),
      });
      expect(detail.status).toBe(200);
      expect(((await detail.json()) as ConsumerDetail).set.unreadCount).toBe(0);

      // 列表随之归零
      expect((await listOnce()).data[0].unreadCount).toBe(0);

      // 再打开一次：幂等，不报错、仍为 0
      const again = await createRootApp().request(`/api/agent-sets/${setId}`, {
        headers: jwtHeaders(tokenA),
      });
      expect(again.status).toBe(200);
      expect(((await again.json()) as ConsumerDetail).set.unreadCount).toBe(0);

      // read_at 已落库（不是靠响应里临时算的）
      const [row] = await testDbHelper.db
        .select()
        .from(schema.agent_question_sets)
        .where(eq(schema.agent_question_sets.id, setId));
      expect(row.read_at).not.toBeNull();
    });

    it("列表一律 {data, meta}（消费侧含未读/待做/最近成绩；agent 侧含 done/flagged）", async () => {
      const created = await pushBatch();
      const setId = created.id as number;
      const tokenA = await tokenFor(A);

      const consumerList = await createRootApp().request(
        "/api/agent-sets?limit=20&offset=0",
        { headers: jwtHeaders(tokenA) },
      );
      expect(consumerList.status).toBe(200);
      const consumerBody =
        (await consumerList.json()) as ListBody<ConsumerSetSummary>;
      expect(consumerBody.meta).toEqual({ limit: 20, offset: 0, total: 1 });
      expect(consumerBody.data[0]).toMatchObject({
        id: setId,
        title: "教育法专项（AI 生成）",
        agent: "claude-code",
        targetTags: [AGENT_TAG],
        questionCount: 10,
        pendingCount: 10,
        unreadCount: 10,
        lastScore: null,
      });

      // 分页夹取（§4.3）：limit 上限 100、offset 下限 0，meta 回显实际值
      const clamped = (await (
        await createRootApp().request("/api/agent-sets?limit=500&offset=-3", {
          headers: jwtHeaders(tokenA),
        })
      ).json()) as ListBody<ConsumerSetSummary>;
      expect(clamped.meta).toEqual({ limit: 100, offset: 0, total: 1 });

      const agentList = await getExternalAgent("/question-sets?limit=20");
      expect(agentList.status).toBe(200);
      const agentBody = (await agentList.json()) as ListBody<AgentSetSummary>;
      expect(agentBody.meta).toEqual({ limit: 20, offset: 0, total: 1 });
      expect(agentBody.data[0]).toMatchObject({
        id: setId,
        batchKey: "batch-2026-11-21-a",
        questionCount: 10,
        doneCount: 0,
        flaggedCount: 0,
        status: "active",
      });

      // 做 1 题后：doneCount=1、pendingCount=9、unreadCount=0、lastScore=1
      const started = await createRootApp().request(
        `/api/agent-sets/${setId}/attempts`,
        { method: "POST", headers: jwtHeaders(tokenA), body: "{}" },
      );
      const attempt = (await started.json()) as AttemptBody;
      await createRootApp().request(
        `/api/practice/session/${attempt.sessionId}/submit`,
        {
          method: "POST",
          headers: jwtHeaders(tokenA),
          body: JSON.stringify({
            questionId: attempt.questions[0].id,
            userAnswer: "A",
            duration: 3000,
          }),
        },
      );

      const afterConsumer = (await (
        await createRootApp().request("/api/agent-sets", {
          headers: jwtHeaders(tokenA),
        })
      ).json()) as ListBody<ConsumerSetSummary>;
      expect(afterConsumer.data[0]).toMatchObject({
        pendingCount: 9,
        unreadCount: 0,
        lastScore: 1,
      });

      const afterAgent = (await (
        await getExternalAgent("/question-sets")
      ).json()) as ListBody<AgentSetSummary>;
      expect(afterAgent.data[0].doneCount).toBe(1);
    });

    it("他人题集 / 结果 / 归档 / 成卷 / 报错一律 404，且不改 A 的数据", async () => {
      const created = await pushBatch();
      const setId = created.id as number;
      const tokenB = await tokenFor(B);
      const agentQuestionId = (await questionRowsForSet(setId))[0].id;

      // 列表能读（B 自己的），但里面不出现 A 的题集
      const listB = await createRootApp().request("/api/agent-sets", {
        headers: jwtHeaders(tokenB),
      });
      expect(listB.status).toBe(200);
      const listBody = (await listB.json()) as ListBody<ConsumerSetSummary>;
      expect(listBody.data.some((set) => set.id === setId)).toBe(false);

      // 详情 / 尝试 / 报错 / 转正 / 成卷：全部 404
      const intruderCalls: Array<[string, string, unknown?]> = [
        [`/api/agent-sets/${setId}`, "GET"],
        [`/api/agent-sets/${setId}/attempts`, "POST"],
        [
          `/api/agent-sets/${setId}/questions/${agentQuestionId}/flag`,
          "POST",
          { reason: "越权标记" },
        ],
        [`/api/agent-sets/${setId}/promote`, "POST"],
        [`/api/agent-sets/${setId}/paper`, "POST"],
      ];
      for (const [routePath, method, body] of intruderCalls) {
        const res = await createRootApp().request(routePath, {
          method,
          headers: jwtHeaders(tokenB),
          ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
        });
        expect(res.status, `${method} ${routePath}`).toBe(404);
      }

      // Agent 侧：B 的 admin key 读 A 的题集 / 结果 → 404
      expect(
        (await getExternalAgent(`/question-sets/${setId}`, OTHER_ADMIN_KEY))
          .status,
      ).toBe(404);
      expect(
        (
          await getExternalAgent(
            `/question-sets/${setId}/results`,
            OTHER_ADMIN_KEY,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await postExternalAgent(
            `/question-sets/${setId}/archive`,
            {},
            { key: OTHER_ADMIN_KEY },
          )
        ).status,
      ).toBe(404);

      // A 的数据没被 B 改坏
      const rows: SetRow[] = await testDbHelper.db
        .select()
        .from(schema.agent_question_sets)
        .where(eq(schema.agent_question_sets.id, setId));
      expect(rows[0].status).toBe("active");
      const q = (await questionRowsForSet(setId)).find(
        (row) => row.id === agentQuestionId,
      );
      expect(q?.origin).toBe("agent");
    });

    it("admin key 未绑定 userId（全局 key）→ 403", async () => {
      const createRes = await postExternalAgent("/question-sets", batchBody(), {
        key: GLOBAL_ADMIN_KEY,
      });
      expect(createRes.status).toBe(403);
      expect(await createRes.text()).toContain("绑定用户");

      const listRes = await getExternalAgent(
        "/question-sets",
        GLOBAL_ADMIN_KEY,
      );
      expect(listRes.status).toBe(403);

      // 任何数据都没写
      expect(await setRows()).toHaveLength(0);
    });

    it("read/write 作用域的 key 不能写题集（需要 admin）", async () => {
      await testDbHelper.db.insert(schema.api_keys).values([
        {
          key_string: "agent-set-read-key",
          is_active: 1,
          scopes: "read",
          user_id: A,
        },
        {
          key_string: "agent-set-write-key",
          is_active: 1,
          scopes: "write",
          user_id: A,
        },
      ]);

      for (const key of ["agent-set-read-key", "agent-set-write-key"]) {
        const res = await postExternalAgent("/question-sets", batchBody(), {
          key,
        });
        expect(res.status, key).toBe(403);
      }
      expect(await setRows()).toHaveLength(0);
    });
  });
});
