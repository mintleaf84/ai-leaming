// @vitest-environment node
/**
 * 题目向量索引（embedding 写入路径）契约测试 —— 真实 SQLite + 真实 sqlite-vec，
 * **只 mock embedding 网络层**（`ai` 的 embed/embedMany）。
 *
 * 这里要钉住的是 `question-vector-index.ts` 的三条硬约束：
 *   1. 限量：`limit` 取几条就只处理几条（上千题不能一次算完）；
 *   2. 降级伪向量**绝不入库**（`rag.ts` 的 `Math.sin` 兜底只用于当次检索）；
 *   3. 单题失败不中断整批，`vec-store` 不可用时整批跳过而不是逐条失败。
 *
 * 另外钉住两点容易被"优化"掉的性质：dry-run 不调 API、重复跑不产生重复行
 * （vec0 没有可靠 UPSERT，`upsertQuestionVector` 是事务内 DELETE + INSERT）。
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

const dbFile = `test-question-vector-index-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/**
 * 网络桩的行为开关 + 确定性向量生成器。
 *
 * 向量必须**由文本决定**（第 hash 维为 1 的单位向量），这样"用同一段文本查 KNN
 * 应命中对应题目且距离 0"才是真断言；返回恒定向量的话，任何题目距离都为 0，
 * 断言等于没写。
 */
const stub = vi.hoisted(() => {
  const state = {
    /** true = 模拟 embedding API 不可达（`rag.ts` 走 `Math.sin` 降级） */
    fails: false,
    /** 命中的文本返回**错误维度**，用来制造"写入失败"而不是"降级" */
    badDimFor: null as string | null,
    /** 正确维度（建表后从真表读出来） */
    dims: 4,
    /** API 被调用次数：dry-run 用例靠它证明"没发请求" */
    calls: 0,
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
    stub.state.calls++;
    if (stub.state.fails) throw new Error("embedding provider unreachable");
    const badDim =
      stub.state.badDimFor !== null && value.includes(stub.state.badDimFor);
    return {
      embedding: stub.unit(
        value,
        badDim ? stub.state.dims + 1 : stub.state.dims,
      ),
    };
  }),
  embedMany: vi.fn(async ({ values }: { values: string[] }) => {
    stub.state.calls++;
    if (stub.state.fails) throw new Error("embedding provider unreachable");
    return {
      embeddings: values.map((value: string) =>
        stub.unit(value, stub.state.dims),
      ),
    };
  }),
}));

type DbModule = typeof import("@/lib/db");
type VecStoreModule = typeof import("@/lib/db/vec-store");
type QuestionModule = typeof import("@/lib/services/question");
type IndexModule = typeof import("@/lib/services/question-vector-index");

let dbm: DbModule;
let vecStore: VecStoreModule;
let questionService: QuestionModule["questionService"];
let indexModule: IndexModule;
let legacy: ReturnType<DbModule["getLegacyDb"]>;

/** 生产建表路径（initDatabase → setupVectorExtension → ensureVectorTables）建出的真实维度 */
let vecDim = 0;

function readVecDimFromProductionTable(): void {
  const row = legacy
    .prepare("SELECT sql FROM sqlite_master WHERE name = 'questions_vec'")
    .get() as { sql?: string } | undefined;
  const dim = /float\[(\d+)\]/.exec(row?.sql ?? "")?.[1];
  if (!dim) throw new Error("生产路径建出的向量表里读不到维度声明");
  vecDim = Number(dim);
}

function storedQuestionIds(): number[] {
  return (
    legacy
      .prepare("SELECT question_id FROM questions_vec ORDER BY question_id")
      .all() as Array<{ question_id: number }>
  ).map((row) => Number(row.question_id));
}

function questionCount(): number {
  const row = legacy.prepare("SELECT count(*) AS c FROM questions").get() as {
    c: number;
  };
  return Number(row.c);
}

/** 与 `questionService.create` 里那组固定字段对应的 embedding 文本 */
function embeddingText(content: string): string {
  return indexModule.buildQuestionEmbeddingText({
    content,
    options: ["甲", "乙"],
    answer: "A",
  });
}

