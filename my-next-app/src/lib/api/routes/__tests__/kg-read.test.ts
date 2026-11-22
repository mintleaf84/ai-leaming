// @vitest-environment node
/**
 * 知识图谱读接口 + 按节点筛错题 + 节点级掌握度（真实 SQLite / 真 JWT）。
 *
 * 真实依赖：独立临时库 + 全部迁移、真实 `authMiddleware`、真实服务层聚合。
 * 不 mock 数据库。
 *
 * 这里同时承担归属矩阵要求的「跨用户」证据：图内容是全局共享的（两个用户看到
 * 同一张图），但「按节点筛错题」与「节点级掌握度」只聚合当前用户自己的
 * practice_logs —— 跨用户既看不到对方的错题，也影响不到对方的正确率。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { sign } from "hono/jwt";

const dbFile = `test-cross-user-kg-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** A = 被观察的用户；B = 另一个用户（数据不能串） */
const A = 951;
const B = 952;
const N1 = "ch1:教育学的创立阶段";
const N2 = "ch1:广义的教育";
const Q1 = 9901; // A 答对，挂 N1
const Q2 = 9902; // A 答错，挂 N1
const Q3 = 9903; // A 未作答（skipped），挂 N2
const Q4 = 9904; // 只有 B 答错，挂 N1

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let kgApp: (typeof import("../kg"))["default"];
let wrongBookApp: (typeof import("../wrong-book"))["default"];
let masteryApp: (typeof import("../mastery"))["default"];

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

/** wrongBookApp 直接挂在测试根路径上，query 里带节点 key */
function wrongBookByNode(node: string) {
  return `/?node=${encodeURIComponent(node)}`;
}

/** masteryApp 同样挂在根路径：`/?by=node&chapter=...` */
function masteryByNode(chapter: string) {
  return `/?by=node&chapter=${encodeURIComponent(chapter)}`;
}

interface WrongBookItem {
  questionId: string;
  questionContent: string;
}

interface NodeMastery {
  nodeKey: string;
  name: string;
  answered: number;
  correctRate: number;
}

interface TagMastery {
  tag: string;
  score: number;
  correctCount: number;
  totalCount: number;
  accuracy: number;
}

/** 三个路由模块都是默认 OpenAPIHono，同一个结构类型即可复用请求助手 */
type RouteApp = (typeof import("../kg"))["default"];

async function request(
  app: RouteApp,
  pathname: string,
  token: string,
): Promise<Response> {
  return await app.request(pathname, { headers: headers(token) });
}

