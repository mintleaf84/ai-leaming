// @vitest-environment node
/**
 * `knowledge` 路由的跨用户归属校验（IDOR 防护）。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT）、
 * 真实知识卡服务（列表/统计/分类都带 user_id 过滤）。不 mock 数据库。
 * 唯一被替掉的是 RAG 向量索引（`ragService`），因为它会把卡片文本发去外部
 * embedding 接口；卡片落库本身仍然走真实 DB 与真实 user_id 归属。
 *
 * 要证明的事：A 的自定义知识卡，另一个用户 B 在列表里看不到、按 id 点名要不到、
 * Anki 导出也拿不走；同时 A 自己的列表照常能看到。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { sign } from "hono/jwt";

const dbFile = `test-cross-user-knowledge-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

// 只替掉向量索引（外部 embedding 调用），卡片写入与归属校验保持真实。
vi.mock("@/lib/ai/rag", () => ({
  ragService: {
    addChunk: async () => {},
    deleteChunksBySource: () => {},
  },
}));

/** 用户 A（卡片所有者）与用户 B（跨用户访客） */
const A = 961;
const B = 962;
/** 只有 A 才有的分类与正文标记，用来判断响应里有没有混进 A 的卡片 */
const A_CATEGORY = "只有A才有的分类";
const A_FRONT = "A-自定义卡正面标记";

type DbModule = typeof import("@/lib/db");
type KnowledgeApp = (typeof import("../knowledge"))["default"];
let dbm: DbModule;
let app: KnowledgeApp;
let aCardId: number;

async function tokenFor(userId: number): Promise<string> {
  return sign(
    {
      user: {
        id: userId,
        username: `cross-user-${userId}`,
        role: "student",
        token_version: 0,
      },
    },
    process.env.JWT_SECRET as string,
    "HS256",
  );
}

function createCard(token: string, body: Record<string, unknown>) {
  return app.request("/cards", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

function listCards(token: string, query = "") {
  return app.request(`/cards${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

interface ListBody {
  cards: { id: number; front: string; category: string }[];
  categories: string[];
  stats: { total: number };
}

describe("knowledge 路由 · 跨用户归属", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    app = (await import("../knowledge")).default;

    for (const [id, name] of [
      [A, "knowledge-owner"],
      [B, "knowledge-intruder"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }

    // A 的自定义卡
    const aRes = await createCard(await tokenFor(A), {
      title: "A 的自定义卡",
      category: A_CATEGORY,
      tags: ["A专属标签"],
      front: A_FRONT,
      back: "A 的答案",
    });
    expect(aRes.status).toBe(200);
    aCardId = ((await aRes.json()) as { id: number }).id;

    // B 也建一张，用来区分"看不到"和"没数据"
    const bRes = await createCard(await tokenFor(B), {
      title: "B 的自定义卡",
      category: "B 的分类",
      tags: ["B标签"],
      front: "B-自定义卡正面",
      back: "B 的答案",
    });
    expect(bRes.status).toBe(200);
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("卡片写入的 user_id 来自 JWT：A 的卡归 A，B 的卡归 B", async () => {
    const aRow = await dbm.drizzleDb.get<{ user_id: number }>(
      sql`SELECT user_id FROM knowledge_cards WHERE id = ${aCardId}`,
    );
    expect(aRow?.user_id).toBe(A);

    const bRow = await dbm.drizzleDb.get<{ user_id: number }>(
      sql`SELECT user_id FROM knowledge_cards WHERE front = 'B-自定义卡正面'`,
    );
    expect(bRow?.user_id).toBe(B);
  });

  it("B 的列表里没有 A 的卡：卡片、分类、统计都只算 B 自己的", async () => {
    const res = await listCards(await tokenFor(B));

    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body.cards.map((c) => c.id)).not.toContain(aCardId);
    expect(body.cards.map((c) => c.front)).not.toContain(A_FRONT);
    // 只有 A 才有的分类不能出现在 B 的分类列表里
    expect(body.categories).not.toContain(A_CATEGORY);
    expect(body.stats.total).toBe(1);
  });

  it("B 用 ids 参数直接点名 A 的卡：仍然拿不到（user_id 条件不会被绕过）", async () => {
    const res = await listCards(await tokenFor(B), `?ids=${aCardId}`);

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(A_FRONT);
    const body = JSON.parse(text) as ListBody;
    expect(body.cards).toHaveLength(0);
  });

  it("B 导出 Anki 时也拿不到 A 的卡片内容", async () => {
    const res = await listCards(await tokenFor(B), "?format=anki");

    expect(res.status).toBe(200);
    const tsv = await res.text();
    expect(tsv).not.toContain(A_FRONT);
    expect(tsv).not.toContain(A_CATEGORY);
    expect(tsv).toContain("B-自定义卡正面");
  });

  it("对照：A 自己的列表能看到自己的卡与专属分类", async () => {
    const res = await listCards(await tokenFor(A));

    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body.cards.map((c) => c.id)).toContain(aCardId);
    expect(body.categories).toContain(A_CATEGORY);
    expect(body.stats.total).toBe(1);
  });
});
