// @vitest-environment node
/**
 * 外部 API：题库批量建题（`POST /questions/batch`）
 *
 * 钉住四类契约：
 *   1. **作用域**：题库是全局资产 —— write / read key 一律 403，只有 admin 能建；
 *   2. **幂等**：调用方 `externalId` 优先、没给才用内容指纹；重复提交返回既有 id
 *      且**不更新内容**；批内同一个键只落一行；
 *   3. **整批原子**：任一条不合法 → 400 且一条都不写（不做部分写入）；
 *   4. **预演**：`?dryRun=true` 库内零变更。
 *
 * 用真实 SQLite（真实迁移）+ 真实鉴权中间件，不 mock SQL 也不 mock service：
 * 幂等与事务这类契约只有真跑一遍库才算验证过（docs/engineering.md 规则三）。
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
const BATCH_PATH = `${API_PREFIX}/questions/batch`;
const ADMIN_USER = 42;

const ADMIN_KEY = "batch-admin-key";
const WRITE_KEY = "batch-write-key";
const READ_KEY = "batch-read-key";

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, externalApp);
  return root;
}

function postBatch(
  body: unknown,
  options: { key?: string; dryRun?: boolean } = {},
) {
  const { key = ADMIN_KEY, dryRun = false } = options;
  const query = dryRun ? "?dryRun=true" : "";
  return createRootApp().request(`${BATCH_PATH}${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
}

/** 合法单选题；overrides 覆盖任意字段（用于构造非法条目） */
function choice(overrides: Record<string, unknown> = {}) {
  return {
    content: "下列哪项属于教育法律？",
    options: ["《教育法》", "《教师手册》", "《课程标准》"],
    answer: "A",
    explanation: "《教育法》是全国人大制定的教育基本法律。",
    tags: ["教育法规"],
    dimension: "knowledge",
    type: "single",
    ...overrides,
  };
}

async function seedKeys() {
  await testDbHelper.seedUser(ADMIN_USER, "batch-admin");
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

async function allQuestions() {
  return testDbHelper.db.select().from(schema.questions);
}

async function byExternalId(externalId: string) {
  const rows = await testDbHelper.db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.external_id, externalId));
  return rows;
}

