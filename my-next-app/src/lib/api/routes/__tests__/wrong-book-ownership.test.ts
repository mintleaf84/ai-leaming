// @vitest-environment node
/**
 * `wrong-book` 路由的跨用户归属校验（IDOR 防护）。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT）、
 * 路由内直接写库的 Drizzle 查询。不 mock 数据库，身份只由 JWT 决定。
 *
 * 错题本没有独立的"标记表"：错题 = 当前用户 is_correct=0 的 practice_logs，
 * "已掌握" = mastered_questions 里 (user_id, question_id) 这一行。两者都带 user_id，
 * 所以按用户隔离要证明的是：A 的错题/已掌握标记，另一个用户 B 既看不到、也改不动。
 *
 * 注：`GET /api/wrong-book/`（列表）与 `/by-tag` 曾经因为 ORDER BY 引用 select 的 JS key
 * （`wrongCount`，drizzle 没有生成 `AS` 别名）恒 500；现在排序列改用聚合表达式，
 * 文件末尾用真实库断言列表内容，而不只是状态码。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { sign } from "hono/jwt";

const dbFile = `test-cross-user-wrong-book-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** 用户 A（错题所有者）与用户 B（跨用户访客） */
const A = 931;
const B = 932;
/** Q1：A 做错过；Q2：A 做错过且已标记为"已掌握" */
const Q1 = 8031;
const Q2 = 8032;
/** 只有 A 提交过的答案，用来判断详情里有没有泄露 A 的作答 */
const A_ANSWER = "A-WRONG-ANSWER";

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let app: (typeof import("../wrong-book"))["default"];

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

