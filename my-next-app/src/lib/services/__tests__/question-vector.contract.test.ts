// @vitest-environment node
/**
 * 题库向量读写契约（真实 SQLite + 真实 sqlite-vec，只 mock AI 网络调用）
 *
 * 本机 sqlite-vec 可加载（`✅ sqlite-vec 扩展加载成功 v0.1.9`）。但"扩展能加载"
 * 和"向量检索能用"是两件事，而 `docs/engineering-plan.md` 把 RAG 写入算作关键路径。
 * 所以这里用真库、真扩展去钉住三件事：
 *   1. 建表 / 写入 / KNN 的**存储契约**成立（含 sqlite-vec 对主键的 BigInt 要求）；
 *   2. 应用初始化路径**是否真的建出了向量表**；
 *   3. 扩展不可用 / 表不存在时的降级路径：不抛异常、不返回假数据。
 *
 * 允许的 mock 只有 AI 网络层（`ai` 的 embed/embedMany）：打真实 embedding API 既不可
 * 重复也拖慢闸门，而它提供的只是"一串浮点数"。`getAiConfig` 一律走真实现，
 * 因为"配置说几维"正是本文件要钉的东西之一 —— 把它 mock 掉就等于自己出题自己答。
 *
 * 发现的真实缺陷用 `it.fails` 固定，不修。
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

const dbFile = `test-question-vector-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** 生产向量表的实际维度：建表后在真库里读出来（见 createQuestionsVecFromProduction） */
let vecDim = 0;

const aiState = vi.hoisted(() => ({
  embedFails: true,
  /** `ai` 网络桩返回的向量长度，由用例按真实配置对齐 */
  dims: 1024,
}));

vi.mock("ai", () => ({
  embed: vi.fn(async () => {
    if (aiState.embedFails) throw new Error("embedding provider unreachable");
    return { embedding: new Array(aiState.dims).fill(0.5) };
  }),
  embedMany: vi.fn(async ({ values }: { values: string[] }) => {
    if (aiState.embedFails) throw new Error("embedding provider unreachable");
    return {
      embeddings: values.map(() => new Array(aiState.dims).fill(0.5)),
    };
  }),
}));

type DbModule = typeof import("@/lib/db");
type RagModule = typeof import("@/lib/ai/rag");
type QuestionModule = typeof import("@/lib/services/question");
type ClientModule = typeof import("@/lib/ai/client");

let dbm: DbModule;
let ragService: RagModule["ragService"];
let questionService: QuestionModule["questionService"];
let getAiConfig: ClientModule["getAiConfig"];
let legacy: ReturnType<DbModule["getLegacyDb"]>;

/**
 * 把 drizzle 的 SQL 对象渲染成文本（只用于 `vector-setup.ts` 里那几条常量 DDL：
 * 字符串片段 + 内联参数，没有子查询）。参数按值内联 —— vec0 的 `float[N]`
 * 是类型声明，不能是绑定参数。
 */
function renderSql(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean")
    return String(node);
  if (Array.isArray(node)) return node.map(renderSql).join("");
  if (node && typeof node === "object") {
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(chunks)) return chunks.map(renderSql).join("");
    const value = (node as { value?: unknown }).value;
    if (value !== undefined && value !== null) return renderSql(value);
  }
  return "";
}

/**
 * 走**生产建表路径**建出 `questions_vec`，只把执行连接换成 legacy。
 *
 * 应用主连接（libsql）加载不到 vec0，生产路径到此必然失败并静默跳过（已由上方
 * it.fails 钉住）；而"维度对不对"只能在真表上问。所以这里把 `setupVectorExtension()`
 * 真的跑一遍，截下它要执行的 DDL，原样打到能加载扩展的 legacy 连接上 ——
 * 表结构、维度都来自 `src/lib/db/vector-setup.ts`，测试不再自带 1536 这种魔法数。
 */
async function createQuestionsVecFromProduction(): Promise<void> {
  const captured: unknown[] = [];
  // 只替换执行连接：把生产 SQL 截下来，别让它在 libsql 上真跑（跑了也只会 "no such module"）
  const db = dbm.drizzleDb as unknown as {
    run: (query: unknown) => Promise<unknown>;
    all: (query: unknown) => Promise<unknown>;
  };
  const realRun = db.run;
  const realAll = db.all;

  db.run = async (query) => {
    const text = renderSql(query);
    if (!text.trimStart().toUpperCase().startsWith("SELECT")) {
      captured.push(query);
    }
    return {};
  };
  db.all = async () => [{ count: 0 }];

  try {
    const ok = await dbm.setupVectorExtension();
    expect(ok).toBe(true);
  } finally {
    db.run = realRun;
    db.all = realAll;
  }

  const ddl = captured
    .map(renderSql)
    .find((text) => /questions_vec/.test(text));
  if (!ddl) throw new Error("生产建表路径没有产出 questions_vec 的 DDL");
  legacy.exec(ddl);

  const row = legacy
    .prepare("SELECT sql FROM sqlite_master WHERE name = 'questions_vec'")
    .get() as { sql?: string } | undefined;
  const dim = /float\[(\d+)\]/.exec(row?.sql ?? "")?.[1];
  if (!dim) throw new Error("建出来的向量表里读不到维度声明");
  vecDim = Number(dim);
}

