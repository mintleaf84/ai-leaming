// @vitest-environment node
/**
 * 教材服务（真实 SQLite + 真实迁移 + 真实文件系统）。
 *
 * 原测试 mock 了 drizzleDelete/select/insert 与整个 `fs`，只验证了
 * 「delete 被调用过」「addChunk 的元数据长这样」。但教材删除是级联 + 磁盘清理，
 * 恰恰最需要真依赖：这里改为真库（FK cascade）与真目录，断言
 *   - 每个章节都按真实 chapter id 清了 RAG；
 *   - textbooks / textbook_chapters 的行真的消失（靠迁移里的 FK cascade）；
 *   - public/books/<id> 目录真的被删掉；
 *   - addChapter / updateChapter 的分块参数与库内内容一致。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { asc, eq } from "drizzle-orm";

const dbFile = `test-textbook-service-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

// RAG 是外部依赖（向量库 + 嵌入服务），保持 mock；DB 与 fs 一律是真的。
vi.mock("@/lib/ai/rag", () => ({
  ragService: {
    addChunk: vi.fn().mockResolvedValue(undefined),
    deleteChunksBySource: vi.fn(),
  },
}));

type DbModule = typeof import("../../db");
type TextbookModule = typeof import("../textbook");

let dbm: DbModule;
let textbookService: TextbookModule["textbookService"];
let ragService: (typeof import("../../ai/rag"))["ragService"];

/** 测试用教材目录都落在 public/books/<id>，收尾统一清理 */
const createdDirs = new Set<string>();

function bookDir(id: number): string {
  return path.join(process.cwd(), "public", "books", String(id));
}

async function dropBookDir(id: number): Promise<void> {
  const dir = bookDir(id);
  fs.rmSync(dir, { recursive: true, force: true });
  createdDirs.delete(dir);
}

beforeAll(async () => {
  dbm = await import("../../db");
  await dbm.initDatabase();

  const svc = await import("../textbook");
  textbookService = svc.textbookService;
  ragService = (await import("../../ai/rag")).ragService;
});

beforeEach(async () => {
  vi.clearAllMocks();
  // textbook_chapters 由 FK cascade 跟随 textbooks 删除，这里再显式清一遍兜底
  await dbm.drizzleDb.delete(dbm.drizzleSchema.textbook_chapters);
  await dbm.drizzleDb.delete(dbm.drizzleSchema.textbooks);
  for (const dir of [...createdDirs]) {
    fs.rmSync(dir, { recursive: true, force: true });
    createdDirs.delete(dir);
  }
});

afterAll(async () => {
  for (const dir of createdDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  await dbm.closeDrizzle();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
      force: true,
    });
  }
});

/** 直接落一行教材，返回 id */
async function seedTextbook(title: string): Promise<number> {
  const [row] = await dbm.drizzleDb
    .insert(dbm.drizzleSchema.textbooks)
    .values({ title })
    .returning({ id: dbm.drizzleSchema.textbooks.id });
  return row.id;
}

async function chapterRows(textbookId: number) {
  return dbm.drizzleDb
    .select()
    .from(dbm.drizzleSchema.textbook_chapters)
    .where(eq(dbm.drizzleSchema.textbook_chapters.textbook_id, textbookId))
    .orderBy(asc(dbm.drizzleSchema.textbook_chapters.order_index));
}

describe("createTextbook", () => {
  it("返回真实自增 ID，行内容与入参一致", async () => {
    const id = await textbookService.createTextbook({
      title: "教育心理学",
      author: "某出版社",
      description: "教招教材",
    });

    expect(id).toBeGreaterThan(0);
    const [row] = await dbm.drizzleDb
      .select()
      .from(dbm.drizzleSchema.textbooks)
      .where(eq(dbm.drizzleSchema.textbooks.id, id));
    expect(row.title).toBe("教育心理学");
    expect(row.author).toBe("某出版社");
    expect(row.description).toBe("教招教材");
  });
});

