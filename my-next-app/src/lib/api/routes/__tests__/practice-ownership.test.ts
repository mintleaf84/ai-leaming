// @vitest-environment node
/**
 * `practice` 路由的跨用户归属校验（IDOR 防护）。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT）、
 * 真实 `practiceService`（含掌握度与 SRS 落库）。不 mock 数据库，身份只由 JWT 决定。
 *
 * 要证明的事：A 的练习会话，另一个用户 B 不能往里面提交答案；B 的提交也不能改动
 * A 的会话统计。查询路径上没有独立 GET 端点（会话详情走 `/api/history/:id`，
 * 见 history-ownership.test.ts），所以这里聚焦"提交"这个写路径。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { sign } from "hono/jwt";

const dbFile = `test-cross-user-practice-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** 用户 A（会话所有者）与用户 B（跨用户访客） */
const A = 911;
const B = 912;
/** A 的会话：一个用于检查统计是否被污染，一个用于检查是否被写入 */
const SESSION_A_STATS = "sess-practice-a-stats";
const SESSION_A_WRITE = "sess-practice-a-write";
const SESSION_B = "sess-practice-b";
const QUESTION_ID = 8011;
const B_ANSWER_MARK = "B-INJECTED-ANSWER";

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let app: (typeof import("../practice"))["default"];

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

function submit(token: string, sessionId: string, userAnswer: string) {
  return app.request(`/session/${sessionId}/submit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ questionId: QUESTION_ID, userAnswer, duration: 1200 }),
  });
}

async function sessionStats(sessionId: string) {
  return (await dbm.drizzleDb.get<{ correct_count: number; user_id: number }>(
    sql`SELECT correct_count, user_id FROM practice_sessions WHERE id = ${sessionId}`,
  )) ?? null;
}

async function logCount(sessionId: string, userId: number): Promise<number> {
  const row = await dbm.drizzleDb.get<{ c: number }>(
    sql`SELECT COUNT(*) AS c FROM practice_logs
        WHERE session_id = ${sessionId} AND user_id = ${userId}`,
  );
  return Number(row?.c ?? 0);
}

describe("practice 路由 · 跨用户归属", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    app = (await import("../practice")).default;

    for (const [id, name] of [
      [A, "practice-owner"],
      [B, "practice-intruder"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }
    await dbm.drizzleDb.run(
      sql`INSERT OR IGNORE INTO questions (id, content, options, answer, explanation, tags, dimension, type)
          VALUES (${QUESTION_ID}, '测试题：教学原则中的直观性原则', '["A. 直观性原则","B. 启发性原则"]', 'B', '解析', '["教学原则"]', 'knowledge', 'single')`,
    );
    for (const [id, owner] of [
      [SESSION_A_STATS, A],
      [SESSION_A_WRITE, A],
      [SESSION_B, B],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO practice_sessions (id, user_id, session_name, total_questions, correct_count, practice_mode, questions_json)
            VALUES (${id}, ${owner}, '会话', 1, 0, 'random', '[]')`,
      );
    }
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("B 在自己的会话里提交：正常记账（证明这不是被一刀切拒绝）", async () => {
    const res = await submit(await tokenFor(B), SESSION_B, "B");

    expect(res.status).toBe(200);
    expect(await logCount(SESSION_B, B)).toBe(1);
    expect((await sessionStats(SESSION_B))?.correct_count).toBe(1);
  });

  it("跨用户的提交不会改动 A 的会话统计（UPDATE 带了 user_id 条件）", async () => {
    await submit(await tokenFor(B), SESSION_A_STATS, "B");

    const stats = await sessionStats(SESSION_A_STATS);
    // 这一半实现是对的：会话的 correct_count 只认会话所有者
    expect(stats?.user_id).toBe(A);
    expect(stats?.correct_count).toBe(0);
  });

  it.fails(
    "B 拿 A 的 sessionId 提交：应被拒绝，且不在 A 的会话里留下日志（实际 200 且写入）",
    async () => {
      const res = await submit(await tokenFor(B), SESSION_A_WRITE, B_ANSWER_MARK);

      // 端点只校验了登录（authMiddleware），没有校验 sessionId 属于当前用户，
      // 于是 B 的答题日志被插进 A 的会话；A 打开会话详情（/api/history/:id，
      // 其日志查询只按 session_id 过滤）就会看到别人的作答。
      expect(await logCount(SESSION_A_WRITE, B)).toBe(0);
      expect(res.status).toBe(404);
    },
  );
});
