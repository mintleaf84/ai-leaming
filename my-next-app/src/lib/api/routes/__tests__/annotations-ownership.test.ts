// @vitest-environment node
/**
 * `annotations` 路由的跨用户归属校验（IDOR 防护）。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT）、
 * 路由内直接写库的 Drizzle 语句。不 mock 数据库，身份只由 JWT 决定。
 *
 * 批注是"某一用户在某一题上的划线"，questionId 是全局的，但批注本体是私有的。
 * 要证明：A 的批注，另一个用户 B 既读不到、也改不动、更删不掉。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { sign } from "hono/jwt";

const dbFile = `test-cross-user-annotations-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** 用户 A（批注所有者）与用户 B（跨用户访客） */
const A = 921;
const B = 922;
const QUESTION_ID = 8021;
/** A 的批注：题干 0-10 个字符划 highlight，颜色 = 只有 A 用的色号 */
const A_START = 0;
const A_END = 10;
const A_COLOR = "#a-secret-color";

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let app: (typeof import("../annotations"))["default"];
let aAnnotationId: number;

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

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function annotationRows(userId: number) {
  return dbm.drizzleDb.all<{ id: number; tag: string; color: string | null }>(
    sql`SELECT id, tag, color FROM text_annotations
        WHERE user_id = ${userId} AND question_id = ${QUESTION_ID}
        ORDER BY id`,
  );
}

describe("annotations 路由 · 跨用户归属", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    app = (await import("../annotations")).default;

    for (const [id, name] of [
      [A, "annotation-owner"],
      [B, "annotation-intruder"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }
    await dbm.drizzleDb.run(
      sql`INSERT OR IGNORE INTO questions (id, content, options, answer, explanation, tags, dimension, type)
          VALUES (${QUESTION_ID}, '测试题：班杜拉的社会学习理论强调什么', '["A. 直接强化","B. 观察学习"]', 'B', '解析', '["学习理论"]', 'knowledge', 'single')`,
    );
    await dbm.drizzleDb.run(
      sql`INSERT INTO text_annotations (user_id, question_id, start_offset, end_offset, tag, color)
          VALUES (${A}, ${QUESTION_ID}, ${A_START}, ${A_END}, 'highlight', ${A_COLOR})`,
    );
    const [row] = await annotationRows(A);
    aAnnotationId = row.id;
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("同一道题上按用户隔离：B 读不到 A 的批注，A 自己读得到", async () => {
    const asB = await app.request(`/?questionId=${QUESTION_ID}`, {
      headers: authHeaders(await tokenFor(B)),
    });
    expect(asB.status).toBe(200);
    const bBody = (await asB.json()) as { annotations: unknown[] };
    expect(bBody.annotations).toEqual([]);

    // 对照：数据确实存在，只是不属于 B
    const asA = await app.request(`/?questionId=${QUESTION_ID}`, {
      headers: authHeaders(await tokenFor(A)),
    });
    const aBody = (await asA.json()) as { annotations: { id: number }[] };
    expect(aBody.annotations.map((x) => x.id)).toEqual([aAnnotationId]);
  });

  it("跨用户删除：B 删 A 的批注返回 404，A 的批注仍在", async () => {
    const res = await app.request(`/?id=${aAnnotationId}`, {
      method: "DELETE",
      headers: authHeaders(await tokenFor(B)),
    });

    expect(res.status).toBe(404);
    const rows = await annotationRows(A);
    expect(rows).toHaveLength(1);
    expect(rows[0].tag).toBe("highlight");
  });

  it("跨用户改：B 用相同位置写批注只产生 B 自己的行，A 的 tag/颜色不被覆盖", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(await tokenFor(B)),
      },
      body: JSON.stringify({
        questionId: QUESTION_ID,
        startOffset: A_START,
        endOffset: A_END,
        tag: "wavy",
        color: "#b-color",
      }),
    });

    expect(res.status).toBe(200);
    // upsert 的冲突键包含 user_id，所以只 upsert 到 B 自己那行
    const rowsA = await annotationRows(A);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]).toMatchObject({ tag: "highlight", color: A_COLOR });

    const rowsB = await annotationRows(B);
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0].tag).toBe("wavy");
  });

  it("A 自己的删除仍然有效（隔离不是靠把删除功能弄坏）", async () => {
    const res = await app.request(`/?id=${aAnnotationId}`, {
      method: "DELETE",
      headers: authHeaders(await tokenFor(A)),
    });

    expect(res.status).toBe(200);
    expect(await annotationRows(A)).toEqual([]);
  });
});
