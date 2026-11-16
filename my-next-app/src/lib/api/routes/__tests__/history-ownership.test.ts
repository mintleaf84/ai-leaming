// @vitest-environment node
/**
 * `history` 路由的跨用户归属校验（IDOR 防护）。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT
 * 签名校验 + token_version 会话撤销检查）、真实 `historyService`。不 mock 数据库，
 * 也不 mock `getCurrentUser` —— 身份完全由请求头里的 JWT 决定。
 *
 * 要证明的事：A 的练习会话，另一个用户 B 拿着同一个 sessionId 查不到。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { sign } from "hono/jwt";

const dbFile = `test-cross-user-history-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** 用户 A（数据所有者）与用户 B（跨用户访客） */
const A = 901;
const B = 902;
const SESSION_A = "sess-cross-a";
const QUESTION_ID = 8001;
/** 只有 A 提交过的答案，用它判断响应里有没有泄露 A 的数据 */
const A_ANSWER = "A-SECRET-ANSWER";

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let app: (typeof import("../history"))["default"];

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

function get(pathname: string, token: string) {
  return app.request(pathname, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe("history 路由 · 跨用户归属", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    app = (await import("../history")).default;

    for (const [id, name] of [
      [A, "cross-user-a"],
      [B, "cross-user-b"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }
    await dbm.drizzleDb.run(
      sql`INSERT OR IGNORE INTO questions (id, content, options, answer, explanation, tags, dimension, type)
          VALUES (${QUESTION_ID}, '测试题：教育目的的价值取向', '["A. 个人本位","B. 社会本位"]', 'B', '解析', '["教育目的"]', 'knowledge', 'single')`,
    );
    await dbm.drizzleDb.run(
      sql`INSERT OR IGNORE INTO practice_sessions (id, user_id, session_name, total_questions, correct_count, practice_mode, questions_json)
          VALUES (${SESSION_A}, ${A}, 'A 的会话', 1, 0, 'random', '[]')`,
    );
    await dbm.drizzleDb.run(
      sql`INSERT OR IGNORE INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms)
          VALUES (${SESSION_A}, ${A}, ${QUESTION_ID}, ${A_ANSWER}, 0, 3000)`,
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

  it("样本是真的：A 用自己的 JWT 能读到会话详情", async () => {
    const res = await get(`/${SESSION_A}`, await tokenFor(A));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session: { id: string };
      logs: unknown[];
    };
    expect(body.session.id).toBe(SESSION_A);
    expect(body.logs).toHaveLength(1);
  });

  it("另一个用户拿 A 的 sessionId 查详情：404，响应里不含 A 的任何数据", async () => {
    const res = await get(`/${SESSION_A}`, await tokenFor(B));

    expect(res.status).toBe(404);
    const text = await res.text();
    // 既不返回数据，也不回显 A 的答案（避免用"存在性"反推别人有没有这个会话）
    expect(text).not.toContain(A_ANSWER);
    expect(text).not.toContain(SESSION_A);
  });

  it("跨用户的列表隔离：B 的历史列表里没有 A 的会话", async () => {
    const res = await get("/?page=1&pageSize=10", await tokenFor(B));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { id: string }[];
      total: number;
    };
    expect(body.items.map((i) => i.id)).not.toContain(SESSION_A);
    expect(body.total).toBe(0);

    // 对照：A 自己的列表里能看到它（证明"看不到"是因为归属，不是因为没数据）
    const own = await get("/?page=1&pageSize=10", await tokenFor(A));
    const ownBody = (await own.json()) as { items: { id: string }[] };
    expect(ownBody.items.map((i) => i.id)).toContain(SESSION_A);
  });
});
