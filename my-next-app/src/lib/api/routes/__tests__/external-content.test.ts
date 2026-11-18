// @vitest-environment node
/**
 * 外部 API：个人内容只读接口（笔记 / 思维导图 / SRS 概览）
 *
 * 这三组接口是「只靠 docs/api.md 完成一件真实任务」的缺口补齐（AI-native 计划 P1）：
 * 以前它们只有 Server Action，对 agent 等于不存在。
 *
 * 重点验证两件事：
 *   1. 分页口径统一（limit/offset + meta），不是另一套 page/pagination；
 *   2. 跨用户数据不可见 —— 归属校验在 SQL 的 where 里，不靠"查出来再判断"。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
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

const API_PREFIX = "/api/external";

const A = 21;
const B = 22;

const KEY_A = "content-key-a";
const KEY_B = "content-key-b";

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, externalApp);
  return root;
}

function request(path: string, key = KEY_A) {
  return createRootApp().request(`${API_PREFIX}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
}

async function seed() {
  await testDbHelper.seedUser(A, "content-a");
  await testDbHelper.seedUser(B, "content-b");
  await testDbHelper.db.insert(schema.api_keys).values([
    { key_string: KEY_A, is_active: 1, scopes: "read", user_id: A },
    { key_string: KEY_B, is_active: 1, scopes: "read", user_id: B },
  ]);
}

async function seedNotes() {
  return testDbHelper.db
    .insert(schema.notes)
    .values([
      { user_id: A, title: "教育法规要点", content: "教师法第三十七条……" },
      { user_id: A, title: "心理学笔记", content: "皮亚杰认知发展阶段……" },
      { user_id: B, title: "B 的私密笔记", content: "不应被 A 看到" },
    ])
    .returning({ id: schema.notes.id });
}

async function seedMindmaps() {
  return testDbHelper.db
    .insert(schema.mindmaps)
    .values([
      { user_id: A, title: "教育学导图", content: "# 教育学\n\n- 教育目的" },
      { user_id: B, title: "B 的导图", content: "# 私密" },
    ])
    .returning({ id: schema.mindmaps.id });
}

describe("个人内容只读接口", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await seed();
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  // ==================== GET /notes ====================

  describe("GET /notes", () => {
    it("只返回当前身份的笔记，分页口径是 limit/offset + meta", async () => {
      await seedNotes();

      const res = await request("/notes?limit=10&offset=0");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.meta).toEqual({ limit: 10, offset: 0, total: 2 });
      expect(body.data).toHaveLength(2);
      for (const note of body.data) {
        expect(note).toHaveProperty("id");
        expect(note).toHaveProperty("title");
        expect(note).toHaveProperty("preview");
        // 列表不给全文：预览最长 200 字
        expect(note.preview.length).toBeLessThanOrEqual(200);
        expect(note).not.toHaveProperty("content");
      }
      expect(body.data.map((n: { title: string }) => n.title)).not.toContain(
        "B 的私密笔记",
      );
    });

    it("limit/offset 真的切片，且 total 是过滤前的总数", async () => {
      await seedNotes();

      const first = await (await request("/notes?limit=1&offset=0")).json();
      const second = await (await request("/notes?limit=1&offset=1")).json();

      expect(first.data).toHaveLength(1);
      expect(second.data).toHaveLength(1);
      expect(first.data[0].id).not.toBe(second.data[0].id);
      expect(first.meta.total).toBe(2);
      expect(second.meta.offset).toBe(1);
    });

    it("q 在标题与正文里搜索，且不跨用户", async () => {
      await seedNotes();

      const byTitle = await (await request("/notes?q=心理学")).json();
      expect(byTitle.data.map((n: { title: string }) => n.title)).toEqual([
        "心理学笔记",
      ]);

      const byContent = await (await request("/notes?q=第三十七条")).json();
      expect(byContent.data.map((n: { title: string }) => n.title)).toEqual([
        "教育法规要点",
      ]);

      // B 的笔记正文里也有"私密"，A 搜不到
      const leak = await (await request("/notes?q=私密")).json();
      expect(leak.data).toHaveLength(0);
    });

    it("limit 上限被截到 100（防止 agent 一次拉爆上下文）", async () => {
      await seedNotes();
      const body = await (await request("/notes?limit=9999")).json();
      expect(body.meta.limit).toBe(100);
    });
  });

  // ==================== GET /notes/{id} ====================

  describe("GET /notes/{id}", () => {
    it("返回全文；别人的笔记一律 404（不泄露存在性）", async () => {
      const ids = await seedNotes();
      const mine = ids[0].id;
      const others = ids[2].id;

      const ok = await request(`/notes/${mine}`);
      expect(ok.status).toBe(200);
      const body = await ok.json();
      expect(body).toMatchObject({ id: mine, title: "教育法规要点" });
      expect(body.content).toContain("第三十七条");

      const forbidden = await request(`/notes/${others}`);
      expect(forbidden.status).toBe(404);

      // 同一个 id 换成 B 的 key 就能读到（证明 404 是归属判定而不是数据不存在）
      const asOwner = await request(`/notes/${others}`, KEY_B);
      expect(asOwner.status).toBe(200);
    });

    it("非法 id 返回 400，而不是 500", async () => {
      const res = await request("/notes/not-a-number");
      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /mindmaps ====================

  describe("GET /mindmaps", () => {
    it("只返回当前身份的导图，且带 meta", async () => {
      await seedMindmaps();

      const body = await (await request("/mindmaps?limit=20")).json();
      expect(body.meta).toEqual({ limit: 20, offset: 0, total: 1 });
      expect(body.data[0]).toMatchObject({ title: "教育学导图" });
      expect(body.data[0]).not.toHaveProperty("content");
    });
  });

  // ==================== GET /mindmaps/{id} ====================

  describe("GET /mindmaps/{id}", () => {
    it("返回源文；别人的导图 404", async () => {
      const ids = await seedMindmaps();

      const ok = await request(`/mindmaps/${ids[0].id}`);
      expect(ok.status).toBe(200);
      const body = await ok.json();
      expect(body.content).toContain("教育目的");

      expect((await request(`/mindmaps/${ids[1].id}`)).status).toBe(404);
      expect((await request(`/mindmaps/${ids[1].id}`, KEY_B)).status).toBe(200);
    });
  });

  // ==================== GET /srs/summary ====================

  describe("GET /srs/summary", () => {
    it("无 SRS 数据时返回零值结构（不是 500，也不缺字段）", async () => {
      const res = await request("/srs/summary");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.totalCards).toBe(0);
      expect(body.stateDistribution).toEqual({
        new: 0,
        learning: 0,
        review: 0,
        relearning: 0,
      });
      expect(body.next7Days).toEqual({ count: 0, minutes: 0 });
      expect(Array.isArray(body.daily)).toBe(true);
    });

    it("有 SRS 卡时统计只算当前身份", async () => {
      const [q] = await testDbHelper.db
        .insert(schema.questions)
        .values({
          content: "测试题",
          options: JSON.stringify(["A", "B"]),
          answer: "A",
          type: "single",
        })
        .returning({ id: schema.questions.id });

      await testDbHelper.db
        .insert(schema.question_srs)
        .values([
          { user_id: A, question_id: q.id, state: 2, reps: 3, stability: 5 },
        ]);

      const mine = await (await request("/srs/summary")).json();
      expect(mine.totalCards).toBe(1);
      expect(mine.stateDistribution.review).toBe(1);

      const others = await (await request("/srs/summary", KEY_B)).json();
      expect(others.totalCards).toBe(0);
    });
  });
});
