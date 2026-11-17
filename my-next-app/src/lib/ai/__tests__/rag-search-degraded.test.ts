// @vitest-environment node
/**
 * `ragService.search` 的降级契约 —— 真实 SQLite + 真实 sqlite-vec，**只 mock embedding
 * 网络层**（`ai` 的 embed/embedMany），与 `question-vector.contract.test.ts` 同口径。
 *
 * 要钉住的一件事：`rag.ts` 在 embedding API 失败时返回 `Math.sin(hash + i)` 生成的
 * **伪向量**。它作为查询向量跑 KNN 不会报错 —— content_vec 里有多少行就返回多少行
 * （vec0 的 `MATCH ... k = ?` 永远给"最近的 k 条"），于是调用方拿到一批与问题
 * 毫无关系、但形状完全正常的答案。所以降级时**必须不查**，只是返回空。
 *
 * 断言用 `prepare` 的 spy 记录实际下发的 SQL：只看返回值分不清"查了没命中"与
 * "根本没查"，而后者才是契约。
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

const dbFile = `test-rag-search-degraded-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/**
 * 网络桩：向量由**文本决定**（第 hash 维为 1 的单位向量），这样"同一段文本查 KNN
 * 命中对应分块且距离 0"才是真断言；返回恒定向量的话任何行都距离 0，等于没写。
 */
const stub = vi.hoisted(() => {
  const state = {
    /** true = 模拟 embedding API 不可达（`rag.ts` 走 `Math.sin` 降级） */
    fails: false,
    /** content_vec 的实际维度（建表后从真表读出来） */
    dims: 8,
  };

  const unit = (text: string, dims: number): number[] => {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    const vector = new Array(dims).fill(0);
    vector[Math.abs(hash) % dims] = 1;
    return vector;
  };

  return { state, unit };
});

vi.mock("ai", () => ({
  embed: vi.fn(async ({ value }: { value: string }) => {
    if (stub.state.fails) throw new Error("embedding provider unreachable");
    return { embedding: stub.unit(value, stub.state.dims) };
  }),
  embedMany: vi.fn(async ({ values }: { values: string[] }) => {
    if (stub.state.fails) throw new Error("embedding provider unreachable");
    return {
      embeddings: values.map((value: string) =>
        stub.unit(value, stub.state.dims),
      ),
    };
  }),
}));

type DbModule = typeof import("@/lib/db");
type RagModule = typeof import("@/lib/ai/rag");

let dbm: DbModule;
let ragService: RagModule["ragService"];
let legacy: ReturnType<DbModule["getLegacyDb"]>;

/**
 * `initRagTable()` 是生产建表路径（`content_chunks` 走 drizzleDb，`content_vec` 走
 * legacy better-sqlite3）。维度从建出来的真表读，不在测试里写魔法数。
 */
function readChunkVecDim(): number {
  const row = legacy
    .prepare("SELECT sql FROM sqlite_master WHERE name = 'content_vec'")
    .get() as { sql?: string } | undefined;
  const dim = /float\[(\d+)\]/.exec(row?.sql ?? "")?.[1];
  if (!dim) throw new Error("生产路径建出的 content_vec 里读不到维度声明");
  return Number(dim);
}

/** 直接写一条"已经算好的"分块 + 向量（不经过 embedding，避免缓存干扰） */
async function insertChunk(content: string): Promise<void> {
  const info = legacy
    .prepare("INSERT INTO content_vec(embedding) VALUES (?)")
    .run(JSON.stringify(stub.unit(content, stub.state.dims)));
  await dbm.drizzleDb.run(
    sql`INSERT INTO content_chunks (id, content, metadata)
        VALUES (${Number(info.lastInsertRowid)}, ${content}, ${JSON.stringify({ source_type: "test" })})`,
  );
}

describe("RAG 检索降级（真实库 + 真实 sqlite-vec）", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    ragService = (await import("@/lib/ai/rag")).ragService;
    legacy = dbm.getLegacyDb();
    await ragService.initRagTable();
    stub.state.dims = readChunkVecDim();
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
    stub.state.fails = false;
  });

  it("embedding 降级时返回 []，且没有向向量表下发 MATCH 查询", async () => {
    const content = `RAG 降级查询-${process.pid}`;
    await insertChunk(content);

    const prepared: string[] = [];
    const originalPrepare = legacy.prepare.bind(legacy);
    const spy = vi
      .spyOn(legacy, "prepare")
      // 类型：better-sqlite3 的 prepare 是泛型可变参数方法，这里只做透传记录
      .mockImplementation(((text: string, ...rest: unknown[]) => {
        prepared.push(text);
        return (originalPrepare as unknown as (...a: unknown[]) => unknown)(
          text,
          ...rest,
        );
      }) as never);

    try {
      // 1) 降级路径（先跑：失败的 embedding 不写缓存，所以下面还能拿到真向量）
      stub.state.fails = true;
      const degraded = await ragService.search(content, 3);

      expect(degraded).toEqual([]);
      // 核心断言：不是"查了没命中"，而是"没查"。content_vec 里只有这一行，
      // 真发一条 MATCH 就必然把它带回来（vec0 永远返回最近的 k 条）。
      expect(prepared.some((statement) => /MATCH/i.test(statement))).toBe(
        false,
      );

      // 2) 同一段文本在 API 恢复后能正常检索 —— 既证明上面的 [] 来自降级，
      //    也证明这个 spy 确实能捕获到 MATCH（否则上面的"没下发"是空断言）。
      const beforeRecovery = prepared.length;
      stub.state.fails = false;
      const hits = await ragService.search(content, 3);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].content).toBe(content);
      expect(
        prepared.slice(beforeRecovery).some((s) => /MATCH/i.test(s)),
      ).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("降级判定不看向量形状：只要能拿到 degraded=false 的向量，照常检索", async () => {
    const content = `RAG 正常查询-${process.pid}`;
    await insertChunk(content);

    // 桩返回的是单位向量（长度 1，方差不为 0）—— 这里只想确认正常路径没被
    // 新增的降级拦截误伤；判定依据只有 getEmbeddingResult().degraded。
    const hits = await ragService.search(content, 3);
    expect(hits.length).toBeGreaterThan(0);
  });
});
