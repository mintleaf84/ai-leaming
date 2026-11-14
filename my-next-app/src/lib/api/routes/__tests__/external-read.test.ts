// @vitest-environment node
/**
 * 外部只读接口（Agent API P2）集成测试
 *
 * 用真实 SQLite（迁移文件建库）验证：鉴权、数据结构、跨用户隔离、分页截断、全局 key 语义。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

import app from "../external";

const USER_A = 1;
const USER_B = 2;

const KEY_A = "read-key-a";
const KEY_B = "read-key-b";
const GLOBAL_KEY = "read-key-global";

function authHeader(key: string) {
  return { Authorization: `Bearer ${key}` };
}

async function seedFixtures() {
  await testDbHelper.seedUser(USER_A, "alice");
  await testDbHelper.seedUser(USER_B, "bob");

  await testDbHelper.db.insert(schema.api_keys).values([
    { key_string: KEY_A, is_active: 1, scopes: "read", user_id: USER_A },
    { key_string: KEY_B, is_active: 1, scopes: "read", user_id: USER_B },
    { key_string: GLOBAL_KEY, is_active: 1, scopes: "read", user_id: null },
  ]);

  // 题目：q1 教育心理学（knowledge），q2 课程（application）
  await testDbHelper.db.insert(schema.questions).values([
    {
      id: 101,
      content: "A 题的题干",
      options: JSON.stringify(["A", "B", "C"]),
      answer: "A",
      tags: JSON.stringify(["教育心理学/学习理论"]),
      dimension: "knowledge",
    },
    {
      id: 102,
      content: "B 题的题干",
      options: JSON.stringify(["A", "B"]),
      answer: "B",
      tags: JSON.stringify(["教育学/课程"]),
      dimension: "application",
    },
  ]);

  // 用户 A：3 场会话；用户 B：1 场会话
  await testDbHelper.db.insert(schema.practice_sessions).values([
    {
      id: "session-a1",
      user_id: USER_A,
      session_name: "A 的第一场",
      practice_mode: "exam",
      total_questions: 2,
      correct_count: 1,
      created_at: "2026-01-01 10:00:00",
    },
    {
      id: "session-a2",
      user_id: USER_A,
      session_name: "A 的第二场",
      practice_mode: "random",
      total_questions: 1,
      correct_count: 0,
      created_at: "2026-01-02 10:00:00",
    },
    {
      id: "session-a3",
      user_id: USER_A,
      session_name: null,
      practice_mode: "exam",
      total_questions: 0,
      correct_count: 0,
      created_at: "2026-01-03 10:00:00",
    },
    {
      id: "session-b1",
      user_id: USER_B,
      session_name: "B 的唯一一场",
      practice_mode: "exam",
      total_questions: 1,
      correct_count: 0,
      created_at: "2026-01-04 10:00:00",
    },
  ]);

  await testDbHelper.db.insert(schema.practice_logs).values([
    {
      session_id: "session-a1",
      user_id: USER_A,
      question_id: 101,
      user_answer: "A",
      is_correct: true,
      duration_ms: 1000,
      timestamp: "2026-01-01 10:00:05",
    },
    {
      session_id: "session-a1",
      user_id: USER_A,
      question_id: 102,
      user_answer: "A",
      is_correct: false,
      duration_ms: 2000,
      timestamp: "2026-01-01 10:00:10",
    },
    {
      session_id: "session-a2",
      user_id: USER_A,
      question_id: 101,
      user_answer: "C",
      is_correct: false,
      duration_ms: 500,
      timestamp: "2026-01-02 10:00:05",
    },
    {
      session_id: "session-b1",
      user_id: USER_B,
      question_id: 101,
      user_answer: "B",
      is_correct: false,
      duration_ms: 700,
      timestamp: "2026-01-04 10:00:05",
    },
  ]);

  await testDbHelper.db.insert(schema.user_mastery).values([
    {
      user_id: USER_A,
      tag_name: "教育心理学/学习理论",
      score: 50,
      correct_count: 1,
      total_count: 2,
    },
    {
      user_id: USER_B,
      tag_name: "教育学/课程",
      score: 0,
      correct_count: 0,
      total_count: 1,
    },
  ]);

  await testDbHelper.db.insert(schema.knowledge_cards).values([
    {
      user_id: USER_A,
      title: "A 的卡片一",
      category: "教育心理学",
      tags: JSON.stringify(["记忆"]),
      front: "遗忘曲线是什么",
      back: "先快后慢",
      key_points: JSON.stringify([
        { term: "遗忘曲线", definition: "先快后慢" },
      ]),
      created_at: "2026-01-05 10:00:00",
    },
    {
      user_id: USER_A,
      title: "A 的卡片二",
      category: "教育学",
      tags: JSON.stringify(["课程"]),
      front: "课程类型",
      back: "学科/活动",
      key_points: JSON.stringify([]),
      created_at: "2026-01-06 10:00:00",
    },
    {
      user_id: USER_B,
      title: "B 的卡片",
      category: "教育学",
      tags: JSON.stringify([]),
      front: "B 的问题",
      back: "B 的答案",
      key_points: JSON.stringify([]),
      created_at: "2026-01-07 10:00:00",
    },
  ]);
}

describe("External read-only API (Agent API P2)", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await seedFixtures();
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  const endpoints = [
    "/practice/sessions",
    "/practice/sessions/session-a1",
    "/wrong-book",
    "/wrong-book/stats",
    "/mastery",
    "/stats",
    "/knowledge/cards",
  ];

  it("returns 401 for every read endpoint without an API key", async () => {
    for (const path of endpoints) {
      const res = await app.request(path);
      expect(res.status, path).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Authorization");
    }
  });

  describe("GET /practice/sessions", () => {
    it("lists only the caller's sessions with meta", async () => {
      const res = await app.request("/practice/sessions", {
        headers: authHeader(KEY_A),
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.meta).toMatchObject({ limit: 20, offset: 0, total: 3 });
      expect(body.data).toHaveLength(3);
      const ids = body.data.map((item: { id: string }) => item.id);
      expect(ids.sort()).toEqual(["session-a1", "session-a2", "session-a3"]);
      expect(ids).not.toContain("session-b1");

      expect(body.data[0]).toMatchObject({
        id: expect.any(String),
        totalQuestions: expect.any(Number),
        correctCount: expect.any(Number),
        accuracy: expect.any(Number),
        startedAt: expect.any(String),
      });
      // name / mode 允许为 null（未命名会话、未知模式）
      expect(body.data[0]).toHaveProperty("name");
      expect(body.data[0]).toHaveProperty("mode");
      // 不带内部字段
      expect(body.data[0]).not.toHaveProperty("user_id");
      expect(body.data[0]).not.toHaveProperty("session_id");
    });

    it("filters by mode", async () => {
      const res = await app.request("/practice/sessions?mode=random", {
        headers: authHeader(KEY_A),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.meta.total).toBe(1);
      expect(body.data[0].id).toBe("session-a2");
    });

    it("applies limit=1 and clamps limit=1000 to 100", async () => {
      const limited = await app.request("/practice/sessions?limit=1", {
        headers: authHeader(KEY_A),
      });
      const limitedBody = await limited.json();
      expect(limitedBody.data).toHaveLength(1);
      expect(limitedBody.meta).toMatchObject({ limit: 1, offset: 0, total: 3 });

      const clamped = await app.request("/practice/sessions?limit=1000", {
        headers: authHeader(KEY_A),
      });
      const clampedBody = await clamped.json();
      expect(clampedBody.meta.limit).toBe(100);
    });

    it("supports offset paging", async () => {
      const res = await app.request("/practice/sessions?limit=1&offset=1", {
        headers: authHeader(KEY_A),
      });
      const body = await res.json();
      expect(body.meta).toMatchObject({ limit: 1, offset: 1, total: 3 });
      expect(body.data).toHaveLength(1);
    });
  });

  describe("GET /practice/sessions/:id", () => {
    it("returns session meta, per-question logs and summary", async () => {
      const res = await app.request("/practice/sessions/session-a1", {
        headers: authHeader(KEY_A),
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.session).toMatchObject({
        id: "session-a1",
        name: "A 的第一场",
        mode: "exam",
        totalQuestions: 2,
        correctCount: 1,
        accuracy: 50,
      });
      expect(body.questions).toHaveLength(2);
      expect(body.questions[0]).toMatchObject({
        questionId: 101,
        content: "A 题的题干",
        options: ["A", "B", "C"],
        userAnswer: "A",
        correctAnswer: "A",
        isCorrect: true,
        durationMs: 1000,
        tags: ["教育心理学/学习理论"],
      });
      expect(body.summary).toEqual({
        totalQuestions: 2,
        correctCount: 1,
        accuracy: 50,
        totalDurationMs: 3000,
      });
    });

    it("returns 404 for another user's session (no existence leak)", async () => {
      const res = await app.request("/practice/sessions/session-b1", {
        headers: authHeader(KEY_A),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });

    it("returns 404 for a nonexistent session", async () => {
      const res = await app.request("/practice/sessions/not-exist", {
        headers: authHeader(KEY_A),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /wrong-book", () => {
    it("lists the caller's wrong questions with SRS field", async () => {
      const res = await app.request("/wrong-book", {
        headers: authHeader(KEY_A),
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.meta).toMatchObject({ limit: 20, offset: 0, total: 2 });
      const ids = body.data.map(
        (item: { questionId: number }) => item.questionId,
      );
      expect(ids.sort()).toEqual([101, 102]);
      for (const item of body.data) {
        expect(item).toMatchObject({
          questionId: expect.any(Number),
          content: expect.any(String),
          tags: expect.any(Array),
          wrongCount: expect.any(Number),
          lastWrongAt: expect.any(String),
          srs: null,
        });
      }
    });

    it("filters by tag", async () => {
      const res = await app.request(
        `/wrong-book?tag=${encodeURIComponent("教育学/课程")}`,
        { headers: authHeader(KEY_A) },
      );
      const body = await res.json();
      expect(body.meta.total).toBe(1);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].questionId).toBe(102);
    });

    it("excludes mastered questions", async () => {
      await testDbHelper.db.insert(schema.mastered_questions).values({
        user_id: USER_A,
        question_id: 102,
      });

      const res = await app.request("/wrong-book", {
        headers: authHeader(KEY_A),
      });
      const body = await res.json();
      expect(body.meta.total).toBe(1);
      expect(body.data[0].questionId).toBe(101);
    });

    it("does not leak other users' wrong questions", async () => {
      const res = await app.request("/wrong-book", {
        headers: authHeader(KEY_B),
      });
      const body = await res.json();
      expect(body.meta.total).toBe(1);
      expect(body.data[0].questionId).toBe(101);
      // B 的 101 是错题，A 的 101 也是错题；两者的 wrongCount 应各自独立
      expect(body.data[0].wrongCount).toBe(1);
    });
  });

  describe("GET /wrong-book/stats", () => {
    it("returns total, per-tag and per-dimension distribution", async () => {
      const res = await app.request("/wrong-book/stats", {
        headers: authHeader(KEY_A),
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.total).toBe(2);
      expect(body.byTag).toEqual(
        expect.arrayContaining([
          { tag: "教育心理学/学习理论", count: 1 },
          { tag: "教育学/课程", count: 1 },
        ]),
      );
      expect(body.byDimension).toEqual(
        expect.arrayContaining([
          { dimension: "knowledge", count: 1 },
          { dimension: "application", count: 1 },
        ]),
      );
    });

    it("is isolated per user", async () => {
      const res = await app.request("/wrong-book/stats", {
        headers: authHeader(KEY_B),
      });
      const body = await res.json();
      expect(body.total).toBe(1);
    });
  });

  describe("GET /mastery", () => {
    it("returns the caller's per-tag mastery with counts", async () => {
      const res = await app.request("/mastery", { headers: authHeader(KEY_A) });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.meta).toMatchObject({ limit: 20, offset: 0, total: 1 });
      expect(body.data).toEqual([
        {
          tag: "教育心理学/学习理论",
          score: 50,
          correctCount: 1,
          totalCount: 2,
          accuracy: 50,
          lastUpdated: expect.any(String),
        },
      ]);
    });

    it("paginates", async () => {
      const res = await app.request("/mastery?limit=0", {
        headers: authHeader(KEY_A),
      });
      const body = await res.json();
      // limit=0 被夹到 1
      expect(body.meta.limit).toBe(1);
      expect(body.data).toHaveLength(1);
    });
  });

  describe("GET /stats", () => {
    it("returns the overview for the caller only", async () => {
      const res = await app.request("/stats", { headers: authHeader(KEY_A) });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body).toMatchObject({
        totalAnswered: 3,
        totalCorrect: 1,
        accuracy: 33,
        totalSessions: 3,
        averageMastery: 50,
        todayAnswered: 0,
        todayCorrect: 0,
        observationZoneCount: 0,
      });
      expect(body.streakDays).toEqual(expect.any(Number));
      expect(body.weakPoints).toEqual([
        { tag: "教育心理学/学习理论", score: 50 },
      ]);
    });
  });

  describe("GET /knowledge/cards", () => {
    it("lists only the caller's cards", async () => {
      const res = await app.request("/knowledge/cards", {
        headers: authHeader(KEY_A),
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.meta).toMatchObject({ limit: 20, offset: 0, total: 2 });
      expect(body.data).toHaveLength(2);
      const titles = body.data.map((card: { title: string }) => card.title);
      expect(titles).not.toContain("B 的卡片");
      expect(body.data[0]).toMatchObject({
        id: expect.any(Number),
        title: expect.any(String),
        category: expect.any(String),
        tags: expect.any(Array),
        front: expect.any(String),
        back: expect.any(String),
        keyPoints: expect.any(Array),
      });
      expect(body.data[0]).not.toHaveProperty("user_id");
      expect(body.data[0]).not.toHaveProperty("session_id");
    });

    it("filters by category and paginates", async () => {
      const filtered = await app.request(
        `/knowledge/cards?category=${encodeURIComponent("教育学")}`,
        { headers: authHeader(KEY_A) },
      );
      const filteredBody = await filtered.json();
      expect(filteredBody.meta.total).toBe(1);
      expect(filteredBody.data[0].title).toBe("A 的卡片二");

      const paged = await app.request("/knowledge/cards?limit=1&offset=1", {
        headers: authHeader(KEY_A),
      });
      const pagedBody = await paged.json();
      expect(pagedBody.meta).toMatchObject({ limit: 1, offset: 1, total: 2 });
      expect(pagedBody.data).toHaveLength(1);
    });
  });

  describe("OpenAPI 文档", () => {
    it("描述里包含全部 7 个只读接口，供 agent 自生成调用代码", () => {
      const doc = app.getOpenAPI31Document({
        openapi: "3.1.0",
        info: { title: "external", version: "1.0.0" },
      });
      const paths = Object.keys(doc.paths ?? {});

      expect(paths).toEqual(
        expect.arrayContaining([
          "/practice/sessions",
          "/practice/sessions/{id}",
          "/wrong-book",
          "/wrong-book/stats",
          "/mastery",
          "/stats",
          "/knowledge/cards",
        ]),
      );

      for (const path of [
        "/practice/sessions",
        "/wrong-book",
        "/mastery",
        "/stats",
        "/knowledge/cards",
      ]) {
        const operation = doc.paths?.[path]?.get;
        expect(operation?.summary, path).toBeTruthy();
        expect(operation?.description, path).toContain("read 作用域");
      }
    });
  });

  describe("global key", () => {
    it("sees the API_GLOBAL_USER_ID user's data", async () => {
      const previous = process.env.API_GLOBAL_USER_ID;
      process.env.API_GLOBAL_USER_ID = String(USER_A);
      try {
        const sessions = await app.request("/practice/sessions", {
          headers: authHeader(GLOBAL_KEY),
        });
        const sessionsBody = await sessions.json();
        expect(sessionsBody.meta.total).toBe(3);

        const detail = await app.request("/practice/sessions/session-b1", {
          headers: authHeader(GLOBAL_KEY),
        });
        expect(detail.status).toBe(404);

        const stats = await app.request("/stats", {
          headers: authHeader(GLOBAL_KEY),
        });
        const statsBody = await stats.json();
        expect(statsBody.totalAnswered).toBe(3);

        const cards = await app.request("/knowledge/cards", {
          headers: authHeader(GLOBAL_KEY),
        });
        const cardsBody = await cards.json();
        expect(cardsBody.meta.total).toBe(2);
      } finally {
        if (previous === undefined) {
          delete process.env.API_GLOBAL_USER_ID;
        } else {
          process.env.API_GLOBAL_USER_ID = previous;
        }
      }
    });
  });
});
