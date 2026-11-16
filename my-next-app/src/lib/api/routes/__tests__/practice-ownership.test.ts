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

  it("跨用户的提交不会改动 A 的会话统计（整个请求被 404 挡在事务外）", async () => {
    const res = await submit(await tokenFor(B), SESSION_A_STATS, "B");
    expect(res.status).toBe(404);

    const stats = await sessionStats(SESSION_A_STATS);
    expect(stats?.user_id).toBe(A);
    expect(stats?.correct_count).toBe(0);
    expect(await logCount(SESSION_A_STATS, B)).toBe(0);
  });

  it("B 拿 A 的 sessionId 提交：404，且不在 A 的会话里留下日志", async () => {
    const res = await submit(await tokenFor(B), SESSION_A_WRITE, B_ANSWER_MARK);

    // 404 而不是 403：不泄露"这个会话存在"
    expect(res.status).toBe(404);
    // 关键断言：越权写没有落库（修复前是 200 并插入一行 user_id=B, session_id=A）
    expect(await logCount(SESSION_A_WRITE, B)).toBe(0);
    expect(await logCount(SESSION_A_WRITE, A)).toBe(0);
    // A 的会话统计也没被污染
    expect((await sessionStats(SESSION_A_WRITE))?.correct_count).toBe(0);
  });

  it("A 自己提交：仍然 200 且日志正常落库（证明不是把功能关了）", async () => {
    // 正确答案是 B：答对时日志与 correct_count 都要 +1
    const res = await submit(await tokenFor(A), SESSION_A_WRITE, "B");

    expect(res.status).toBe(200);
    expect(await logCount(SESSION_A_WRITE, A)).toBe(1);
    expect((await sessionStats(SESSION_A_WRITE))?.correct_count).toBe(1);
  });
});
