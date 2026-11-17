// @vitest-environment node
/**
 * `mastery` 路由的跨用户归属校验。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT）、
 * 真实 `masteryService`（树与层级统计都按 user_id 聚合）。不 mock 数据库。
 *
 * 这个模块没有资源 id —— 入参只有标签路径。要证明的是"聚合口径按用户"：
 * 另一个用户的标签与分数不会出现在 B 的响应里（既不出现在树的节点上，也不参与
 * 层级平均值），而 A 自己仍然能看到自己那份数据。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { sign } from "hono/jwt";

const dbFile = `test-cross-user-mastery-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** 用户 A（数据的另一份）与用户 B（被观察的响应主体） */
const A = 971;
const B = 972;
/** 两个用户共享的标签路径，分数不同；以及只有 A 才有的标签 */
const SHARED_TAG = "教育学/教学原则";
const A_ONLY_TAG = "A 专属/只有 A 有的知识点";

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let app: (typeof import("../mastery"))["default"];

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

interface TreeNode {
  name: string;
  path: string;
  score: number;
  children: TreeNode[];
}

function flatten(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

describe("mastery 路由 · 跨用户归属", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    app = (await import("../mastery")).default;

    for (const [id, name] of [
      [A, "mastery-owner"],
      [B, "mastery-other"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }

    // A：共享标签 20 分 + 专属标签 90 分；B：共享标签 80 分
    for (const [userId, tag, score, correct, total] of [
      [A, SHARED_TAG, 20, 2, 10],
      [A, A_ONLY_TAG, 90, 9, 10],
      [B, SHARED_TAG, 80, 8, 10],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR REPLACE INTO user_mastery (user_id, tag_name, score, correct_count, total_count)
            VALUES (${userId}, ${tag}, ${score}, ${correct}, ${total})`,
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

  it("B 的掌握度树只含 B 自己的标签与分数，不含另一个用户的专属节点", async () => {
    const res = await get("/tree", await tokenFor(B));

    expect(res.status).toBe(200);
    const nodes = flatten((await res.json()) as TreeNode[]);
    const paths = nodes.map((n) => n.path);

    expect(paths).toContain(SHARED_TAG);
    expect(paths).not.toContain(A_ONLY_TAG);
    // 共享标签的分数是 B 的 80，不是 A 的 20
    expect(nodes.find((n) => n.path === SHARED_TAG)?.score).toBe(80);
  });

  it("跨用户层级统计：B 的 教育学 平均值只由 B 的数据决定", async () => {
    const res = await get(
      `/stats?tag=${encodeURIComponent("教育学")}`,
      await tokenFor(B),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { avgScore: number; count: number };
    // A 也有 教育学/教学原则：如果口径漏了 user_id，count 会变成 2、均值会变 50
    expect(body.count).toBe(1);
    expect(body.avgScore).toBe(80);
  });

  it("对照：A 自己的树与层级统计仍然正常（隔离不是靠关掉功能换来的）", async () => {
    const treeRes = await get("/tree", await tokenFor(A));
    expect(treeRes.status).toBe(200);
    const paths = flatten((await treeRes.json()) as TreeNode[]).map(
      (n) => n.path,
    );
    expect(paths).toContain(A_ONLY_TAG);
    expect(paths).toContain(SHARED_TAG);

    const statsRes = await get(
      `/stats?tag=${encodeURIComponent("教育学")}`,
      await tokenFor(A),
    );
    expect(statsRes.status).toBe(200);
    const body = (await statsRes.json()) as { avgScore: number; count: number };
    expect(body.count).toBe(1);
    expect(body.avgScore).toBe(20);
  });
});
