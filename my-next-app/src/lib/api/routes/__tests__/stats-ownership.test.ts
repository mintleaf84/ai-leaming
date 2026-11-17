// @vitest-environment node
/**
 * `stats` 路由的跨用户归属校验。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT）、
 * 真实 `statsService`（总数 / 今日 / 连续天数都按 user_id 聚合）。不 mock 数据库。
 *
 * 这个模块没有资源 id、只做只读聚合。要证明的是聚合口径按用户：
 * B 的 totalCount / totalCorrect / todayCount / streakDays 只由 B 自己的答题日志算出，
 * A 的日志一条都不参与；而 A 自己看到的数字仍与自己的数据一致。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import dayjs from "dayjs";
import { sql } from "drizzle-orm";
import { sign } from "hono/jwt";
import { getBeijingDateString } from "@/lib/utils/datetime";

const dbFile = `test-cross-user-stats-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** 用户 A（另一份数据的属主）与用户 B（被观察的响应主体） */
const A = 991;
const B = 992;
const QUESTION_ID = 8051;
const SESSION_A = "sess-stats-a";
const SESSION_B1 = "sess-stats-b1";
const SESSION_B2 = "sess-stats-b2";

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let app: (typeof import("../stats"))["default"];

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

interface StatsBody {
  todayCount: number;
  todayCorrect: number;
  todayAccuracy: number;
  totalCount: number;
  totalCorrect: number;
  overallAccuracy: number;
  streakDays: number;
  totalSessions: number;
}

async function stats(token: string) {
  const res = await app.request("/", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { res, body: (await res.json()) as StatsBody };
}

/** 用北京时间算日期，保证和 service 的 date() 口径一致（不受运行机时区影响） */
function beijingDay(offset: number): string {
  const base = getBeijingDateString();
  return offset === 0
    ? base
    : dayjs(base).subtract(offset, "day").format("YYYY-MM-DD");
}

async function insertLog(
  sessionId: string,
  userId: number,
  isCorrect: boolean,
  dayOffset: number,
) {
  await dbm.drizzleDb.run(
    sql`INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms, timestamp)
        VALUES (${sessionId}, ${userId}, ${QUESTION_ID}, 'A', ${isCorrect ? 1 : 0}, 1000, ${`${beijingDay(dayOffset)} 10:00:00`})`,
  );
}

describe("stats 路由 · 跨用户归属", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    app = (await import("../stats")).default;

    for (const [id, name] of [
      [A, "stats-owner"],
      [B, "stats-other"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }
    await dbm.drizzleDb.run(
      sql`INSERT OR IGNORE INTO questions (id, content, options, answer, explanation, tags, dimension, type)
          VALUES (${QUESTION_ID}, '测试题：教育研究方法', '["A","B"]', 'A', '解析', '["研究方法"]', 'knowledge', 'single')`,
    );

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

    // A：今天 2 题（1 对 1 错）+ 昨天 1 对 + 前天 1 对 → 总 4 题对 3，连续 3 天
    await insertLog(SESSION_A, A, true, 0);
    await insertLog(SESSION_A, A, false, 0);
    await insertLog(SESSION_A, A, true, 1);
    await insertLog(SESSION_A, A, true, 2);

    // B：今天 5 题全对 + 昨天 1 对 → 总 6 题对 6，连续 2 天
    for (let i = 0; i < 5; i += 1) {
      await insertLog(i < 3 ? SESSION_B1 : SESSION_B2, B, true, 0);
    }
    await insertLog(SESSION_B2, B, true, 1);
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("B 的统计只由 B 的日志算出（另一个用户的答题不参与任何一项）", async () => {
    const { res, body } = await stats(await tokenFor(B));

    expect(res.status).toBe(200);
    // 若聚合漏了 user_id：todayCount 会是 7、totalCount 10、streak 3
    expect(body.todayCount).toBe(5);
    expect(body.todayCorrect).toBe(5);
    expect(body.todayAccuracy).toBe(1);
    expect(body.totalCount).toBe(6);
    expect(body.totalCorrect).toBe(6);
    expect(body.overallAccuracy).toBe(1);
    expect(body.streakDays).toBe(2);
    expect(body.totalSessions).toBe(2);
  });

  it("跨用户的今日口径互不影响：A 的今日数据与 B 的完全不同", async () => {
    const b = (await stats(await tokenFor(B))).body;
    const a = (await stats(await tokenFor(A))).body;

    expect(a.todayCount).toBe(2);
    expect(a.todayCorrect).toBe(1);
    expect(b.todayCount).toBe(5);
    expect(b.todayCorrect).toBe(5);
    // 关键：B 看到的不是两人之和
    expect(b.todayCount).not.toBe(a.todayCount + b.todayCount);
    expect(b.totalCount).not.toBe(a.totalCount + b.totalCount);
  });

  it("对照：A 自己的统计仍然完整正确（隔离不是靠清空换来的）", async () => {
    const { res, body } = await stats(await tokenFor(A));

    expect(res.status).toBe(200);
    expect(body.todayCount).toBe(2);
    expect(body.todayCorrect).toBe(1);
    expect(body.todayAccuracy).toBe(0.5);
    expect(body.totalCount).toBe(4);
    expect(body.totalCorrect).toBe(3);
    expect(body.overallAccuracy).toBe(0.75);
    expect(body.streakDays).toBe(3);
    expect(body.totalSessions).toBe(1);
  });
});