function headers(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function wrongStats(token: string) {
  const res = await app.request("/stats", { headers: headers(token) });
  expect(res.status).toBe(200);
  return (await res.json()) as { total: number; recent: number };
}

async function randomIds(token: string): Promise<string[]> {
  const res = await app.request("/random?count=20", {
    headers: headers(token),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { questionId: string }[];
  return body.map((r) => r.questionId);
}

async function masteredCount(userId: number, questionId: number) {
  const row = await dbm.drizzleDb.get<{ c: number }>(
    sql`SELECT COUNT(*) AS c FROM mastered_questions
        WHERE user_id = ${userId} AND question_id = ${questionId}`,
  );
  return Number(row?.c ?? 0);
}

describe("wrong-book 路由 · 跨用户归属", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    app = (await import("../wrong-book")).default;

    for (const [id, name] of [
      [A, "wrong-book-owner"],
      [B, "wrong-book-intruder"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }
    for (const [id, text] of [
      [Q1, "测试题：学生的认知风格差异"],
      [Q2, "测试题：课堂管理的预防性策略"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO questions (id, content, options, answer, explanation, tags, dimension, type)
            VALUES (${id}, ${text}, '["A. 选项一","B. 选项二"]', 'B', '解析', '["教育心理"]', 'knowledge', 'single')`,
      );
    }
    for (const qId of [Q1, Q2]) {
      await dbm.drizzleDb.run(
        sql`INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms)
            VALUES (NULL, ${A}, ${qId}, ${A_ANSWER}, 0, 2000)`,
      );
    }
    // A 把 Q2 标记为已掌握
    await dbm.drizzleDb.run(
      sql`INSERT INTO mastered_questions (user_id, question_id) VALUES (${A}, ${Q2})`,
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

  it("A 的错题不出现在另一个用户的错题集与统计里", async () => {
    expect(await wrongStats(await tokenFor(B))).toMatchObject({
      total: 0,
      recent: 0,
    });
    expect(await randomIds(await tokenFor(B))).toEqual([]);

    // 对照组：A 自己看得见（证明"看不到"是因为归属，不是因为没数据）。
    // /random 会排除 A 自己标记为已掌握的 Q2，所以只出现 Q1。
    expect((await wrongStats(await tokenFor(A))).total).toBe(2);
    expect(await randomIds(await tokenFor(A))).toEqual([String(Q1)]);
  });

  it("B 查 A 错题的详情：拿不到 A 的作答与错误次数", async () => {
    const res = await app.request(`/${Q1}`, {
      headers: headers(await tokenFor(B)),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      wrongCount: number;
      userLastAnswer: string;
      historyLogs: unknown[];
    };
    // 题目本身是全局题库（不含个人数据），但错题维度的数据必须全是 0/空
    expect(body.wrongCount).toBe(0);
    expect(body.userLastAnswer).toBe("");
    expect(body.historyLogs).toEqual([]);
    expect(JSON.stringify(body)).not.toContain(A_ANSWER);
  });

  it("B 标记已掌握只写 B 自己的行：A 的错题统计不受影响", async () => {
    const res = await app.request(`/${Q1}/master`, {
      method: "POST",
      headers: headers(await tokenFor(B)),
    });
    expect(res.status).toBe(200);

    expect(await masteredCount(B, Q1)).toBe(1);
    expect(await masteredCount(A, Q1)).toBe(0);
    expect((await wrongStats(await tokenFor(A))).total).toBe(2);
  });

  it("B 取消掌握删不掉 A 的标记：A 的 Q2 仍处于已掌握", async () => {
    const res = await app.request(`/${Q2}/master`, {
      method: "DELETE",
      headers: headers(await tokenFor(B)),
    });
    expect(res.status).toBe(200);

    expect(await masteredCount(A, Q2)).toBe(1);
    // A 的详情里 Q2 仍有错误记录（已掌握状态没被 B 抹掉）
    const detail = await app.request(`/${Q2}`, {
      headers: headers(await tokenFor(A)),
    });
    await expect(detail.json()).resolves.toMatchObject({ wrongCount: 1 });
  });

  it("GET / 列表可用，且只列出 A 自己的未掌握错题（ORDER BY 不再引用 JS 别名）", async () => {
    const res = await app.request("/", { headers: headers(await tokenFor(A)) });
    expect(res.status).toBe(200);

    const list = (await res.json()) as {
      questionId: string;
      wrongCount: number;
      lastWrongAt: string;
      userLastAnswer: string;
      correctAnswer: string;
      tags: string[];
    }[];
    // Q2 已被 A 标记为已掌握，列表只应剩 Q1
    expect(list.map((r) => r.questionId)).toEqual([String(Q1)]);
    expect(list[0]).toMatchObject({
      wrongCount: 1,
      userLastAnswer: A_ANSWER,
      correctAnswer: "B",
      tags: ["教育心理"],
    });
    // lastWrongAt 由 MAX(timestamp) 聚合而来，必须真有值（排序键不再是空串）
    expect(list[0].lastWrongAt).not.toBe("");

    // 另一个用户看不到任何一条（列表按 user_id 过滤，不是共享视图）
    const resB = await app.request("/", { headers: headers(await tokenFor(B)) });
    expect(resB.status).toBe(200);
    const listB = (await resB.json()) as { questionId: string }[];
    expect(listB).toEqual([]);
  });

  it("GET /by-tag 分组可用，且分组内容同样只含 A 自己的错题", async () => {
    const res = await app.request("/by-tag", {
      headers: headers(await tokenFor(A)),
    });
    expect(res.status).toBe(200);

    const groups = (await res.json()) as {
      tag: string;
      count: number;
      questions: { questionId: string; wrongCount: number }[];
    }[];
    expect(groups.map((g) => g.tag)).toEqual(["教育心理"]);
    expect(groups[0].count).toBe(1);
    expect(groups[0].questions[0]).toMatchObject({
      questionId: String(Q1),
      wrongCount: 1,
    });

    const resB = await app.request("/by-tag", {
      headers: headers(await tokenFor(B)),
    });
    expect(resB.status).toBe(200);
    await expect(resB.json()).resolves.toEqual([]);
  });
});