describe("addChapter", () => {
  it("章节真的落库，并按真实 chapter id 建 RAG 索引", async () => {
    const textbookId = await seedTextbook("教材 A");

    const chapterId = await textbookService.addChapter({
      textbook_id: textbookId,
      title: "Introduction",
      content: "Welcome to this book",
      order_index: 0,
      level: 1,
    });

    const rows = await chapterRows(textbookId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(chapterId);
    expect(rows[0].title).toBe("Introduction");
    expect(rows[0].content).toBe("Welcome to this book");

    expect(ragService.addChunk).toHaveBeenCalledTimes(1);
    expect(ragService.addChunk).toHaveBeenCalledWith(
      "Welcome to this book",
      expect.objectContaining({
        source_type: "textbook_chapter",
        source_id: chapterId,
        title: "Introduction",
        textbook_id: textbookId,
        chunk_index: 0,
        total_chunks: 1,
      }),
    );
  });

  it("内容为空时不建任何 RAG 索引，但章节仍入库", async () => {
    const textbookId = await seedTextbook("空章节教材");

    const chapterId = await textbookService.addChapter({
      textbook_id: textbookId,
      title: "空白",
      content: "   ",
      order_index: 0,
      level: 1,
    });

    expect(await chapterRows(textbookId)).toHaveLength(1);
    expect(chapterId).toBeGreaterThan(0);
    expect(ragService.addChunk).not.toHaveBeenCalled();
  });

  it("长内容按真实分块器切成多块，chunk_index / total_chunks 与切分结果一致", async () => {
    const textbookId = await seedTextbook("长教材");
    // 每个段落约 1200 字符 → 1000 字符块 + 200 重叠，必然多于 1 块
    const content = Array.from(
      { length: 4 },
      (_, i) => `第 ${i + 1} 段：${"教育学知识点。".repeat(60)}`,
    ).join("\n\n");

    const chapterId = await textbookService.addChapter({
      textbook_id: textbookId,
      title: "长章节",
      content,
      order_index: 0,
      level: 1,
    });

    const calls = vi.mocked(ragService.addChunk).mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    expect(calls[0][1]).toMatchObject({
      source_id: chapterId,
      chunk_index: 0,
      total_chunks: calls.length,
    });
    expect(calls[calls.length - 1][1]).toMatchObject({
      source_id: chapterId,
      chunk_index: calls.length - 1,
      total_chunks: calls.length,
    });
    // 每块都指向同一章、同一教材
    expect(
      calls.every(
        ([, meta]) =>
          (meta as { source_id: number }).source_id === chapterId &&
          (meta as { textbook_id: number }).textbook_id === textbookId,
      ),
    ).toBe(true);
  });
});

describe("deleteTextbook", () => {
  it("每个章节都按真实 id 清 RAG，行与磁盘目录一起消失", async () => {
    const textbookId = await seedTextbook("待删除教材");
    const keepId = await seedTextbook("要保留的教材");

    const c1 = await textbookService.addChapter({
      textbook_id: textbookId,
      title: "C1",
      content: "",
      order_index: 0,
      level: 1,
    });
    const c2 = await textbookService.addChapter({
      textbook_id: textbookId,
      title: "C2",
      content: "",
      order_index: 1,
      level: 1,
    });
    await textbookService.addChapter({
      textbook_id: keepId,
      title: "别人的章节",
      content: "",
      order_index: 0,
      level: 1,
    });
    vi.mocked(ragService.deleteChunksBySource).mockClear();

    // 真实磁盘目录 + 一张图片
    const dir = bookDir(textbookId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "figure-1.png"), "fake-image");
    createdDirs.add(dir);
    expect(fs.existsSync(dir)).toBe(true);

    await textbookService.deleteTextbook(textbookId);

    expect(ragService.deleteChunksBySource).toHaveBeenCalledTimes(2);
    expect(ragService.deleteChunksBySource).toHaveBeenCalledWith(
      "textbook_chapter",
      c1,
    );
    expect(ragService.deleteChunksBySource).toHaveBeenCalledWith(
      "textbook_chapter",
      c2,
    );

    // 真删了：教材行、章节行（FK cascade）、目录
    const books = await dbm.drizzleDb
      .select()
      .from(dbm.drizzleSchema.textbooks);
    expect(books.map((book) => book.id)).toEqual([keepId]);

    expect(await chapterRows(textbookId)).toHaveLength(0);
    expect(await chapterRows(keepId)).toHaveLength(1);

    expect(fs.existsSync(dir)).toBe(false);
    createdDirs.delete(dir);
  });

  it("教材不存在时是空操作：不报错、不碰 RAG、不动别人的数据", async () => {
    const keepId = await seedTextbook("保留");
    await textbookService.addChapter({
      textbook_id: keepId,
      title: "章节",
      content: "",
      order_index: 0,
      level: 1,
    });
    vi.mocked(ragService.deleteChunksBySource).mockClear();

    await expect(
      textbookService.deleteTextbook(999_999),
    ).resolves.toBeUndefined();

    expect(ragService.deleteChunksBySource).not.toHaveBeenCalled();
    expect(await chapterRows(keepId)).toHaveLength(1);
  });

  it("磁盘目录不存在时也能正常删除记录（不因 fs 抛错）", async () => {
    const textbookId = await seedTextbook("无目录教材");
    await dropBookDir(textbookId);

    await expect(
      textbookService.deleteTextbook(textbookId),
    ).resolves.toBeUndefined();

    const rows = await dbm.drizzleDb
      .select()
      .from(dbm.drizzleSchema.textbooks)
      .where(eq(dbm.drizzleSchema.textbooks.id, textbookId));
    expect(rows).toHaveLength(0);
  });
});

