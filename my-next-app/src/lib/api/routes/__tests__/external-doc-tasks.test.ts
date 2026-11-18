// @vitest-environment node
/**
 * AI-native 计划 P1 的验收：**4 个「文档任务」端到端跑通**。
 *
 * 只通过 `/api/external/*` 完成，不碰服务层、不碰数据库函数 —— 等价于"关掉浏览器、
 * 只给 agent 一份 docs/api.md 和一把 key"。任务实现见 `scripts/doc-tasks/tasks.ts`
 * （同一份实现也被 MCP 验收脚本复用，所以这里绿 = 两条通道的执行逻辑一致）。
 *
 * 真实 SQLite（真实迁移）+ 真实鉴权 + 真实服务层；只有 fixture 是直接写库造的。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { setupTestDb, type TestDbHelper } from "@/lib/__tests__/test-db-utils";
import * as schema from "@/lib/db/drizzle-schema";
import {
  reviewLoop,
  runDocTasks,
  type ApiRequest,
  type DocTaskFixtures,
} from "../../../../../scripts/doc-tasks/tasks";

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

const API_PREFIX = "/api/external";
const USER_ID = 61;
const API_KEY = "doc-tasks-key";

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, externalApp);
  return root;
}

/** 把 HTTP 形状收敛成 `ApiRequest`：任务代码因此不依赖 fetch 也不依赖 app 实例 */
const request: ApiRequest = async (method, path, body) => {
  const res = await createRootApp().request(`${API_PREFIX}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${API_KEY}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed = await res.json().catch(() => null);
  return { status: res.status, body: parsed };
};

const fixtures: DocTaskFixtures = {
  sessionKey: "doc-task-session-1",
  answers: [],
  deckKey: "deck-doc-task",
  cardId: "c-doc-task",
  cardPrompt: "教育活动的两个基本要素是什么？",
  typed: "教育目的 教育方法",
};

let questionIds: number[] = [];

async function seed() {
  await testDbHelper.seedUser(USER_ID, "doc-tasks-user");
  await testDbHelper.db.insert(schema.api_keys).values({
    key_string: API_KEY,
    is_active: 1,
    scopes: "write",
    user_id: USER_ID,
  });

  const inserted = await testDbHelper.db
    .insert(schema.questions)
    .values([
      {
        content: "我国教育领域的基本法律是哪一部？",
        options: JSON.stringify(["《教育法》", "《教师法》", "《义务教育法》"]),
        answer: "A",
        explanation: "《教育法》是教育领域的基本法律。",
        tags: JSON.stringify(["教育法规"]),
        type: "single",
        dimension: "knowledge",
      },
      {
        content: "皮亚杰认知发展理论的第四个阶段是？",
        options: JSON.stringify(["感知运动", "前运算", "具体运算", "形式运算"]),
        answer: "D",
        explanation: "形式运算阶段大约从 11 岁开始。",
        tags: JSON.stringify(["教育心理学"]),
        type: "single",
        dimension: "understanding",
      },
      {
        content: "德育过程的基本矛盾是什么？",
        options: JSON.stringify(["社会道德要求与受教育者现有水平的矛盾"]),
        answer: "A",
        explanation: "这是德育过程的基本矛盾。",
        tags: JSON.stringify(["教育学"]),
        type: "single",
        dimension: "application",
      },
    ])
    .returning({ id: schema.questions.id });

  questionIds = inserted.map((row: { id: number }) => row.id);

  // 笔记 / 导图：外部 API 没有写接口，fixture 直接落库（任务只读它们）
  await testDbHelper.db.insert(schema.notes).values({
    user_id: USER_ID,
    title: "教育法规要点",
    content:
      "《教育法》第三十七条：受教育者在入学、升学等方面依法享有平等权利。",
  });
  await testDbHelper.db.insert(schema.mindmaps).values({
    user_id: USER_ID,
    title: "教育学总纲",
    content: "# 教育学\n\n- 教育目的\n- 教育制度",
  });
}

describe("AI-native 文档任务（仅 /api/external）", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await seed();
    fixtures.answers = [
      {
        questionId: questionIds[0],
        userAnswer: "B",
        isCorrect: false,
        durationMs: 8000,
      },
      {
        questionId: questionIds[1],
        userAnswer: "D",
        isCorrect: true,
        durationMs: 12000,
      },
      {
        questionId: questionIds[2],
        userAnswer: "A",
        isCorrect: false,
        durationMs: 6000,
      },
    ];
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  it("四个任务按真实顺序跑通（导入 → 排清单 → 复习 → 小结）", async () => {
    const results = await runDocTasks(request, fixtures);

    // 1) 导入：预演与真写条数一致，会话可见
    expect(results.imported.dryRunInserted).toBe(3);
    expect(results.imported.realInserted).toBe(3);
    expect(results.imported.sessionId).toMatch(/^agent_/);

    // 2) 今日清单：薄弱标签来自掌握度，题目来自错题本
    expect(results.todayPlan.questionIds.length).toBeGreaterThan(0);
    expect(results.todayPlan.weakestTags.length).toBeGreaterThan(0);
    expect(results.todayPlan.summary).toContain("今日清单");

    // 3) 复习：调度真的被推动（reps ≥ 1 且有 due）
    expect(results.review.repsAfter).toBeGreaterThanOrEqual(1);
    expect(results.review.nextDue).not.toBe("");
    expect(results.review.duplicate).toBe(false);

    // 4) 小结：笔记/导图能拿到正文，SRS 负载可读
    expect(results.summary.noteCount).toBe(1);
    expect(results.summary.firstNoteHasBody).toBe(true);
    expect(results.summary.mindmapCount).toBe(1);
    expect(results.summary.text).toContain("笔记 1 篇");
  });

  it("导入的数据真的进了错题本与掌握度（不是只回 200）", async () => {
    await runDocTasks(request, fixtures);

    const wrongBook = await request("GET", "/wrong-book?limit=20");
    const wrongIds = ((wrongBook.body as { data: unknown[] }).data ?? []).map(
      (item) => (item as { questionId: number }).questionId,
    );
    // 两条答错的题都该出现在错题本里
    expect(wrongIds).toContain(questionIds[0]);
    expect(wrongIds).toContain(questionIds[2]);
    // 答对的那道不该在
    expect(wrongIds).not.toContain(questionIds[1]);

    const mastery = await request("GET", "/mastery?limit=50");
    const tags = ((mastery.body as { data: unknown[] }).data ?? []).map(
      (row) => (row as { tag: string }).tag,
    );
    expect(tags).toContain("教育法规");
  });

  it("卡组里已有别的卡时，复习的是 cardKey 指定的那张（不是第一张）", async () => {
    // 先塞一张占位卡进同一个卡组，让目标卡不是列表第一张
    await request("POST", "/recall/decks", {
      json: JSON.stringify({
        schema: 1,
        deckId: "deck-shared",
        title: "共享卡组",
        groups: [],
        cards: [
          {
            cardId: "placeholder",
            kind: "list",
            prompt: "占位卡：不应被复习",
            items: [{ text: "占位", keywords: ["占位"] }],
          },
        ],
      }),
    });

    const dbg = await request("GET", "/recall/decks/deck-shared?limit=10");
    console.error(
      JSON.stringify(
        (dbg.body as any).data?.map((r: any) => [r.cardId, r.cardKey]),
      ),
    );
    const result = await reviewLoop(request, {
      deckKey: "deck-shared",
      cardId: "target",
      cardPrompt: "目标卡：应被复习",
      typed: "教育目的 教育方法",
    });

    const dbg2 = await request("GET", "/recall/decks/deck-shared?limit=10");
    console.error(
      JSON.stringify(
        (dbg2.body as any).data?.map((r: any) => [r.cardId, r.cardKey]),
      ),
      "picked",
      result.cardId,
    );
    const target = await request("GET", `/recall/cards/${result.cardId}`);
    const targetBody = target.body as {
      cardKey: string;
      state: { reps: number };
    };
    expect(targetBody.cardKey).toBe("target");
    expect(targetBody.state.reps).toBeGreaterThanOrEqual(1);

    // 占位卡不能被复习到
    const deck = await request("GET", "/recall/decks/deck-shared?limit=10");
    const rows = (
      deck.body as { data: Array<{ cardKey: string; state: unknown }> }
    ).data;
    const placeholder = rows.find((row) => row.cardKey === "placeholder");
    expect(placeholder?.state ?? null).toBeNull();
  });

  it("重复跑同一批任务：导入幂等命中、复习幂等重放，库内不重复计数", async () => {
    await runDocTasks(request, fixtures);
    // 第二轮是"客户端重试/重放"，允许命中幂等
    const second = await runDocTasks(request, fixtures, { allowReplay: true });

    // 导入命中 sessionKey 幂等：inserted 归零
    expect(second.imported.realInserted).toBe(0);
    // 复习命中 clientKey 幂等：duplicate=true，reps 不翻倍
    expect(second.review.duplicate).toBe(true);
    expect(second.review.repsAfter).toBe(1);
  });
});
