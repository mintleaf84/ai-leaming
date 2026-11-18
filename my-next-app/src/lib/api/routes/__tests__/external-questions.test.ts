// @vitest-environment node
/**
 * 外部 API：题库写接口（`POST /questions` / `PATCH /questions/{id}`）
 *
 * 三条被反复踩过的线，这里逐个钉住：
 *   1. **作用域**：题库是全局资产，write key 必须 403，只有 admin 能建/改；
 *   2. **幂等**：内容指纹 `api:`+（题干+选项+答案）——同内容重复建题不新增行；
 *      改题后指纹重算，撞到别的题返回 409 而不是静默合并；
 *   3. **校验**：与后台导入共用 `QuestionSchema`，部分更新合并后仍需整体合法。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
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

const API_PREFIX = "/api/external";
const ADMIN_USER = 41;

const ADMIN_KEY = "questions-admin-key";
const WRITE_KEY = "questions-write-key";
const READ_KEY = "questions-read-key";

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, externalApp);
  return root;
}

function request(
  path: string,
  options: { method?: string; body?: unknown; key?: string } = {},
) {
  const { method = "GET", body, key = ADMIN_KEY } = options;
  return createRootApp().request(`${API_PREFIX}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${key}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function singleChoice(overrides: Record<string, unknown> = {}) {
  return {
    content: "下列哪项属于教育法律？",
    options: ["《教育法》", "《教师手册》", "《课程标准》", "《教学计划》"],
    answer: "A",
    explanation: "《教育法》是全国人大制定的教育基本法律。",
    tags: ["教育法规"],
    dimension: "knowledge",
    type: "single",
    ...overrides,
  };
}

async function seedKeys() {
  await testDbHelper.seedUser(ADMIN_USER, "questions-admin");
  await testDbHelper.db.insert(schema.api_keys).values([
    {
      key_string: ADMIN_KEY,
      is_active: 1,
      scopes: "admin",
      user_id: ADMIN_USER,
    },
    {
      key_string: WRITE_KEY,
      is_active: 1,
      scopes: "write",
      user_id: ADMIN_USER,
    },
    { key_string: READ_KEY, is_active: 1, scopes: "read", user_id: ADMIN_USER },
  ]);
}

async function countQuestions(): Promise<number> {
  const rows = await testDbHelper.db.select().from(schema.questions);
  return rows.length;
}

describe("题库写接口", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await seedKeys();
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  // ==================== 作用域 ====================

  describe("作用域", () => {
    it("write / read key 建题都是 403（题库是全局资产）", async () => {
      const asWrite = await request("/questions", {
        method: "POST",
        body: singleChoice(),
        key: WRITE_KEY,
      });
      expect(asWrite.status).toBe(403);

      const asRead = await request("/questions", {
        method: "POST",
        body: singleChoice(),
        key: READ_KEY,
      });
      expect(asRead.status).toBe(403);
      expect(await countQuestions()).toBe(0);
    });

    it("PATCH 同样是 403：低权限 key 改不动题，且数据不变", async () => {
      const created = await (
        await request("/questions", { method: "POST", body: singleChoice() })
      ).json();

      for (const key of [WRITE_KEY, READ_KEY]) {
        const res = await request(`/questions/${created.id}`, {
          method: "PATCH",
          body: { content: "低权限 key 试图修改的题干内容。" },
          key,
        });
        expect(res.status).toBe(403);
      }

      const [row] = await testDbHelper.db
        .select()
        .from(schema.questions)
        .where(eq(schema.questions.id, created.id));
      expect(row.content).toBe("下列哪项属于教育法律？");
    });

    it("admin key 才能建题", async () => {
      const res = await request("/questions", {
        method: "POST",
        body: singleChoice(),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.duplicate).toBe(false);
      expect(body.externalId.startsWith("api:")).toBe(true);
      expect(await countQuestions()).toBe(1);
    });
  });

  // ==================== 幂等 ====================

  describe("POST /questions 幂等", () => {
    it("同一份内容重复提交返回既有 id，不新增行", async () => {
      const first = await (
        await request("/questions", { method: "POST", body: singleChoice() })
      ).json();
      const second = await (
        await request("/questions", { method: "POST", body: singleChoice() })
      ).json();

      expect(second.duplicate).toBe(true);
      expect(second.id).toBe(first.id);
      expect(second.externalId).toBe(first.externalId);
      expect(await countQuestions()).toBe(1);
    });

    it("改了选项顺序就是另一道题（指纹包含选项顺序）", async () => {
      // 答案用**选项原文**且两次完全相同：若指纹只算「题干+答案」，这条会失败，
      // 才能真正证明选项顺序参与了指纹
      await request("/questions", {
        method: "POST",
        body: singleChoice({ answer: "《教育法》" }),
      });
      const reordered = await (
        await request("/questions", {
          method: "POST",
          body: singleChoice({
            options: [
              "《教师手册》",
              "《教育法》",
              "《课程标准》",
              "《教学计划》",
            ],
            answer: "《教育法》",
          }),
        })
      ).json();

      expect(reordered.duplicate).toBe(false);
      expect(await countQuestions()).toBe(2);
    });

    it("填空题的内容里带分隔符也不会撞键（指纹用整体 JSON 编码）", async () => {
      // 旧的 `content\u0001options\u0001answer` 拼接下，这两道不同的题会得到同一个哈希输入：
      //   q1: content="AAAAA"            answer="B\u0001[]\u0001CCCC"
      //   q2: content="AAAAA\u0001[]\u0001B" answer="CCCC"
      // 新编码（整体 JSON 数组）不会。
      const q1 = await (
        await request("/questions", {
          method: "POST",
          body: singleChoice({
            type: "fill_blank",
            options: [],
            content: "AAAAA",
            answer: "B\u0001[]\u0001CCCC",
          }),
        })
      ).json();
      const q2 = await (
        await request("/questions", {
          method: "POST",
          body: singleChoice({
            type: "fill_blank",
            options: [],
            content: "AAAAA\u0001[]\u0001B",
            answer: "CCCC",
          }),
        })
      ).json();

      expect(q1.duplicate).toBe(false);
      expect(q2.duplicate).toBe(false);
      expect(q1.externalId).not.toBe(q2.externalId);
      expect(await countQuestions()).toBe(2);
    });

    it("预演不落库，但告诉你会不会重复", async () => {
      const dry = await request("/questions?dryRun=true", {
        method: "POST",
        body: singleChoice(),
      });
      expect(dry.status).toBe(200);
      const body = await dry.json();
      expect(body).toMatchObject({ duplicate: false, dryRun: true });
      expect(await countQuestions()).toBe(0);

      // 已存在时预演也能识别重复
      await request("/questions", { method: "POST", body: singleChoice() });
      const dryAgain = await (
        await request("/questions?dryRun=true", {
          method: "POST",
          body: singleChoice(),
        })
      ).json();
      expect(dryAgain).toMatchObject({ duplicate: true, dryRun: true });
      expect(await countQuestions()).toBe(1);
    });
  });

  // ==================== 校验 ====================

  describe("POST /questions 校验", () => {
    it("单选只有一个选项 / 答案不在选项内 / 题干过短 都是 400", async () => {
      const oneOption = await request("/questions", {
        method: "POST",
        body: singleChoice({ options: [], answer: "A" }),
      });
      expect(oneOption.status).toBe(400);
      expect((await oneOption.json()).issues.length).toBeGreaterThan(0);

      const badAnswer = await request("/questions", {
        method: "POST",
        body: singleChoice({ answer: "Z" }),
      });
      expect(badAnswer.status).toBe(400);

      const shortContent = await request("/questions", {
        method: "POST",
        body: singleChoice({ content: "短" }),
      });
      expect(shortContent.status).toBe(400);
      expect(await countQuestions()).toBe(0);
    });

    it("判断题必须两个选项且答案是 A/B；填空题答案可为自由文本", async () => {
      const tf = await request("/questions", {
        method: "POST",
        body: singleChoice({
          type: "truefalse",
          options: ["正确", "错误"],
          answer: "B",
        }),
      });
      expect(tf.status).toBe(200);

      const blank = await request("/questions", {
        method: "POST",
        body: singleChoice({
          type: "fill_blank",
          options: [],
          answer: "教育法",
          content: "我国教育领域的基本法律是____。",
        }),
      });
      expect(blank.status).toBe(200);
      expect(await countQuestions()).toBe(2);
    });

    it("多选题答案必须是 JSON 数组字符串", async () => {
      const bad = await request("/questions", {
        method: "POST",
        body: singleChoice({ type: "multi", answer: "A" }),
      });
      expect(bad.status).toBe(400);

      const good = await request("/questions", {
        method: "POST",
        body: singleChoice({ type: "multi", answer: '["A","B"]' }),
      });
      expect(good.status).toBe(200);
    });
  });

  // ==================== PATCH ====================

  describe("PATCH /questions/{id}", () => {
    it("部分更新：只改解析，指纹不变", async () => {
      const created = await (
        await request("/questions", { method: "POST", body: singleChoice() })
      ).json();

      const res = await request(`/questions/${created.id}`, {
        method: "PATCH",
        body: { explanation: "换了一个更详细的解析，长度足够。" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.changed).toEqual(["explanation"]);
      // 解析不参与指纹
      expect(body.externalId).toBe(created.externalId);

      const [row] = await testDbHelper.db
        .select()
        .from(schema.questions)
        .where(eq(schema.questions.id, created.id));
      expect(row.explanation).toContain("更详细");
    });

    it("改题干会重算指纹；合并后不合法则 400", async () => {
      const created = await (
        await request("/questions", { method: "POST", body: singleChoice() })
      ).json();

      const patched = await request(`/questions/${created.id}`, {
        method: "PATCH",
        body: { content: "下列哪项**不属于**教育法律？" },
      });
      // 先确认 PATCH 真的成功：否则 undefined !== 旧指纹 也会让下面的断言通过
      expect(patched.status).toBe(200);
      const changed = await patched.json();
      expect(typeof changed.externalId).toBe("string");
      expect(changed.externalId).not.toBe(created.externalId);

      const invalid = await request(`/questions/${created.id}`, {
        method: "PATCH",
        body: { options: [] },
      });
      expect(invalid.status).toBe(400);
    });

    it("改后与另一道题内容相同 → 409（不静默合并）", async () => {
      const first = await (
        await request("/questions", { method: "POST", body: singleChoice() })
      ).json();
      const second = await (
        await request("/questions", {
          method: "POST",
          body: singleChoice({ content: "另一道完全不同的题目内容。" }),
        })
      ).json();

      const res = await request(`/questions/${second.id}`, {
        method: "PATCH",
        body: {
          content: "下列哪项属于教育法律？",
          options: [
            "《教育法》",
            "《教师手册》",
            "《课程标准》",
            "《教学计划》",
          ],
          answer: "A",
        },
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.conflictingId).toBe(first.id);
    });

    it("只提交未变的字段时不产生写入，changed 为空", async () => {
      const created = await (
        await request("/questions", { method: "POST", body: singleChoice() })
      ).json();

      const res = await request(`/questions/${created.id}`, {
        method: "PATCH",
        // 值与原记录一致：既不该报变更，也不该触发向量重建
        body: { content: "下列哪项属于教育法律？" },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ changed: [] });
    });

    it("只改解析不会把 type/dimension 的默认值写回库", async () => {
      // 老数据可能 type/dimension 为 NULL；只改解析不应把它们"顺手"填成 single/knowledge
      const [seeded] = await testDbHelper.db
        .insert(schema.questions)
        .values({
          content: "一道历史遗留的老题，没有题型与维度。",
          options: JSON.stringify(["甲", "乙"]),
          answer: "A",
          explanation: "原始解析。",
          tags: JSON.stringify(["历史"]),
          type: null,
          dimension: null,
        })
        .returning({ id: schema.questions.id });

      const res = await request(`/questions/${seeded.id}`, {
        method: "PATCH",
        body: { explanation: "只改了这一行解析内容。" },
      });
      expect(res.status).toBe(200);

      const [row] = await testDbHelper.db
        .select()
        .from(schema.questions)
        .where(eq(schema.questions.id, seeded.id));
      expect(row.type).toBeNull();
      expect(row.dimension).toBeNull();
      expect(row.explanation).toBe("只改了这一行解析内容。");
    });

    it("不覆盖导入题目的上游来源键（粉笔 sourceKey 仍可匹配）", async () => {
      const [seeded] = await testDbHelper.db
        .insert(schema.questions)
        .values({
          content: "粉笔导入的一道题。",
          options: JSON.stringify(["甲", "乙"]),
          answer: "A",
          explanation: "原始解析。",
          tags: JSON.stringify(["教育学"]),
          type: "single",
          dimension: "knowledge",
          // 上游题目 ID：粉笔导入用它做 upsert，被改成 api: 指纹会插出重复题
          external_id: "fenbi:987654",
        })
        .returning({ id: schema.questions.id });

      const res = await request(`/questions/${seeded.id}`, {
        method: "PATCH",
        body: { content: "粉笔导入的一道题（题干被修正过）。" },
      });
      expect(res.status).toBe(200);

      const [row] = await testDbHelper.db
        .select()
        .from(schema.questions)
        .where(eq(schema.questions.id, seeded.id));
      expect(row.external_id).toBe("fenbi:987654");
    });

    it("预演不落库；不存在返回 404；非法 id 返回 400", async () => {
      const created = await (
        await request("/questions", { method: "POST", body: singleChoice() })
      ).json();

      const dry = await request(`/questions/${created.id}?dryRun=true`, {
        method: "PATCH",
        body: { content: "预演会改成的题干内容。" },
      });
      expect(dry.status).toBe(200);
      expect(await dry.json()).toMatchObject({
        dryRun: true,
        changed: ["content"],
      });

      const [row] = await testDbHelper.db
        .select()
        .from(schema.questions)
        .where(eq(schema.questions.id, created.id));
      expect(row.content).toBe("下列哪项属于教育法律？");

      expect(
        (
          await request("/questions/999999", {
            method: "PATCH",
            body: { content: "x".repeat(10) },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await request("/questions/abc", {
            method: "PATCH",
            body: { content: "x".repeat(10) },
          })
        ).status,
      ).toBe(400);
    });
  });
});