describe("知识图谱读接口 · 真实库", () => {
  beforeAll(async () => {
    // 先清掉上次异常退出留下的同名库，保证 fixture 干净
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }

    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    kgApp = (await import("../kg")).default;
    wrongBookApp = (await import("../wrong-book")).default;
    masteryApp = (await import("../mastery")).default;

    for (const [id, name] of [
      [A, "kg-owner"],
      [B, "kg-other"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }

    // 图谱（全局共享）：两个节点一条边
    await dbm.drizzleDb.run(
      sql`INSERT INTO kg_nodes (chapter, node_key, name, kind, printed_page) VALUES
            ('ch1', ${N1}, '教育学的创立阶段', 'concept', 23),
            ('ch1', ${N2}, '广义的教育', 'concept', 3)`,
    );
    await dbm.drizzleDb.run(
      sql`INSERT INTO kg_edges (chapter, from_key, to_key, type, evidence, printed_page, schema_version)
          VALUES ('ch1', ${N1}, ${N2}, 'subclass', '夸美纽斯《大教学论》标志着教育学开始独立', 23, '1.1')`,
    );

    // 四道题：Q1/Q2/Q4 挂 N1，Q3 挂 N2
    await dbm.drizzleDb.run(
      sql`INSERT INTO questions (id, content, options, answer, tags, type) VALUES
            (${Q1}, 'A 做对的题', '[]', 'A', '[]', 'single'),
            (${Q2}, 'A 做错的题', '[]', 'A', '[]', 'single'),
            (${Q3}, 'A 跳过未答的题', '[]', 'A', '[]', 'single'),
            (${Q4}, '只有 B 做错的题', '[]', 'A', '[]', 'single')`,
    );
    await dbm.drizzleDb.run(
      sql`INSERT INTO question_nodes (question_id, chapter, node_key, method, score) VALUES
            (${Q1}, 'ch1', ${N1}, 'match', 3),
            (${Q2}, 'ch1', ${N1}, 'match', 3),
            (${Q3}, 'ch1', ${N2}, 'match', 3),
            (${Q4}, 'ch1', ${N1}, 'match', 3)`,
    );

    // A：Q1 对、Q2 错、Q3 skipped；B：Q4 错
    await dbm.drizzleDb.run(
      sql`INSERT INTO practice_logs (question_id, user_id, user_answer, is_correct, status) VALUES
            (${Q1}, ${A}, 'A', 1, 'answered'),
            (${Q2}, ${A}, 'B', 0, 'answered'),
            (${Q3}, ${A}, '', 0, 'skipped'),
            (${Q4}, ${B}, 'B', 0, 'answered')`,
    );

    // 现有 tag 口径（user_mastery）：A 的标签只有一次答对
    await dbm.drizzleDb.run(
      sql`INSERT INTO user_mastery (user_id, tag_name, score, correct_count, total_count)
          VALUES (${A}, '教育学/教育学的创立阶段', 100, 1, 1)`,
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

  it("GET /graph 返回节点与边（边带教材原句与页码）", async () => {
    const res = await request(kgApp, "/graph?chapter=ch1", await tokenFor(A));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      nodes: Array<{
        nodeKey: string;
        name: string;
        kind: string;
        page: number;
      }>;
      edges: Array<{
        from: string;
        to: string;
        type: string;
        evidence: string;
        page: number;
      }>;
    };

    expect(body.nodes).toHaveLength(2);
    expect(body.nodes).toContainEqual({
      nodeKey: N1,
      name: "教育学的创立阶段",
      kind: "concept",
      page: 23,
    });
    expect(body.edges).toEqual([
      {
        from: N1,
        to: N2,
        type: "subclass",
        evidence: "夸美纽斯《大教学论》标志着教育学开始独立",
        page: 23,
      },
    ]);
  });

  it("GET /nodes 支持 kind 过滤与 limit/offset 分页", async () => {
    const token = await tokenFor(A);
    const all = await request(kgApp, "/nodes?chapter=ch1", token);
    expect(all.status).toBe(200);
    expect(await all.json()).toMatchObject({
      meta: { total: 2 },
      data: [{ nodeKey: N2 }, { nodeKey: N1 }],
    });

    const filtered = await request(
      kgApp,
      "/nodes?chapter=ch1&kind=work",
      token,
    );
    expect(await filtered.json()).toMatchObject({
      data: [],
      meta: { total: 0 },
    });

    const paged = await request(
      kgApp,
      "/nodes?chapter=ch1&limit=1&offset=1",
      token,
    );
    const pagedBody = (await paged.json()) as {
      data: Array<{ nodeKey: string }>;
      meta: { limit: number; offset: number; total: number };
    };
    expect(pagedBody.meta).toEqual({ limit: 1, offset: 1, total: 2 });
    expect(pagedBody.data.map((n) => n.nodeKey)).toEqual([N1]);
  });

  it("错题本 ?node= 只收该节点的错题；不带 node 时行为不变", async () => {
    const tokenA = await tokenFor(A);

    const allRes = await request(wrongBookApp, "/", tokenA);
    expect(allRes.status).toBe(200);
    const all = (await allRes.json()) as WrongBookItem[];
    // 无 node 参数：A 的错题仍是 Q2 + skipped 的 Q3（既有口径，未改动）
    expect(all.map((q) => q.questionId).sort()).toEqual([
      String(Q2),
      String(Q3),
    ]);

    const n1Res = await request(wrongBookApp, wrongBookByNode(N1), tokenA);
    expect(n1Res.status).toBe(200);
    const n1 = (await n1Res.json()) as WrongBookItem[];
    expect(n1.map((q) => q.questionId)).toEqual([String(Q2)]);
    expect(n1.map((q) => q.questionContent)).toEqual(["A 做错的题"]);
  });

  it("跨用户：另一个用户的错题不会出现在 A 的 ?node= 结果里", async () => {
    const tokenA = await tokenFor(A);
    const tokenB = await tokenFor(B);

    const aRes = await request(wrongBookApp, wrongBookByNode(N1), tokenA);
    const a = (await aRes.json()) as WrongBookItem[];
    expect(a.map((q) => q.questionId)).not.toContain(String(Q4));

    const bRes = await request(wrongBookApp, wrongBookByNode(N1), tokenB);
    const b = (await bRes.json()) as WrongBookItem[];
    // B 只错 Q4；A 的 Q2 不出现在 B 的响应里
    expect(b.map((q) => q.questionId)).toEqual([String(Q4)]);
  });

  it("掌握度 by=node 只聚合当前用户，skipped 不计入分母", async () => {
    const res = await request(
      masteryApp,
      masteryByNode("ch1"),
      await tokenFor(A),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: NodeMastery[];
      meta: { total: number };
    };

    expect(body.meta.total).toBe(2);
    const n1 = body.data.find((row) => row.nodeKey === N1);
    const n2 = body.data.find((row) => row.nodeKey === N2);
    expect(n1).toMatchObject({ answered: 2, correctRate: 50 });
    // Q3 是 skipped：既不算答对也不算进分母
    expect(n2).toMatchObject({ answered: 0, correctRate: 0 });
  });

  it("跨用户：B 的节点掌握度只由 B 的作答决定", async () => {
    const res = await request(
      masteryApp,
      masteryByNode("ch1"),
      await tokenFor(B),
    );
    const body = (await res.json()) as { data: NodeMastery[] };
    const n1 = body.data.find((row) => row.nodeKey === N1);
    // 只算 B 的 Q4（0 分）；A 的 Q1 答对没有混进来（否则会是 1/3）
    expect(n1).toMatchObject({ answered: 1, correctRate: 0 });
  });

  it("by=tag（缺省口径）与 by=node 对同一批答题给出不同但可解释的口径", async () => {
    const token = await tokenFor(A);

    const tagRes = await request(masteryApp, "/", token);
    expect(tagRes.status).toBe(200);
    const tagBody = (await tagRes.json()) as {
      data: TagMastery[];
      meta: { total: number };
    };
    const tag = tagBody.data.find(
      (row) => row.tag === "教育学/教育学的创立阶段",
    );
    // tag 口径读 user_mastery：按"题×标签"累计（1 次答对 → 100%）
    expect(tag).toMatchObject({ accuracy: 100, totalCount: 1, score: 100 });

    const nodeRes = await request(masteryApp, masteryByNode("ch1"), token);
    const nodeBody = (await nodeRes.json()) as { data: NodeMastery[] };
    const node = nodeBody.data.find((row) => row.nodeKey === N1);
    // node 口径现算 practice_logs：Q1 对 + Q2 错 → 50%；题目挂几个节点就各计一次
    expect(node).toMatchObject({ answered: 2, correctRate: 50 });
  });

  it("by=node 缺 chapter → 400", async () => {
    const res = await request(masteryApp, "/?by=node", await tokenFor(A));
    expect(res.status).toBe(400);
  });
});
