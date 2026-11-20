// @vitest-environment node
/**
 * `/api/drafts/*` —— AI 草稿校对流（§34）。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT）、
 * 真实 `draftService` / `questionService` / `regradeQuestionLogs`。
 * 只 mock 外部 AI（PaddleOCR / 结构化生成）与向量索引（网络 + 独立连接）。
 *
 * 固定三件事：
 *   1. confirm 单事务：一条坏条目 → 整体回滚、草稿仍 ready；
 *   2. confirm 幂等：第二次 created=0，conflicts 指向已存在的题目；
 *   3. 归属：别人的草稿一律 404，读不到也改不动。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sign } from "hono/jwt";
import { sql } from "drizzle-orm";

const dbFile = `test-drafts-api-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

const OCR = vi.hoisted(() => ({ performPaddleOCR: vi.fn() }));
const AI = vi.hoisted(() => ({ generateStructuredData: vi.fn() }));

vi.mock("@/lib/ai/paddle-ocr", () => OCR);
vi.mock("@/lib/ai/client", () => AI);
vi.mock("@/lib/ai/config", () => ({
  getAiConfig: vi.fn().mockResolvedValue({
    apiKey: "test-key",
    baseURL: "https://api.example.com/v1",
    modelName: "mock-model",
  }),
}));
vi.mock("@/lib/services/question-vector-index", () => ({
  indexQuestion: vi.fn().mockResolvedValue("skipped"),
}));

const A = 941;
const B = 942;

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let app: (typeof import("../drafts"))["default"];
let questionService: (typeof import("@/lib/services/question"))["questionService"];

/** 1x1 PNG（只要能被 sha256/落盘/读取，不需要真的可识别） */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function tokenFor(userId: number): Promise<string> {
  return sign(
    {
      user: {
        id: userId,
        username: `draft-user-${userId}`,
        role: "student",
        token_version: 0,
      },
    },
    process.env.JWT_SECRET as string,
    "HS256",
  );
}

function auth(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function createDraft(token: string) {
  const res = await app.request("/", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ source: "camera", image_base64: PNG_BASE64 }),
  });
  return { res, body: await res.json() };
}

const VALID_ITEM = {
  content: "下列哪一项属于形成性评价？",
  options: ["A. 期末考试", "B. 课堂提问", "C. 单元测验", "D. 毕业考试"],
  answer: "B",
  explanation: "形成性评价发生在教学过程中，课堂提问最典型。",
  tags: ["教学评价"],
  type: "single",
  material_html: null,
};