function unitVector(seed: number): number[] {
  // 确定性单位向量：第 seed%vecDim 维为 1
  const v = new Array(vecDim).fill(0);
  v[seed % vecDim] = 1;
  return v;
}

async function createQuestion(content: string): Promise<number> {
  const q = await questionService.create({
    content,
    options: ["甲", "乙"],
    answer: "A",
    explanation: "解析",
    tags: ["向量"],
    dimension: "knowledge",
    type: "single",
  } as never);
  return q.id;
}

describe("题库向量契约（真实库 + 真实 sqlite-vec）", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    ragService = (await import("@/lib/ai/rag")).ragService;
    questionService = (await import("@/lib/services/question")).questionService;
    getAiConfig = (await import("@/lib/ai/client")).getAiConfig;
    legacy = dbm.getLegacyDb();
  });

  afterAll(async () => {
    // 先关两个连接再删文件（未关闭的句柄会让删除失败）
    dbm.closeDb();
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  beforeEach(() => {
    aiState.embedFails = true;
    aiState.dims = 1024;
  });

  // ---------------- 初始化 / 降级（必须在建表之前） ----------------

  describe("初始化与扩展可用性", () => {
    it("libsql（应用主连接）侧加载不到 vec0 —— 这是向量表建不出来的根因", async () => {
      let error: unknown = null;
      try {
        await dbm.drizzleDb.all(sql`SELECT vec_version() AS v`);
      } catch (e) {
        error = e;
      }
      expect(error).not.toBeNull();

      // 同一文件、另一个连接（better-sqlite3 + loadExtension）却有 vec0：
      // 说明"扩展加载成功"的日志只覆盖 legacy 连接
      const version = legacy.prepare("SELECT vec_version() AS v").get() as {
        v: string;
      };
      expect(version.v).toMatch(/^v\d/);
    });

    it("扩展不可用时的降级：setupVectorExtension 返回 false 且不抛异常", async () => {
      const ok = await dbm.setupVectorExtension();
      expect(ok).toBe(false);
    });

    it.fails(
      "缺陷固定：initDatabase 之后 questions_vec 应存在（现在被静默跳过）",
      async () => {
        const rows = await dbm.drizzleDb.all<{ name: string }>(sql`
          SELECT name FROM sqlite_master WHERE type='table' AND name='questions_vec'
        `);
        expect(rows.length).toBe(1);
      },
    );

    it("降级时不留半成品：向量表不存在，普通表（questions）照常可用", async () => {
      const vecRows = await dbm.drizzleDb.all<{ name: string }>(sql`
        SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name LIKE '%_vec'
      `);
      expect(vecRows).toHaveLength(0);

      const q = await createQuestion("向量表缺失时题目仍可写入-降级");
      expect(q).toBeGreaterThan(0);
    });

    it("向量表不存在时的检索降级：空数组、不抛异常、不编造题目", async () => {
      const hits = await questionService.searchSimilarQuestions(
        "随便一段文本",
        5,
      );
      expect(hits).toEqual([]);
    });
  });

  // ---------------- 存储契约 ----------------

  describe("存储契约（真实 sqlite-vec 连接）", () => {
    beforeAll(async () => {
      await createQuestionsVecFromProduction();
    });

    afterAll(() => {
      legacy.exec("DROP TABLE IF EXISTS questions_vec");
    });

    it("写入题目后 questions_vec 有对应 rowid，且 KNN 检索返回自身（距离 0）", async () => {
      const qid = await createQuestion(`向量写入-${process.pid}`);

      // sqlite-vec 的 vec0 主键是 64 位整数：better-sqlite3 把 JS number 绑成 REAL，
      // 直接传 number 会得到 "Only integers are allows for primary key values"。
      const info = legacy
        .prepare(
          "INSERT INTO questions_vec (question_id, embedding) VALUES (?, ?)",
        )
        .run(BigInt(qid), JSON.stringify(unitVector(qid)));
      expect(Number(info.lastInsertRowid)).toBe(qid);

      const stored = legacy
        .prepare("SELECT question_id FROM questions_vec WHERE question_id = ?")
        .all(BigInt(qid)) as Array<{ question_id: number }>;
      expect(stored).toHaveLength(1);
      expect(Number(stored[0].question_id)).toBe(qid);

      // 用 question.ts 里同形状的 SQL 验证"检索返回自身"
      const hits = legacy
        .prepare(
          `
          SELECT q.id, q.content, v.distance
          FROM questions_vec v
          JOIN questions q ON q.id = v.question_id
          WHERE v.embedding MATCH ?
            AND k = ?
          ORDER BY v.distance
        `,
        )
        .all(JSON.stringify(unitVector(qid)), 3) as Array<{
        id: number;
        content: string;
        distance: number;
      }>;

      expect(hits[0].id).toBe(qid);
      expect(hits[0].distance).toBeCloseTo(0, 6);
    });

    it("维数不符的向量被 sqlite-vec 拒绝（不会静默写入坏数据）", async () => {
      const qid = await createQuestion(`维数不符-${process.pid}`);
      let error: unknown = null;
      try {
        legacy
          .prepare(
            "INSERT INTO questions_vec (question_id, embedding) VALUES (?, ?)",
          )
          .run(BigInt(qid), JSON.stringify(new Array(vecDim + 1).fill(0.1)));
      } catch (e) {
        error = e;
      }
      expect(String(error)).toMatch(/Dimension mismatch/i);
    });

    it("应用自己算出的向量能写进应用自己建的向量表（表维度取自 embeddingDimensions）", async () => {
      // 维度取自真实配置，不是测试里写的常数：配置改成几维，这里就按几维算
      const { embeddingDimensions } = await getAiConfig();
      aiState.embedFails = false;
      aiState.dims = embeddingDimensions;

      const qid = await createQuestion(`应用维度-${process.pid}`);
      const vector = await ragService.getEmbedding("任意文本");
      expect(vector).toHaveLength(embeddingDimensions);

      let insertError: unknown = null;
      try {
        legacy
          .prepare(
            "INSERT INTO questions_vec (question_id, embedding) VALUES (?, ?)",
          )
          .run(BigInt(qid), JSON.stringify(vector));
      } catch (e) {
        insertError = e;
      }
      // 期望：应用算出的向量能写进应用自己的向量表 —— 配置修成同维后这条自然转绿
      expect(insertError).toBeNull();
    });

    it.fails(
      "缺陷固定：有向量且同文时 questionService.searchSimilarQuestions 应召回该题（现在恒为空）",
      async () => {
        const content = `检索自身-${process.pid}`;
        const qid = await createQuestion(content);
        legacy
          .prepare(
            "INSERT INTO questions_vec (question_id, embedding) VALUES (?, ?)",
          )
          .run(BigInt(qid), JSON.stringify(unitVector(qid)));

        aiState.embedFails = false;
        aiState.dims = vecDim;
        const hits = await questionService.searchSimilarQuestions(content, 3);
        expect(hits.map((h) => h.id)).toContain(qid);
      },
    );
  });

  // ---------------- embedding 降级 ----------------

  describe("embedding 降级（AI 网络不可用）", () => {
    it("API 失败时降级向量：维度与配置一致、确定性、非常量", async () => {
      const { embeddingDimensions } = await getAiConfig();
      const a1 = await ragService.getEmbedding("同一段文本");
      const a2 = await ragService.getEmbedding("同一段文本");
      const b = await ragService.getEmbedding("另一段文本");

      expect(a1).toHaveLength(embeddingDimensions);
      expect(a2).toEqual(a1); // 同文本可复现
      expect(b).not.toEqual(a1); // 不同文本不同
      expect(new Set(a1).size).toBeGreaterThan(1); // 不是全 0 / 全同值
    });

    it("降级向量不写缓存：下一次调用仍会重试 API（不会被伪向量永久污染）", async () => {
      const embed = await import("ai");
      const calls = () =>
        (embed.embed as unknown as { mock: { calls: unknown[] } }).mock.calls
          .length;
      const text = `未缓存的文本-${process.pid}`;

      const before = calls();
      await ragService.getEmbedding(text);
      const afterFirst = calls();
      await ragService.getEmbedding(text);
      const afterSecond = calls();

      expect(afterFirst).toBe(before + 1);
      expect(afterSecond).toBe(afterFirst + 1);
    });

    it("降级向量同样用于批量接口，且条数与输入一致", async () => {
      const { embeddingDimensions } = await getAiConfig();
      const vectors = await ragService.getEmbeddings(["甲", "乙", "丙"]);
      expect(vectors).toHaveLength(3);
      for (const v of vectors) expect(v).toHaveLength(embeddingDimensions);
    });
  });
});