describe("getChapters / updateChapter", () => {
  it("章节按 order_index 升序返回库内真实内容", async () => {
    const textbookId = await seedTextbook("排序教材");
    await dbm.drizzleDb.insert(dbm.drizzleSchema.textbook_chapters).values([
      {
        textbook_id: textbookId,
        title: "第二",
        content: "",
        order_index: 2,
      },
      { textbook_id: textbookId, title: "第一", content: "", order_index: 1 },
      { textbook_id: textbookId, title: "第三", content: "", order_index: 3 },
    ]);

    const chapters = await textbookService.getChapters(textbookId);

    expect(chapters.map((chapter) => chapter.title)).toEqual([
      "第一",
      "第二",
      "第三",
    ]);
  });

  it("updateChapter 改库内 content，并按新内容重建索引", async () => {
    const textbookId = await seedTextbook("更新教材");
    const chapterId = await textbookService.addChapter({
      textbook_id: textbookId,
      title: "第一章",
      content: "旧内容",
      order_index: 0,
      level: 1,
    });
    vi.mocked(ragService.deleteChunksBySource).mockClear();
    vi.mocked(ragService.addChunk).mockClear();

    await textbookService.updateChapter(chapterId, "新内容：教育学的对象");

    const rows = await chapterRows(textbookId);
    expect(rows[0].content).toBe("新内容：教育学的对象");

    expect(ragService.deleteChunksBySource).toHaveBeenCalledWith(
      "textbook_chapter",
      chapterId,
    );
    expect(ragService.addChunk).toHaveBeenCalledWith(
      "新内容：教育学的对象",
      expect.objectContaining({
        source_id: chapterId,
        textbook_id: textbookId,
        title: "第一章",
        total_chunks: 1,
      }),
    );
  });

  it("updateChapter 传空内容时只清索引、不重建", async () => {
    const textbookId = await seedTextbook("清空教材");
    const chapterId = await textbookService.addChapter({
      textbook_id: textbookId,
      title: "第一章",
      content: "有内容",
      order_index: 0,
      level: 1,
    });
    vi.mocked(ragService.addChunk).mockClear();
    vi.mocked(ragService.deleteChunksBySource).mockClear();

    await textbookService.updateChapter(chapterId, "");

    expect((await chapterRows(textbookId))[0].content).toBe("");
    expect(ragService.deleteChunksBySource).toHaveBeenCalledWith(
      "textbook_chapter",
      chapterId,
    );
    expect(ragService.addChunk).not.toHaveBeenCalled();
  });
});