describe("drafts API", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    ({ questionService } = await import("@/lib/services/question"));
    app = (await import("../drafts")).default;

    for (const [id, name] of [
      [A, "draft-owner"],
      [B, "draft-intruder"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }

    OCR.performPaddleOCR.mockResolvedValue(
      "1. 下列哪一项属于形成性评价？A...B...",
    );
    AI.generateStructuredData.mockResolvedValue({ items: [VALID_ITEM] });
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("创建 → 识别 → 确认入库；重复 confirm 幂等（created=0）", async () => {
    const tokenA = await tokenFor(A);
    const { res, body } = await createDraft(tokenA);
    expect(res.status).toBe(201);
    expect(body.draft.status).toBe("captured");
    expect(body.draft.image_sha256).toHaveLength(64);
    expect(OCR.performPaddleOCR).not.toHaveBeenCalled();

    const draftId = body.draft.id as string;

    const analyzed = await app.request(`/${draftId}/analyze`, {
      method: "POST",
      headers: auth(tokenA),
    });
    expect(analyzed.status).toBe(200);
    const analyzedBody = await analyzed.json();
    expect(analyzedBody.ok).toBe(true);
    expect(analyzedBody.draft.status).toBe("ready");
    expect(analyzedBody.draft.ai_prompt_version).toBe("draft-v1");
    expect(analyzedBody.draft.ai_model).toBe("mock-model");
    expect(analyzedBody.items).toHaveLength(1);

    const patched = await app.request(`/${draftId}/items/0`, {
      method: "PATCH",
      headers: auth(tokenA),
      body: JSON.stringify({ confirmed: true }),
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).items[0].confirmed).toBe(true);

    const confirmed = await app.request(`/${draftId}/confirm`, {
      method: "POST",
      headers: auth(tokenA),
    });
    expect(confirmed.status).toBe(200);
    const confirmedBody = await confirmed.json();
    expect(confirmedBody.created).toBe(1);
    expect(confirmedBody.skipped).toBe(0);
    expect(confirmedBody.conflicts).toBe(0);
    const questionId = confirmedBody.questionIds[0] as number;

    // 确认后 GET /api/questions/:id 可读到（同一份校验、同一张表）
    const created = await questionService.getById(questionId);
    expect(created?.content).toBe(VALID_ITEM.content);
    expect(created?.source).toBe("draft");

    // 幂等：第二次不再建题
    const again = await app.request(`/${draftId}/confirm`, {
      method: "POST",
      headers: auth(tokenA),
    });
    const againBody = await again.json();
    expect(againBody.created).toBe(0);
    expect(againBody.conflicts).toBe(1);
    expect(againBody.questionIds).toEqual([questionId]);

    const rows = await dbm.drizzleDb.all<{ n: number }>(
      sql`SELECT count(*) AS n FROM questions WHERE external_id = ${`draft:${draftId}:0`}`,
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it("confirm 单事务：一条坏条目 → 全回滚，草稿仍 ready", async () => {
    const tokenA = await tokenFor(A);
    const { body } = await createDraft(tokenA);
    const draftId = body.draft.id as string;

    // 绕过 AI：直接放两条 confirmed item，一条答案不在选项里
    await dbm.drizzleDb.run(
      sql`INSERT INTO question_draft_items
            (draft_id, idx, content, options, answer, explanation, tags, type, confirmed)
          VALUES
            (${draftId}, 0, '正常条目：1+1=?', '["A. 1","B. 2"]', 'B', '解析足够长', '["算术"]', 'single', 1),
            (${draftId}, 1, '坏条目：答案 Z 不存在', '["A. 1","B. 2"]', 'Z', '解析足够长', '["算术"]', 'single', 1)`,
    );
    await dbm.drizzleDb.run(
      sql`UPDATE question_drafts SET status = 'ready' WHERE id = ${draftId}`,
    );

    const res = await app.request(`/${draftId}/confirm`, {
      method: "POST",
      headers: auth(tokenA),
    });
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.issues.join(" ")).toMatch(/items\[1\]/);

    const rows = await dbm.drizzleDb.all<{ n: number }>(
      sql`SELECT count(*) AS n FROM questions WHERE external_id LIKE ${`draft:${draftId}:%`}`,
    );
    expect(Number(rows[0].n)).toBe(0);

    const [draftRow] = await dbm.drizzleDb.all<{ status: string }>(
      sql`SELECT status FROM question_drafts WHERE id = ${draftId}`,
    );
    expect(draftRow.status).toBe("ready");
  });

  it("归属：别人的草稿读不到、改不动、确认不了（跨用户统一 404）", async () => {
    const tokenA = await tokenFor(A);
    const tokenB = await tokenFor(B);
    const { body } = await createDraft(tokenA);
    const draftId = body.draft.id as string;

    const get = await app.request(`/${draftId}`, { headers: auth(tokenB) });
    expect(get.status).toBe(404);

    const patch = await app.request(`/${draftId}/items/0`, {
      method: "PATCH",
      headers: auth(tokenB),
      body: JSON.stringify({ confirmed: true }),
    });
    expect(patch.status).toBe(404);

    const confirm = await app.request(`/${draftId}/confirm`, {
      method: "POST",
      headers: auth(tokenB),
    });
    expect(confirm.status).toBe(404);

    const del = await app.request(`/${draftId}`, {
      method: "DELETE",
      headers: auth(tokenB),
    });
    expect(del.status).toBe(404);

    // 本人的仍然可读（上面的越权请求没有副作用）
    const mine = await app.request(`/${draftId}`, { headers: auth(tokenA) });
    expect(mine.status).toBe(200);
  });

  it("识别失败写 failed + error_code，且重试能成功", async () => {
    const tokenA = await tokenFor(A);
    const { body } = await createDraft(tokenA);
    const draftId = body.draft.id as string;

    OCR.performPaddleOCR.mockRejectedValueOnce(
      new Error("PADDLE_OCR_TOKEN 缺失，识别服务不可用"),
    );

    const failed = await app.request(`/${draftId}/analyze`, {
      method: "POST",
      headers: auth(tokenA),
    });
    expect(failed.status).toBe(200);
    const failedBody = await failed.json();
    expect(failedBody.ok).toBe(false);
    expect(failedBody.draft.status).toBe("failed");
    expect(failedBody.draft.error_code).toBe("ocr_failed");
    expect(failedBody.draft.ai_prompt_version).toBe("draft-v1");

    // 重试：同一草稿再次 analyze → ready
    OCR.performPaddleOCR.mockResolvedValue("重试成功的识别文本");
    AI.generateStructuredData.mockResolvedValueOnce({ items: [VALID_ITEM] });

    const retried = await app.request(`/${draftId}/analyze`, {
      method: "POST",
      headers: auth(tokenA),
    });
    const retriedBody = await retried.json();
    expect(retriedBody.ok).toBe(true);
    expect(retriedBody.draft.status).toBe("ready");
    expect(retriedBody.draft.error_code).toBeNull();
  });

  it("DELETE 软删除：status=discarded，重复调用幂等", async () => {
    const tokenA = await tokenFor(A);
    const { body } = await createDraft(tokenA);
    const draftId = body.draft.id as string;

    const first = await app.request(`/${draftId}`, {
      method: "DELETE",
      headers: auth(tokenA),
    });
    expect(first.status).toBe(200);
    expect((await first.json()).status).toBe("discarded");

    const second = await app.request(`/${draftId}`, {
      method: "DELETE",
      headers: auth(tokenA),
    });
    expect(second.status).toBe(200);

    const get = await app.request(`/${draftId}`, { headers: auth(tokenA) });
    expect((await get.json()).draft.status).toBe("discarded");
  });

  it("未登录一律 401", async () => {
    const res = await app.request("/", {
      method: "POST",
      body: JSON.stringify({ source: "text", text: "x" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("列表：只含本人草稿、默认排除 discarded、支持 status 过滤与计数", async () => {
    const tokenA = await tokenFor(A);
    const tokenB = await tokenFor(B);

    // B 的草稿不应出现在 A 的列表里（跨用户隔离）
    const { body: bDraft } = await createDraft(tokenB);

    const { body: first } = await createDraft(tokenA);
    const firstId = first.draft.id as string;
    // 让 first 有 2 条 items（1 条已确认），验证累计字段
    await dbm.drizzleDb.run(
      sql`INSERT INTO question_draft_items (draft_id, idx, content, confirmed)
          VALUES (${firstId}, 0, '条目一', 1), (${firstId}, 1, '条目二', 0)`,
    );

    const { body: third } = await createDraft(tokenA);
    const thirdId = third.draft.id as string;
    await dbm.drizzleDb.run(
      sql`UPDATE question_drafts SET created_at = '2020-01-01 00:00:00' WHERE id = ${firstId}`,
    );
    await dbm.drizzleDb.run(
      sql`UPDATE question_drafts SET created_at = '2030-01-01 00:00:00' WHERE id = ${thirdId}`,
    );

    const { body: second } = await createDraft(tokenA);
    const secondId = second.draft.id as string;
    await app.request(`/${secondId}`, {
      method: "DELETE",
      headers: auth(tokenA),
    });

    const res = await app.request("/", { headers: auth(tokenA) });
    expect(res.status).toBe(200);
    const list = (await res.json()).items as Array<{
      id: string;
      itemCount: number;
      confirmedCount: number;
      status: string;
      source: string;
    }>;

    const ids = list.map((item) => item.id);
    expect(ids).toContain(firstId);
    expect(ids).not.toContain(secondId); // discarded 默认隐藏
    expect(ids).not.toContain(bDraft.draft.id); // 跨用户隔离
    // created_at 倒序：2030 的 third 在 2020 的 first 之前
    expect(ids.indexOf(thirdId)).toBeLessThan(ids.indexOf(firstId));

    const target = list.find((item) => item.id === firstId)!;
    expect(target.itemCount).toBe(2);
    expect(target.confirmedCount).toBe(1);
    expect(target.status).toBe("captured");
    expect(target.source).toBe("camera");

    const discarded = await app.request("/?status=discarded", {
      headers: auth(tokenA),
    });
    const discardedIds = (
      (await discarded.json()).items as Array<{
        id: string;
      }>
    ).map((item) => item.id);
    expect(discardedIds).toContain(secondId);
    expect(discardedIds).not.toContain(firstId);
  });
});
