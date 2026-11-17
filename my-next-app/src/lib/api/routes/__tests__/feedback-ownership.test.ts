// @vitest-environment node
/**
 * `feedback` 路由的跨用户归属校验（IDOR 防护）。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT）、
 * 真实 `questionFeedbackService`。不 mock 数据库，身份只由 JWT 决定。
 *
 * 这个模块的越权面与别的模块不同：用户端只有"提交反馈"一个写端点，没有按
 * feedbackId 读取的入口。所以跨用户隔离要证明两件事：
 *
 * 1. 反馈的 `user_id` 只能来自 JWT —— B 在请求体里伪造 `user_id: A` 也改不了归属；
 * 2. 用户端确实没有"拿 feedbackId 读别人反馈"的路径（读了会 404，而不是返回数据）。
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { sign } from "hono/jwt";

const dbFile = `test-cross-user-feedback-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** 用户 A（反馈所有者）与用户 B（跨用户访客） */
const A = 941;
const B = 942;
const QUESTION_ID = 8031;
const A_DESC = "A-反馈：答案疑似有误";

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let app: (typeof import("../feedback"))["default"];

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

function submit(token: string, body: Record<string, unknown>) {
  return app.request("/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function rowsOf(userId: number) {
  return dbm.drizzleDb.all<{ id: number; description: string | null }>(
    sql`SELECT id, description FROM question_feedback
        WHERE user_id = ${userId} AND question_id = ${QUESTION_ID}
        ORDER BY id`,
  );
}

/**
 * 直接落一条反馈，返回它的 id。
 * 用例据此定位"自己种下的那条"，单条 `-t` 跑时也不依赖别的用例先写入。
 */
async function seedFeedback(
  userId: number,
  description: string,
): Promise<number> {
  const inserted = await dbm.drizzleDb.run(
    sql`INSERT INTO question_feedback (question_id, user_id, feedback_type, description)
        VALUES (${QUESTION_ID}, ${userId}, 'wrong_answer', ${description})`,
  );
  return Number(inserted.lastInsertRowid);
}

describe("feedback 路由 · 跨用户归属", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    app = (await import("../feedback")).default;

    for (const [id, name] of [
      [A, "feedback-owner"],
      [B, "feedback-intruder"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }
    await dbm.drizzleDb.run(
      sql`INSERT OR IGNORE INTO questions (id, content, options, answer, explanation, tags, dimension, type)
          VALUES (${QUESTION_ID}, '测试题：科尔伯格道德发展阶段', '["A. 前习俗","B. 后习俗"]', 'B', '解析', '["品德发展"]', 'knowledge', 'single')`,
    );
  });

  // 幂等基线：两个用户在该题上的反馈全部清掉，每条用例自己 seedFeedback。
  beforeEach(async () => {
    await dbm.drizzleDb.run(
      sql`DELETE FROM question_feedback
          WHERE question_id = ${QUESTION_ID}
            AND (user_id = ${A} OR user_id = ${B})`,
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

  it("A 提交反馈：落库归属是 A（对照，证明样本是真的）", async () => {
    const res = await submit(await tokenFor(A), {
      question_id: QUESTION_ID,
      feedback_type: "wrong_answer",
      description: A_DESC,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; id: number };
    expect(body.success).toBe(true);

    const rows = await rowsOf(A);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(body.id);
    expect(rows[0].description).toBe(A_DESC);
  });

  it("B 在请求体里伪造 user_id 指向 A：归属仍按 JWT 记在 B 名下", async () => {
    // A 名下先有一条自己的反馈，用来证明 B 的提交没有混进 A
    const aFeedbackId = await seedFeedback(A, A_DESC);

    const res = await submit(await tokenFor(B), {
      question_id: QUESTION_ID,
      feedback_type: "wrong_content",
      description: "B 的反馈",
      // 伪造他人身份：服务端必须忽略请求体里的 user_id
      user_id: A,
    });

    expect(res.status).toBe(200);

    const bRows = await rowsOf(B);
    expect(bRows).toHaveLength(1);
    expect(bRows[0].description).toBe("B 的反馈");
    // B 的反馈是新的一行，不是改写了 A 的那行
    expect(bRows[0].id).not.toBe(aFeedbackId);

    // A 名下仍然只有自己的那一条，别人的提交没有混进来
    const aRows = await rowsOf(A);
    expect(aRows).toHaveLength(1);
    expect(aRows[0].id).toBe(aFeedbackId);
    expect(aRows[0].description).toBe(A_DESC);
  });

  it("用户端没有按 feedbackId 读取他人反馈的入口（GET 直接 404）", async () => {
    // 自己种一条真实存在的 A 反馈：拿它的 id 去试，才能证明 404 不是"id 本来就不存在"
    const aFeedbackId = await seedFeedback(A, A_DESC);

    for (const pathname of ["/", `/${aFeedbackId}`]) {
      const res = await app.request(pathname, {
        headers: { Authorization: `Bearer ${await tokenFor(B)}` },
      });
      expect(res.status).toBe(404);
      const text = await res.text();
      // 连"这个 id 存在"都不该回显
      expect(text).not.toContain(A_DESC);
    }
  });
});