async function createQuestion(content: string): Promise<number> {
  const q = await questionService.create({
    content,
    options: ["甲", "乙"],
    answer: "A",
    explanation: "解析内容足够长",
    tags: ["向量"],
    dimension: "knowledge",
    type: "single",
  } as never);
  return q.id;
}

describe("题目向量索引（真实库 + 真实 sqlite-vec）", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    vecStore = await import("@/lib/db/vec-store");
    questionService = (await import("@/lib/services/question")).questionService;
    indexModule = await import("@/lib/services/question-vector-index");
    legacy = dbm.getLegacyDb();

    readVecDimFromProductionTable();
    stub.state.dims = vecDim;
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
    stub.state.badDimFor = null;
    stub.state.dims = vecDim;
  });

  it("limit 只处理指定条数：indexed=limit，且超出的一条没有向量", async () => {
    const q1 = await createQuestion(`索引-甲-${process.pid}`);
    const q2 = await createQuestion(`索引-乙-${process.pid}`);
    const q3 = await createQuestion(`索引-丙-${process.pid}`);

    const result = await indexModule.reindexQuestions({ limit: 2 });

    expect(result).toEqual({
      scanned: 2,
      indexed: 2,
      skipped: 0,
      failed: 0,
      unavailable: false,
    });
    // 按 id 升序取，所以前两道有向量、第三道没有
    expect(storedQuestionIds()).toEqual([q1, q2]);
    expect(storedQuestionIds()).not.toContain(q3);

    // 写进去的是真向量：用同一段文本的 embedding 查 KNN，距离 0 命中自身
    const hits = vecStore.searchQuestionVectors(
      stub.unit(embeddingText(`索引-甲-${process.pid}`), vecDim),
      2,
    );
    expect(hits[0].questionId).toBe(q1);
    expect(hits[0].distance).toBeCloseTo(0, 6);
  });

  it("embedding 降级（伪向量）时 skipped，且表里没有该题的行", async () => {
    stub.state.fails = true;
    const qid = await createQuestion(`降级-${process.pid}`);

    expect(await indexModule.indexQuestion(qid)).toBe("skipped");
    expect(storedQuestionIds()).not.toContain(qid);

    // 批量路径同样算 skipped（不是 failed）：API 不可达不是"这一题坏了"
    const offset = questionCount() - 1;
    const batch = await indexModule.reindexQuestions({ limit: 1, offset });
    expect(batch).toMatchObject({
      scanned: 1,
      indexed: 0,
      skipped: 1,
      failed: 0,
    });
    expect(storedQuestionIds()).not.toContain(qid);
  });

  it("dryRun 只统计：不发 embedding 请求、不写向量表、不回调进度", async () => {
    await createQuestion(`dry-run-${process.pid}`);

    const callsBefore = stub.state.calls;
    const rowsBefore = storedQuestionIds().length;
    const onProgress = vi.fn();

    const result = await indexModule.reindexQuestions({
      limit: 10,
      dryRun: true,
      onProgress,
    });

    expect(result.scanned).toBeGreaterThan(0);
    expect(result).toMatchObject({
      indexed: 0,
      skipped: 0,
      failed: 0,
      unavailable: false,
    });
    expect(stub.state.calls).toBe(callsBefore);
    expect(storedQuestionIds().length).toBe(rowsBefore);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("vec-store 不可用时整批 unavailable，不逐条失败", async () => {
    const spy = vi.spyOn(vecStore, "isVectorAvailable").mockReturnValue(false);
    try {
      const result = await indexModule.reindexQuestions({ limit: 5 });
      expect(result).toEqual({
        scanned: 0,
        indexed: 0,
        skipped: 0,
        failed: 0,
        unavailable: true,
      });
      expect(await indexModule.indexQuestion(1)).toBe("unavailable");
    } finally {
      spy.mockRestore();
    }
  });

  it("单题失败不影响整批：维度不符算 failed，后面的题照常 indexed", async () => {
    const offset = questionCount();
    const bad = await createQuestion(`维度不符-${process.pid}`);
    const good = await createQuestion(`正常-${process.pid}`);

    // 只有这一题的 embedding 返回错误维度 → upsert 被 sqlite-vec 拒绝
    stub.state.badDimFor = "维度不符";

    const result = await indexModule.reindexQuestions({ limit: 2, offset });

    expect(result).toEqual({
      scanned: 2,
      indexed: 1,
      skipped: 0,
      failed: 1,
      unavailable: false,
    });
    const stored = storedQuestionIds();
    expect(stored).toContain(good);
    expect(stored).not.toContain(bad);
  });

  it("重复跑同一批不产生重复行（upsert 语义）", async () => {
    const offset = questionCount();
    const q1 = await createQuestion(`重复-甲-${process.pid}`);
    const q2 = await createQuestion(`重复-乙-${process.pid}`);

    const first = await indexModule.reindexQuestions({ limit: 2, offset });
    expect(first).toMatchObject({ scanned: 2, indexed: 2 });

    const rowsAfterFirst = storedQuestionIds();
    const second = await indexModule.reindexQuestions({ limit: 2, offset });

    expect(second).toMatchObject({ scanned: 2, indexed: 2, failed: 0 });
    expect(storedQuestionIds()).toEqual(rowsAfterFirst);
    expect(storedQuestionIds()).toEqual(expect.arrayContaining([q1, q2]));
    const duplicates = legacy
      .prepare(
        "SELECT question_id, count(*) AS c FROM questions_vec GROUP BY question_id HAVING c > 1",
      )
      .all();
    expect(duplicates).toHaveLength(0);
  });

  it("题目不存在时 skipped（不抛异常、不写空行）", async () => {
    expect(await indexModule.indexQuestion(999_999_999)).toBe("skipped");
    expect(storedQuestionIds()).not.toContain(999_999_999);
  });

  // ---- pruneOnSkip：单题编辑 vs 批量回填，两种场景要求相反 ----

  it("单题编辑（pruneOnSkip: true）降级时删除旧向量：宁可检索不到，也不按旧题干召回", async () => {
    const qid = await createQuestion(`编辑降级-${process.pid}`);

    // 先留下一条"修改前"的旧向量
    expect(await indexModule.indexQuestion(qid, { pruneOnSkip: true })).toBe(
      "indexed",
    );
    expect(storedQuestionIds()).toContain(qid);

    // 模拟管理端改了题干：embedding 文本变了（因此不会命中旧文本的向量缓存），
    // 旧向量描述的是**旧题面**
    await questionService.update(qid, {
      content: `编辑后-${process.pid}`,
    } as never);

    stub.state.fails = true;
    expect(await indexModule.indexQuestion(qid, { pruneOnSkip: true })).toBe(
      "skipped",
    );
    // 旧向量描述的是旧题面，必须消失
    expect(storedQuestionIds()).not.toContain(qid);
  });

  it("批量回填（默认 pruneOnSkip: false）降级时保留旧向量：API 抖动不该把索引删空", async () => {
    const offset = questionCount();
    const qid = await createQuestion(`回填保留-${process.pid}`);
    expect(await indexModule.indexQuestion(qid)).toBe("indexed");
    expect(storedQuestionIds()).toContain(qid);

    // 题干已改（回填要处理的新文本不在缓存里），此时 API 又不通
    await questionService.update(qid, {
      content: `回填后-${process.pid}`,
    } as never);

    stub.state.fails = true;
    const result = await indexModule.reindexQuestions({ limit: 1, offset });

    expect(result).toMatchObject({
      scanned: 1,
      indexed: 0,
      skipped: 1,
      failed: 0,
    });
    // 关键断言：跳过归跳过，向量不能删（否则批量跑到一半抖动就把索引清空了）
    expect(storedQuestionIds()).toContain(qid);
  });

  it("降级判定只认 degraded：长度正确但全零的向量照常入库（不做方差启发式）", async () => {
    const rag = (await import("@/lib/ai/rag")).ragService;
    const spy = vi.spyOn(rag, "getEmbeddingResult").mockResolvedValue({
      vector: new Array(vecDim).fill(0),
      degraded: false,
    });

    try {
      const qid = await createQuestion(`全零向量-${process.pid}`);
      expect(await indexModule.indexQuestion(qid)).toBe("indexed");
      expect(storedQuestionIds()).toContain(qid);
    } finally {
      spy.mockRestore();
    }
  });
});
