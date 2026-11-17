// @vitest-environment node
/**
 * 题库兜底取题（真实 SQLite，不 mock 数据库）
 *
 * 为什么单独测这个入口：`ai.ts` 的「AI 生成失败」兜底分两层 ——
 * 有向量时按相似度取（`searchSimilarQuestions`），没有时走这里。
 *
 * 这段逻辑是补出来的，起因很具体：`#199` 之后 `searchSimilarQuestions` 在
 * embedding 降级时返回 `[]`（伪向量只是噪声的最近邻，不该参与检索），
 * 于是「AI 挂了」变成「没题可练」—— 以前它"能用"，是因为返回的是垃圾。
 *
 * 所以这里必须钉住两件事：
 *   1. 向量不可用 / embedding 降级时，这个入口**照样能从题库取到题**；
 *   2. 它**完全不碰**向量路径（不是"查了再过滤"）。
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

const dbFile = `test-question-fallback-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** 向量能力一律报"不可用"：本文件断言的就是"没有向量也有题" */
vi.mock("@/lib/db/vec-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/vec-store")>();
  return {
    ...actual,
    isVectorAvailable: vi.fn(() => false),
    searchQuestionVectors: vi.fn(() => {
      throw new Error("题库兜底不该走向量检索");
    }),
  };
});

type DbModule = typeof import("@/lib/db");
type QuestionModule = typeof import("@/lib/services/question");
type VecStoreModule = typeof import("@/lib/db/vec-store");

let dbm: DbModule;
let questionService: QuestionModule["questionService"];
let vecStore: VecStoreModule;

beforeAll(async () => {
  dbm = await import("@/lib/db");
  await dbm.initDatabase();
  ({ questionService } = await import("@/lib/services/question"));
  vecStore = await import("@/lib/db/vec-store");
});

afterAll(() => {
  dbm?.closeDb?.();
  try {
    for (const suffix of ["", "-shm", "-wal"]) {
      fs.rmSync(`${dbFile}${suffix}`, { force: true });
    }
  } catch {
    // audit-allow: 清理测试库失败不影响结论（临时文件名带 pid，不会互相踩）
  }
});

beforeEach(async () => {
  await dbm.drizzleDb.run("DELETE FROM questions" as never);
  vi.mocked(vecStore.searchQuestionVectors).mockClear();
});

async function seed(id: number, content: string, tags = '["tag1"]') {
  await dbm.drizzleDb.run(
    `INSERT INTO questions (id, content, options, answer, explanation, tags, dimension, type, external_id)
     VALUES (${id}, '${content}', '["A","B"]', 'A', '解析内容至少五个字', '${tags}', 'knowledge', 'single', 'ext-${id}')` as never,
  );
}

describe("questionService.pickFallbackQuestions", () => {
  it("题库有题时能取到（向量不可用也照样有题可练）", async () => {
    await seed(901, "题库兜底题一");
    await seed(902, "题库兜底题二");

    // 前提：向量路径确实不可用（mock 里已强制 false，这里再断言一次，防 mock 被改）
    expect(vecStore.isVectorAvailable()).toBe(false);

    const rows = await questionService.pickFallbackQuestions(3);

    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.content).sort()).toEqual([
      "题库兜底题一",
      "题库兜底题二",
    ]);
  });

  it("不碰向量检索：这个入口存在的意义就是绕开它", async () => {
    await seed(903, "任意题");

    await questionService.pickFallbackQuestions(3);

    expect(vecStore.searchQuestionVectors).not.toHaveBeenCalled();
  });

  it("题库为空时返回空数组（由调用方决定抛错，不在这里编造题目）", async () => {
    const rows = await questionService.pickFallbackQuestions(3);

    expect(rows).toEqual([]);
  });

  it("题面为空的脏数据不参与兜底（空题干等于没题）", async () => {
    await seed(904, "正常题");
    await dbm.drizzleDb.run(
      `INSERT INTO questions (id, content, options, answer, explanation, tags, dimension, type, external_id)
       VALUES (905, '', '["A","B"]', 'A', '解析内容至少五个字', '["tag1"]', 'knowledge', 'single', 'ext-905')` as never,
    );

    const rows = await questionService.pickFallbackQuestions(3);

    expect(rows.map((r) => r.content)).toEqual(["正常题"]);
  });

  it("limit 生效（不会一次把整个题库捞回来）", async () => {
    await seed(906, "题一");
    await seed(907, "题二");
    await seed(908, "题三");

    const rows = await questionService.pickFallbackQuestions(2);

    expect(rows.length).toBe(2);
  });
});