describe("题库批量建题 POST /questions/batch", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await seedKeys();
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  // ==================== 作用域 ====================

  describe("作用域", () => {
    it("write / read key 批量建题都是 403（题库是全局资产）", async () => {
      for (const key of [WRITE_KEY, READ_KEY]) {
        const res = await postBatch({ questions: [choice()] }, { key });
        expect(res.status).toBe(403);
      }
      expect(await allQuestions()).toHaveLength(0);
    });

    it("没有 Authorization 头返回 401", async () => {
      const res = await createRootApp().request(BATCH_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: [choice()] }),
      });
      expect(res.status).toBe(401);
      expect(await allQuestions()).toHaveLength(0);
    });
  });

  // ==================== 正常建题 ====================

  describe("建题", () => {
    it("批量创建成功，字段按既有口径落库（options/tags 存 JSON 字符串）", async () => {
      const res = await postBatch({
        questions: [
          choice({ externalId: "jz1680_jz00312" }),
          {
            externalId: "jz1680_jz00313",
            content: "教育目的的核心是？",
            options: ["培养人", "传授知识", "发展经济"],
            answer: "A",
            explanation: "教育以培养人为根本目的。",
            tags: ["教育学", "教育目的"],
            dimension: "understanding",
            type: "single",
            source: "jz1680",
            material: "材料原文：教育与人的发展。",
          },
        ],
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.created).toBe(2);
      expect(json.skipped).toBe(0);
      expect(json.duplicate).toBe(false);
      expect(json.items).toHaveLength(2);
      expect(json.items.map((i: { index: number }) => i.index)).toEqual([0, 1]);
      expect(
        json.items.every((i: { status: string }) => i.status === "created"),
      ).toBe(true);

      const rows = await allQuestions();
      expect(rows).toHaveLength(2);

      const first = await byExternalId("jz1680_jz00312");
      expect(first).toHaveLength(1);
      expect(first[0].id).toBe(json.items[0].questionId);
      expect(first[0].content).toBe("下列哪项属于教育法律？");
      // options / tags 必须是 JSON 字符串（与粉笔导入同一口径）
      expect(JSON.parse(first[0].options as string)).toEqual([
        "《教育法》",
        "《教师手册》",
        "《课程标准》",
      ]);
      expect(JSON.parse(first[0].tags as string)).toEqual(["教育法规"]);
      expect(first[0].type).toBe("single");
      expect(first[0].dimension).toBe("knowledge");

      const second = await byExternalId("jz1680_jz00313");
      expect(second).toHaveLength(1);
      expect(second[0].source).toBe("jz1680");
      expect(second[0].material).toBe("材料原文：教育与人的发展。");
      expect(second[0].dimension).toBe("understanding");
    });

    it("省略 type / dimension 时按 single / knowledge 落库", async () => {
      const item = choice();
      delete (item as Record<string, unknown>).type;
      delete (item as Record<string, unknown>).dimension;

      const res = await postBatch({ questions: [item] });
      expect(res.status).toBe(200);

      const [row] = await allQuestions();
      expect(row.type).toBe("single");
      expect(row.dimension).toBe("knowledge");
    });

    it("判断题与填空题按 QuestionSchema 的规则校验后可以建", async () => {
      const res = await postBatch({
        questions: [
          {
            externalId: "batch-tf-1",
            content: "教育是有目的地培养人的社会活动。",
            options: ["正确", "错误"],
            answer: "A",
            explanation: "这是教育的质的规定性。",
            tags: ["教育学"],
            type: "truefalse",
          },
          {
            externalId: "batch-fb-1",
            content: "我国的教育方针是____。",
            options: [],
            answer: "教育必须为社会主义现代化建设服务",
            explanation: "见《教育法》第五条。",
            tags: ["教育法规"],
            type: "fill_blank",
          },
        ],
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.created).toBe(2);
      const rows = (await allQuestions()) as Array<{ type: string | null }>;
      expect(rows.map((r) => r.type).sort()).toEqual([
        "fill_blank",
        "truefalse",
      ]);
    });
  });

  // ==================== 幂等 ====================

  describe("幂等", () => {
    it("同一 externalId 重推 → skipped，返回既有 id，不重复插入、不更新内容", async () => {
      const first = await (
        await postBatch({
          questions: [choice({ externalId: "idem-1" })],
        })
      ).json();
      expect(first.created).toBe(1);
      const createdId = first.items[0].questionId;

      // 第二次内容**故意改了**：externalId 命中就该 skipped 且不覆盖内容
      const second = await (
        await postBatch({
          questions: [
            choice({
              externalId: "idem-1",
              content: "这一版题干完全换掉了，但 externalId 没变。",
            }),
          ],
        })
      ).json();

      expect(second.created).toBe(0);
      expect(second.skipped).toBe(1);
      expect(second.duplicate).toBe(true);
      expect(second.items[0].status).toBe("skipped");
      expect(second.items[0].questionId).toBe(createdId);

      const rows = await allQuestions();
      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe("下列哪项属于教育法律？");
    });

    it("没带 externalId 时退回内容指纹：同内容重推 skipped，键是 api: 前缀", async () => {
      const body = { questions: [choice()] };
      const first = await (await postBatch(body)).json();
      expect(first.created).toBe(1);
      expect(first.items[0].externalId).toMatch(/^api:[0-9a-f]{36}$/);

      const second = await (await postBatch(body)).json();
      expect(second.created).toBe(0);
      expect(second.skipped).toBe(1);
      expect(second.items[0].externalId).toBe(first.items[0].externalId);
      expect(second.items[0].questionId).toBe(first.items[0].questionId);
      expect(await allQuestions()).toHaveLength(1);
    });

    it("批内重复 externalId：第一条 created、第二条 skipped，库里只有一行", async () => {
      const res = await postBatch({
        questions: [
          choice({ externalId: "dup-in-batch" }),
          choice({
            externalId: "dup-in-batch",
            content: "同一次请求里重复的 externalId，内容还不一样。",
          }),
        ],
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.created).toBe(1);
      expect(json.skipped).toBe(1);
      expect(json.items[0].status).toBe("created");
      expect(json.items[1].status).toBe("skipped");
      // 两条指向同一个 id，便于调用方按 index 回填
      expect(json.items[1].questionId).toBe(json.items[0].questionId);
      expect(await allQuestions()).toHaveLength(1);
    });

    it("一批里既有新题又有既有题：只有新题落库", async () => {
      const first = await (
        await postBatch({ questions: [choice({ externalId: "mix-1" })] })
      ).json();

      const second = await (
        await postBatch({
          questions: [
            choice({ externalId: "mix-1" }),
            choice({ externalId: "mix-2", content: "第二批新增的一道题。" }),
          ],
        })
      ).json();

      expect(second.created).toBe(1);
      expect(second.skipped).toBe(1);
      expect(second.items[0].questionId).toBe(first.items[0].questionId);
      expect(await allQuestions()).toHaveLength(2);
    });
  });

  // ==================== 校验（整批原子） ====================

  describe("校验", () => {
    it("混入一条非法题 → 400 + issues，整批一条都不写", async () => {
      const res = await postBatch({
        questions: [
          choice({ externalId: "valid-1" }),
          choice({
            externalId: "invalid-1",
            // single 题的答案不在选项里
            answer: "Z",
          }),
        ],
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("整批未写入");
      expect(json.issues.length).toBeGreaterThan(0);
      // issue 的路径带条目下标，调用方才能定位是哪一条
      expect(json.issues[0]).toContain("questions.1.answer");
      expect(await allQuestions()).toHaveLength(0);
    });

    it("缺少 answer → 400", async () => {
      const item = choice();
      delete (item as Record<string, unknown>).answer;

      const res = await postBatch({ questions: [item] });
      expect(res.status).toBe(400);
      expect(await allQuestions()).toHaveLength(0);
    });

    it("缺 explanation / tags → 400（与 QuestionSchema 的必填口径一致）", async () => {
      for (const field of ["explanation", "tags"]) {
        const item = choice();
        delete (item as Record<string, unknown>)[field];

        const res = await postBatch({ questions: [item] });
        expect(res.status).toBe(400);
      }
      expect(await allQuestions()).toHaveLength(0);
    });

    it("结构校验失败（缺必填字段）也返回批量契约形状，不是框架默认体", async () => {
      const item = choice();
      delete (item as Record<string, unknown>).content;

      const res = await postBatch({ questions: [item] });
      expect(res.status).toBe(400);

      const json = await res.json();
      // 契约字段齐全（框架默认体是 {success:false,error:{issues:[...]}}）
      expect(json.error).toContain("整批未写入");
      expect(Array.isArray(json.issues)).toBe(true);
      expect(json.issues[0]).toContain("questions.0.content");
      expect(json.issueCount).toBe(json.issues.length);
      expect(await allQuestions()).toHaveLength(0);
    });

    it("结构错超过 20 条时 issues 截到 20 条，issueCount 仍是全量", async () => {
      // 25 条空对象 = 25 × 4 个必填 issue（content/answer/explanation/tags）
      const questions = Array.from({ length: 25 }, () => ({}));

      const res = await postBatch({ questions });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.issues).toHaveLength(20);
      expect(json.issueCount).toBeGreaterThan(20);
      expect(await allQuestions()).toHaveLength(0);
    });

    it("externalId 以保留前缀 api: 开头 → 400 + issues，整批不写", async () => {
      const res = await postBatch({
        questions: [
          choice({ externalId: "api:vendor-1" }),
          choice({ externalId: "ok-1", content: "同批里的另一道合法题。" }),
        ],
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("整批未写入");
      // 指向具体条目，并说明是保留前缀
      expect(json.issues[0]).toContain("questions.0.externalId");
      expect(json.issues[0]).toContain("api:");
      expect(await allQuestions()).toHaveLength(0);
    });

    it("未知 type → 400", async () => {
      const res = await postBatch({
        questions: [choice({ type: "essay" })],
      });
      expect(res.status).toBe(400);
      expect(await allQuestions()).toHaveLength(0);
    });

    it("空数组 → 400", async () => {
      const res = await postBatch({ questions: [] });
      expect(res.status).toBe(400);
    });

    it("超过 100 条 → 400，且一条都不写", async () => {
      const questions = Array.from({ length: 101 }, (_v, i) =>
        choice({
          externalId: `over-${i}`,
          content: `超限测试题目第 ${i} 号，用于验证批上限。`,
        }),
      );
      const res = await postBatch({ questions });
      expect(res.status).toBe(400);
      expect(await allQuestions()).toHaveLength(0);
    });

    it("100 条边界（99 条可写满）成功写入", async () => {
      const questions = Array.from({ length: 99 }, (_v, i) =>
        choice({
          externalId: `edge-${i}`,
          content: `边界测试题目第 ${i} 号，用于验证批量写入。`,
        }),
      );
      const res = await postBatch({ questions });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.created).toBe(99);
      expect(json.skipped).toBe(0);
      const rows = await allQuestions();
      expect(rows).toHaveLength(99);
    });
  });

  // ==================== 预演 ====================

  describe("预演 dryRun", () => {
    it("新题预演：created 是「会建几条」，库内零写入且 id 为 null", async () => {
      const res = await postBatch(
        {
          questions: [
            choice({ externalId: "dry-1" }),
            choice({ externalId: "dry-2", content: "预演里的第二道题。" }),
          ],
        },
        { dryRun: true },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.dryRun).toBe(true);
      expect(json.created).toBe(2);
      expect(json.skipped).toBe(0);
      expect(
        json.items.every((i: { questionId: unknown }) => i.questionId === null),
      ).toBe(true);
      expect(await allQuestions()).toHaveLength(0);
    });

    it("预演命中既有题：skipped 且带既有 id，仍不写库", async () => {
      const created = await (
        await postBatch({ questions: [choice({ externalId: "dry-existing" })] })
      ).json();

      const res = await postBatch(
        {
          questions: [
            choice({ externalId: "dry-existing" }),
            choice({ externalId: "dry-new", content: "预演里的新题。" }),
          ],
        },
        { dryRun: true },
      );

      const json = await res.json();
      expect(json.dryRun).toBe(true);
      expect(json.created).toBe(1);
      expect(json.skipped).toBe(1);
      expect(json.items[0].questionId).toBe(created.items[0].questionId);
      expect(json.items[1].questionId).toBeNull();
      expect(await allQuestions()).toHaveLength(1);
    });

    it("校验失败的预演同样 400（预演不是绕过校验的通道）", async () => {
      const res = await postBatch(
        { questions: [choice({ answer: "Z" })] },
        { dryRun: true },
      );
      expect(res.status).toBe(400);
      expect(await allQuestions()).toHaveLength(0);
    });
  });
});
