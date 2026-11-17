// @vitest-environment node
/**
 * `profile` 路由的跨用户归属校验。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT）、
 * 路由内的 Drizzle 聚合查询。不 mock 数据库。
 *
 * 这个模块没有资源 id —— 它读的就是"当前用户是谁"。要证明的是：
 * 另一个用户 B 的画像只由 B 自己的会话/答题/卡片/错题算出来，A 的数据一条都不进
 * B 的响应；而 A 自己的画像仍然正确。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { sign } from "hono/jwt";

const dbFile = `test-cross-user-profile-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** 用户 A（另一份数据的属主）与用户 B（被观察的响应主体） */
const A = 981;
const B = 982;
const A_NAME = "profile-owner";
const B_NAME = "profile-other";
const SESSION_A = "sess-profile-a";
const SESSION_B1 = "sess-profile-b1";
const SESSION_B2 = "sess-profile-b2";
const Q = [8041, 8042, 8043, 8044];

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let app: (typeof import("../profile"))["default"];

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

interface ProfileBody {
  id: number;
  username: string;
  role: string;
  stats: {
    totalSessions: number;
    totalAnswered: number;
    totalCorrect: number;
    overallAccuracy: number;
    knowledgeCardCount: number;
    wrongBookCount: number;
  };
}

async function profile(token: string) {
  const res = await app.request("/", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { res, body: (await res.json()) as ProfileBody };
}

describe("profile 路由 · 跨用户归属", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    app = (await import("../profile")).default;

    for (const [id, name] of [
      [A, A_NAME],
      [B, B_NAME],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version, role)
            VALUES (${id}, ${name}, 'x', 0, 'student')`,
      );
    }
    for (const id of Q) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO questions (id, content, options, answer, explanation, tags, dimension, type)
            VALUES (${id}, ${`测试题 ${id}：课程理论`}, '["A","B"]', 'A', '解析', '["课程"]', 'knowledge', 'single')`,
      );
    }

    for (const [id, owner] of [
      [SESSION_A, A],
      [SESSION_B1, B],
      [SESSION_B2, B],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO practice_sessions (id, user_id, session_name, total_questions, correct_count, practice_mode, questions_json)
            VALUES (${id}, ${owner}, '会话', 1, 0, 'random', '[]')`,
      );
    }

    // A：4 题对 2（q1/q4 对，q2/q3 错），q3 已标记掌握 → 错题本剩 q2
    for (const [qid, isCorrect] of [
      [Q[0], 1],
      [Q[1], 0],
      [Q[2], 0],
      [Q[3], 1],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms)
            VALUES (${SESSION_A}, ${A}, ${qid}, 'A', ${isCorrect}, 1000)`,
      );
    }
    await dbm.drizzleDb.run(
      sql`INSERT OR IGNORE INTO mastered_questions (user_id, question_id) VALUES (${A}, ${Q[2]})`,
    );

    // B：3 题全对，分布在 2 个会话；0 张知识卡以外的数据不掺入
    for (const [qid, sessionId] of [
      [Q[0], SESSION_B1],
      [Q[1], SESSION_B1],
      [Q[2], SESSION_B2],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms)
            VALUES (${sessionId}, ${B}, ${qid}, 'A', 1, 1000)`,
      );
    }

    // 知识卡：A 3 张，B 1 张
    for (const [owner, title] of [
      [A, "A 卡 1"],
      [A, "A 卡 2"],
      [A, "A 卡 3"],
      [B, "B 卡"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT INTO knowledge_cards (user_id, title, category, tags, front, back, key_points)
            VALUES (${owner}, ${title}, '分类', '[]', '正面', '背面', '[]')`,
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

  it("B 的画像只含 B 自己的身份与统计（另一个用户的会话/答题/卡片都不计入）", async () => {
    const { res, body } = await profile(await tokenFor(B));

    expect(res.status).toBe(200);
    expect(body.id).toBe(B);
    expect(body.username).toBe(B_NAME);

    // 若聚合漏了 user_id：会话会变成 3、答题 7、卡片 4
    expect(body.stats.totalSessions).toBe(2);
    expect(body.stats.totalAnswered).toBe(3);
    expect(body.stats.totalCorrect).toBe(3);
    expect(body.stats.overallAccuracy).toBe(1);
    expect(body.stats.knowledgeCardCount).toBe(1);
    expect(body.stats.wrongBookCount).toBe(0);
  });

  it("响应文本里不出现 A 的用户名（跨用户身份不泄露）", async () => {
    const res = await app.request("/", {
      headers: { Authorization: `Bearer ${await tokenFor(B)}` },
    });
    const text = await res.text();
    expect(text).not.toContain(A_NAME);
    expect(text).toContain(B_NAME);
  });

  it("对照：A 自己的画像仍然正确（隔离不是靠清零换来的）", async () => {
    const { res, body } = await profile(await tokenFor(A));

    expect(res.status).toBe(200);
    expect(body.id).toBe(A);
    expect(body.stats.totalSessions).toBe(1);
    expect(body.stats.totalAnswered).toBe(4);
    expect(body.stats.totalCorrect).toBe(2);
    expect(body.stats.overallAccuracy).toBe(0.5);
    expect(body.stats.knowledgeCardCount).toBe(3);
    // q2/q3 答错，q3 已掌握 → 只剩 q2
    expect(body.stats.wrongBookCount).toBe(1);
  });
});
