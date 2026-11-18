// @vitest-environment node
/**
 * PDF 导入服务测试（真实 SQLite + 真实迁移）
 *
 * 背景：confirmImport 旧实现逐条 insert 题目，再关联文件夹、写 practice_logs、
 * 写 SRS；任一后置步骤失败就返回"导入失败"，但题目已经落库 —— 用户重试会造出
 * 重复题目。修复 = 确定性幂等键 + 单事务写入。
 *
 * 因此这里不再 mock `@/lib/db`（mock 数据库无法验证事务是否真的回滚，也违反了
 * 「关键路径必须有真实依赖的集成测试」这条硬规则）。只有 AI 侧依赖
 * （PaddleOCR / 题目解析）和旁路的 SRS 写入仍是 mock。
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

const dbFile = `test-pdf-import-${process.pid}.db`;
/** 缓存的 owner：既有多数用例以它创建任务 */
const USER_A = 1;
const USER_B = 2;
process.env.DB_FILENAME = dbFile;

// --- 仅 mock AI 侧依赖与旁路 SRS ---
const { mockPerformPaddleOCR, mockParseSingleChunk, mockUpdateQuestionSrs } =
  vi.hoisted(() => ({
    mockPerformPaddleOCR: vi.fn(),
    mockParseSingleChunk: vi.fn(),
    mockUpdateQuestionSrs: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock("@/lib/ai/paddle-ocr", () => ({
  performPaddleOCR: mockPerformPaddleOCR,
}));

vi.mock("@/lib/import/pdf-question-parser", () => ({
  cleanOcrText: (text: string) => text,
  splitIntoQuestionChunks: vi.fn(),
  parseSingleChunk: mockParseSingleChunk,
}));

// SRS 卡是导入的旁路副作用（提交后补写），与本测试关注的事务/幂等性无关；
// 且其真实写入会额外占用 libsql 连接，故隔离为 mock 并断言调用参数。
vi.mock("../srs", () => ({
  srsService: {
    updateQuestionSrs: mockUpdateQuestionSrs,
  },
}));

type DbModule = typeof import("../../db");
type PdfImportModule = typeof import("../pdf-import");

let dbm: DbModule;
let pdfImportService: PdfImportModule["pdfImportService"];
let buildPdfExternalId: PdfImportModule["buildPdfExternalId"];

const FOLDER_ID = 501;
const OTHER_USER_FOLDER_ID = 502;
const USER_ID = 1;
const MISSING_USER_ID = 999_99999; // 不存在的用户：用于触发 practice_logs 外键失败

let seq = 0;

interface SampleQuestion {
  content: string;
  options: string[];
  type: "single" | "multi" | "truefalse";
  answer: string;
  explanation: string;
  confidence: number;
  tags: string[];
}

/** 每题内容唯一，避免用例之间互相命中幂等键 */
function makeQuestion(overrides: Partial<SampleQuestion> = {}): SampleQuestion {
  seq += 1;
  return {
    content: `PDF 导入测试题目-${process.pid}-${seq}`,
    options: ["观察法", "实验法", "调查法", "文献法"],
    type: "single",
    answer: "B",
    explanation: "实验法是教育学研究的基本方法",
    confidence: 85,
    tags: ["教育学"],
    ...overrides,
  };
}

async function scalar(query: any): Promise<number> {
  const rows = (await dbm.drizzleDb.all(query)) as any[];
  const row = rows[0] ?? {};
  return Number(Object.values(row)[0] ?? 0);
}

describe("pdfImportService", () => {
  beforeAll(async () => {
    dbm = await import("../../db");
    await dbm.initDatabase();
    // 固定用户 1（外键需要真实 users 行）；外加一个用于"文件夹不属于本人"的场景
    await dbm.drizzleDb.run(
      "INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (1, 'pdf-import-tester', 'x')" as any,
    );
    await dbm.drizzleDb.run(
      "INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (2, 'pdf-import-other', 'x')" as any,
    );
    await dbm.drizzleDb.run(
      `INSERT OR IGNORE INTO question_folders (id, user_id, name) VALUES (${FOLDER_ID}, 1, 'PDF 导入夹')` as any,
    );
    await dbm.drizzleDb.run(
      `INSERT OR IGNORE INTO question_folders (id, user_id, name) VALUES (${OTHER_USER_FOLDER_ID}, 2, '别人的夹')` as any,
    );

    const mod = await import("../pdf-import");
    pdfImportService = mod.pdfImportService;
    buildPdfExternalId = mod.buildPdfExternalId;
  });

  afterAll(async () => {
    // 先释放 libsql 连接再删文件（Windows 下未关闭的句柄会让删除失败）
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateQuestionSrs.mockResolvedValue(undefined);
  });

  describe("ocrAndSplit", () => {
    it("should call OCR, clean, split and return taskId + totalChunks", async () => {
      const parser = await import("@/lib/import/pdf-question-parser");
      mockPerformPaddleOCR.mockResolvedValue(
        "1. 题目一\nA.选项A\n2. 题目二\nB.选项B",
      );
      (parser.splitIntoQuestionChunks as any).mockReturnValue([
        "chunk1",
        "chunk2",
      ]);

      const result = await pdfImportService.ocrAndSplit(
        USER_A,
        Buffer.from("fake-pdf"),
        "test.pdf",
        "application/pdf",
      );

      expect(mockPerformPaddleOCR).toHaveBeenCalledWith(
        expect.any(Buffer),
        "test.pdf",
        "application/pdf",
      );
      expect(result.taskId).toBeDefined();
      expect(typeof result.taskId).toBe("string");
      expect(result.totalChunks).toBe(2);
    });

    it("should throw when OCR result is empty", async () => {
      mockPerformPaddleOCR.mockResolvedValue("");

      await expect(
        pdfImportService.ocrAndSplit(
          USER_A,
          Buffer.from("fake-pdf"),
          "test.pdf",
          "application/pdf",
        ),
      ).rejects.toThrow("OCR 识别结果为空");
    });

    it("should throw when OCR result is whitespace only", async () => {
      mockPerformPaddleOCR.mockResolvedValue("   ");

      await expect(
        pdfImportService.ocrAndSplit(
          USER_A,
          Buffer.from("fake-pdf"),
          "test.pdf",
          "application/pdf",
        ),
      ).rejects.toThrow("OCR 识别结果为空");
    });

    it("should throw when no chunks could be extracted", async () => {
      const parser = await import("@/lib/import/pdf-question-parser");
      mockPerformPaddleOCR.mockResolvedValue("some text with enough content");
      (parser.splitIntoQuestionChunks as any).mockReturnValue([]);

      await expect(
        pdfImportService.ocrAndSplit(
          USER_A,
          Buffer.from("fake-pdf"),
          "test.pdf",
          "application/pdf",
        ),
      ).rejects.toThrow("未能从 PDF 中分割出题目");
    });

    it("should call onProgress callback", async () => {
      const parser = await import("@/lib/import/pdf-question-parser");
      mockPerformPaddleOCR.mockResolvedValue(
        "ocr text content for progress test",
      );
      (parser.splitIntoQuestionChunks as any).mockReturnValue(["chunk1"]);

      const onProgress = vi.fn();
      await pdfImportService.ocrAndSplit(
        USER_A,
        Buffer.from("fake-pdf"),
        "test.pdf",
        "application/pdf",
        onProgress,
      );

      expect(onProgress).toHaveBeenCalledWith("ocr", "正在 OCR 识别...");
    });
  });

  describe("parseSingleChunk", () => {
    it("should return questions for a valid taskId and chunkIndex", async () => {
      const parser = await import("@/lib/import/pdf-question-parser");
      mockPerformPaddleOCR.mockResolvedValue(
        "1. 教育学研究的基本方法是\nA.观察法\nB.实验法",
      );
      (parser.splitIntoQuestionChunks as any).mockReturnValue([
        "chunk1",
        "chunk2",
      ]);
      mockParseSingleChunk.mockResolvedValue([makeQuestion()]);

      const { taskId } = await pdfImportService.ocrAndSplit(
        USER_A,
        Buffer.from("fake-pdf"),
        "test.pdf",
        "application/pdf",
      );
      const result = await pdfImportService.parseSingleChunk(USER_A, taskId, 0);

      expect(result.questions).toHaveLength(1);
      expect(result.chunkIndex).toBe(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should throw for expired/invalid taskId", async () => {
      await expect(
        pdfImportService.parseSingleChunk(USER_A, "nonexistent", 0),
      ).rejects.toThrow("任务不存在或已过期");
    });

    it("should throw for out-of-range chunkIndex", async () => {
      const parser = await import("@/lib/import/pdf-question-parser");
      mockPerformPaddleOCR.mockResolvedValue(
        "1. 教育学研究的基本方法是\nA.观察法",
      );
      (parser.splitIntoQuestionChunks as any).mockReturnValue(["chunk1"]);

      const { taskId } = await pdfImportService.ocrAndSplit(
        USER_A,
        Buffer.from("fake-pdf"),
        "test.pdf",
        "application/pdf",
      );

      await expect(
        pdfImportService.parseSingleChunk(USER_A, taskId, 5),
      ).rejects.toThrow("超出范围");
    });

    it("should return warning when chunk parsing fails", async () => {
      const parser = await import("@/lib/import/pdf-question-parser");
      mockPerformPaddleOCR.mockResolvedValue(
        "1. 教育学研究的基本方法是\nA.观察法",
      );
      (parser.splitIntoQuestionChunks as any).mockReturnValue(["chunk1"]);
      mockParseSingleChunk.mockRejectedValue(
        new Error("AI service unavailable"),
      );

      const { taskId } = await pdfImportService.ocrAndSplit(
        USER_A,
        Buffer.from("fake-pdf"),
        "test.pdf",
        "application/pdf",
      );
      const result = await pdfImportService.parseSingleChunk(USER_A, taskId, 0);

      expect(result.questions).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("解析失败");
    });
  });

  describe("cleanup", () => {
    it("should remove cached taskId", async () => {
      const parser = await import("@/lib/import/pdf-question-parser");
      mockPerformPaddleOCR.mockResolvedValue(
        "1. 教育学研究的基本方法是\nA.观察法",
      );
      (parser.splitIntoQuestionChunks as any).mockReturnValue(["chunk1"]);

      const { taskId } = await pdfImportService.ocrAndSplit(
        USER_A,
        Buffer.from("fake-pdf"),
        "test.pdf",
        "application/pdf",
      );
      await pdfImportService.cleanup(USER_A, taskId);

      await expect(
        pdfImportService.parseSingleChunk(USER_A, taskId, 0),
      ).rejects.toThrow("任务不存在或已过期");
    });
  });

  describe("任务态落库（跨实例可见）", () => {
    async function seedTask(): Promise<string> {
      const parser = await import("@/lib/import/pdf-question-parser");
      mockPerformPaddleOCR.mockResolvedValue(
        "1. 教育学研究的基本方法是\nA.观察法",
      );
      (parser.splitIntoQuestionChunks as any).mockReturnValue(["chunk1"]);
      const { taskId } = await pdfImportService.ocrAndSplit(
        USER_A,
        Buffer.from("fake-pdf"),
        "test.pdf",
        "application/pdf",
      );
      return taskId;
    }

    it("任务写进 pdf_import_tasks，而不是进程内存", async () => {
      const taskId = await seedTask();

      // as any：drizzleDb.all 的类型签名要求 Drizzle 查询对象，这里刻意用原生 SQL
      // 直接读表，避免"用 ORM 读自己刚写的数据"掩盖真实落盘形状
      const rows = (await dbm.drizzleDb.all(
        `SELECT id, user_id, chunks_json, expires_at FROM pdf_import_tasks WHERE id = '${taskId}'` as any,
      )) as Array<{
        id: string;
        user_id: number;
        chunks_json: string;
        expires_at: number;
      }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(USER_A);
      expect(JSON.parse(rows[0].chunks_json)).toEqual(["chunk1"]);
      // 过期时间是未来时刻（30 分钟 TTL）
      expect(Number(rows[0].expires_at)).toBeGreaterThan(Date.now());
    });

    it("过期的行即使存在也视为不存在（按 expires_at 判定，不靠定时器）", async () => {
      const taskId = await seedTask();

      await dbm.drizzleDb.run(
        `UPDATE pdf_import_tasks SET expires_at = ${Date.now() - 1000} WHERE id = '${taskId}'` as any,
      );

      await expect(
        pdfImportService.parseSingleChunk(USER_A, taskId, 0),
      ).rejects.toThrow("任务不存在或已过期");
    });

    it("重新加载模块（等价于另一个实例）后仍能读到任务，且拿到的是落库的分块", async () => {
      const taskId = await seedTask();

      // 让解析器真的成功返回：否则"解析失败 → questions: []"也能让断言通过，
      // 测不出"重载后是否拿到了持久化的分块文本"
      mockParseSingleChunk.mockReset();
      mockParseSingleChunk.mockResolvedValue({
        questions: [makeQuestion()],
        warnings: [],
      });

      // 清掉模块级状态后重新 import：若任务态还在内存里，这一步就读不到了
      vi.resetModules();
      const reloaded = (await import("../pdf-import")).pdfImportService;
      const result = await reloaded.parseSingleChunk(USER_A, taskId, 0);

      expect(result.chunkIndex).toBe(0);
      // 关键断言：传进解析器的正是当初落库的那个分块
      // （服务层把解析器的返回值原样透传，所以这里看 mock 而不是看 questions 的形状）
      expect(mockParseSingleChunk).toHaveBeenCalledWith("chunk1");
    });

    it("写入新任务时顺手清理过期行，但不误删仍有效的任务", async () => {
      const stale = await seedTask();
      // as any：drizzleDb.run 接受 SQL 字面量，这里用原生语句直接改 expires_at
      await dbm.drizzleDb.run(
        `UPDATE pdf_import_tasks SET expires_at = ${Date.now() - 1000} WHERE id = '${stale}'` as any,
      );

      const fresh = await seedTask();

      // 过期行被清掉
      const staleRows = (await dbm.drizzleDb.all(
        `SELECT id FROM pdf_import_tasks WHERE id = '${stale}'` as any,
      )) as unknown[];
      expect(staleRows).toHaveLength(0);

      // 新任务必须还在，且真的可解析（否则"清理"可能把有效行一起删了也照样通过）
      const freshRows = (await dbm.drizzleDb.all(
        `SELECT id FROM pdf_import_tasks WHERE id = '${fresh}'` as any,
      )) as unknown[];
      expect(freshRows).toHaveLength(1);
      mockParseSingleChunk.mockResolvedValue({
        questions: [makeQuestion()],
        warnings: [],
      });
      await expect(
        pdfImportService.parseSingleChunk(USER_A, fresh, 0),
      ).resolves.toMatchObject({ chunkIndex: 0 });
    });

    it("chunks_json 结构损坏（不是字符串数组）时按「不存在」处理，不抛 500", async () => {
      const taskId = await seedTask();
      // as any：故意写入非法形状，验证服务层的兜底
      await dbm.drizzleDb.run(
        `UPDATE pdf_import_tasks SET chunks_json = 'null' WHERE id = '${taskId}'` as any,
      );

      await expect(
        pdfImportService.parseSingleChunk(USER_A, taskId, 0),
      ).rejects.toThrow("任务不存在或已过期");
    });
  });

  describe("任务归属（IDOR 防护）", () => {
    /** 造一个属于 USER_A 的任务，分块内容固定 */
    async function seedTaskFor(userId: number): Promise<string> {
      const parser = await import("@/lib/import/pdf-question-parser");
      mockPerformPaddleOCR.mockResolvedValue(
        "1. 教育学研究的基本方法是\nA.观察法",
      );
      (parser.splitIntoQuestionChunks as any).mockReturnValue([
        "chunk1",
        "chunk2",
      ]);
      const { taskId } = await pdfImportService.ocrAndSplit(
        userId,
        Buffer.from("fake-pdf"),
        "test.pdf",
        "application/pdf",
      );
      return taskId;
    }

    it("他人 taskId 不能解析：报的是「不存在或已过期」，不泄露存在性", async () => {
      const taskId = await seedTaskFor(USER_A);
      await expect(
        pdfImportService.parseSingleChunk(USER_B, taskId, 0),
      ).rejects.toThrow("任务不存在或已过期");
    });

    it("他人 taskId 不能清理，且原任务仍然可用", async () => {
      const taskId = await seedTaskFor(USER_A);
      mockParseSingleChunk.mockResolvedValue([makeQuestion()]);

      expect(await pdfImportService.cleanup(USER_B, taskId)).toBe(false);

      // 关键：清理失败不能把别人的缓存一起删掉
      const result = await pdfImportService.parseSingleChunk(USER_A, taskId, 0);
      expect(result.chunkIndex).toBe(0);
    });

    it("owner 清理后自己也无法再解析（cleanup 真的生效）", async () => {
      const taskId = await seedTaskFor(USER_A);
      expect(await pdfImportService.cleanup(USER_A, taskId)).toBe(true);
      await expect(
        pdfImportService.parseSingleChunk(USER_A, taskId, 0),
      ).rejects.toThrow("任务不存在或已过期");
    });
  });

  describe("buildPdfExternalId（幂等键）", () => {
    it("同一题面的键稳定且总长不超过 40 字符", () => {
      const q = makeQuestion();
      const a = buildPdfExternalId(q);
      const b = buildPdfExternalId({ ...q, options: [...q.options] });

      expect(a).toBe(b);
      expect(a.startsWith("pdf:")).toBe(true);
      expect(a.length).toBeLessThanOrEqual(40);
    });

    it("答案或题面不同则键不同", () => {
      const q = makeQuestion();
      expect(buildPdfExternalId({ ...q, answer: "C" })).not.toBe(
        buildPdfExternalId(q),
      );
      expect(
        buildPdfExternalId({ ...q, content: `${q.content}-改写` }),
      ).not.toBe(buildPdfExternalId(q));
    });
  });

  describe("confirmImport", () => {
    it("should insert question and return success", async () => {
      const q = makeQuestion();

      const result = await pdfImportService.confirmImport(USER_ID, [q]);

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(result.message).toContain("成功导入 1 道题目");

      // 落库内容与幂等键都要正确
      const rows = (await dbm.drizzleDb.all(
        sql`SELECT content, options, tags, source, external_id FROM questions WHERE external_id = ${buildPdfExternalId(q)}`,
      )) as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe(q.content);
      expect(JSON.parse(rows[0].options)).toEqual(q.options);
      expect(JSON.parse(rows[0].tags)).toEqual(q.tags);
      expect(rows[0].source).toBe("pdf_import");
    });

    it("同一批里的完全重复题只落一行（批内去重）", async () => {
      const q = makeQuestion();

      const result = await pdfImportService.confirmImport(USER_ID, [q, q, q]);

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);
      expect(result.skippedCount).toBe(2);
      expect(
        await scalar(
          sql`SELECT COUNT(*) AS c FROM questions WHERE external_id = ${buildPdfExternalId(q)}`,
        ),
      ).toBe(1);
    });

    it("should add questions to folder when folderId provided", async () => {
      const q = makeQuestion();

      const result = await pdfImportService.confirmImport(
        USER_ID,
        [q],
        FOLDER_ID,
      );

      expect(result.importedCount).toBe(1);
      expect(
        await scalar(
          sql`SELECT COUNT(*) AS c FROM question_folder_items
              WHERE folder_id = ${FOLDER_ID}
                AND question_id = (SELECT id FROM questions WHERE external_id = ${buildPdfExternalId(q)})`,
        ),
      ).toBe(1);
    });

    it("文件夹不属于该用户时不写关联（保持 addQuestions 的既有语义）", async () => {
      const q = makeQuestion();

      const result = await pdfImportService.confirmImport(
        USER_ID,
        [q],
        OTHER_USER_FOLDER_ID,
      );

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);
      expect(
        await scalar(
          sql`SELECT COUNT(*) AS c FROM question_folder_items
              WHERE folder_id = ${OTHER_USER_FOLDER_ID}
                AND question_id = (SELECT id FROM questions WHERE external_id = ${buildPdfExternalId(q)})`,
        ),
      ).toBe(0);
    });

    it("should not write folder link when no folderId", async () => {
      const q = makeQuestion();

      await pdfImportService.confirmImport(USER_ID, [q]);

      expect(
        await scalar(
          sql`SELECT COUNT(*) AS c FROM question_folder_items
              WHERE question_id = (SELECT id FROM questions WHERE external_id = ${buildPdfExternalId(q)})`,
        ),
      ).toBe(0);
    });

    it("should return failure for empty questions array", async () => {
      const result = await pdfImportService.confirmImport(USER_ID, []);

      expect(result.success).toBe(false);
      expect(result.importedCount).toBe(0);
      expect(result.skippedCount).toBe(0);
      expect(result.message).toBe("没有要导入的题目");
    });

    it("should add to wrong book and SRS when addToWrongBook is true", async () => {
      const q = makeQuestion();

      const result = await pdfImportService.confirmImport(
        USER_ID,
        [q],
        undefined,
        true,
      );

      expect(result.importedCount).toBe(1);
      const questionId = await scalar(
        sql`SELECT id FROM questions WHERE external_id = ${buildPdfExternalId(q)}`,
      );
      expect(
        await scalar(
          sql`SELECT COUNT(*) AS c FROM practice_logs
              WHERE user_id = ${USER_ID} AND question_id = ${questionId} AND is_correct = 0`,
        ),
      ).toBe(1);
      expect(mockUpdateQuestionSrs).toHaveBeenCalledWith(
        USER_ID,
        questionId,
        false,
        0,
        undefined,
        undefined,
        0,
      );
    });

    it("should skip wrong book when addToWrongBook is false", async () => {
      const q = makeQuestion();

      await pdfImportService.confirmImport(USER_ID, [q], undefined, false);

      expect(
        await scalar(
          sql`SELECT COUNT(*) AS c FROM practice_logs
              WHERE question_id = (SELECT id FROM questions WHERE external_id = ${buildPdfExternalId(q)})`,
        ),
      ).toBe(0);
      expect(mockUpdateQuestionSrs).not.toHaveBeenCalled();
    });

    it("同一批题目连导两次：第二次不新增、不重复落行", async () => {
      const batch = [makeQuestion(), makeQuestion(), makeQuestion()];
      const externalIds = batch.map(buildPdfExternalId);

      const first = await pdfImportService.confirmImport(
        USER_ID,
        batch,
        FOLDER_ID,
      );
      expect(first.success).toBe(true);
      expect(first.importedCount).toBe(3);
      expect(first.skippedCount).toBe(0);

      const second = await pdfImportService.confirmImport(
        USER_ID,
        batch,
        FOLDER_ID,
      );
      expect(second.success).toBe(true);
      expect(second.importedCount).toBe(0);
      expect(second.skippedCount).toBe(3);
      expect(second.message).toContain("3 道已存在，已跳过");

      // 每个 external_id 只允许一行
      for (const externalId of externalIds) {
        expect(
          await scalar(
            sql`SELECT COUNT(*) AS c FROM questions WHERE external_id = ${externalId}`,
          ),
        ).toBe(1);
      }
      // 第二次不得再写错题本日志、不得再写文件夹关联
      const externalIdList = sql.join(
        externalIds.map((id) => sql`${id}`),
        sql`, `,
      );
      expect(
        await scalar(
          sql`SELECT COUNT(*) AS c FROM practice_logs
              WHERE question_id IN (
                SELECT id FROM questions WHERE external_id IN (${externalIdList})
              )`,
        ),
      ).toBe(3);
      expect(
        await scalar(
          sql`SELECT COUNT(*) AS c FROM question_folder_items
              WHERE folder_id = ${FOLDER_ID}
                AND question_id IN (
                  SELECT id FROM questions WHERE external_id IN (${externalIdList})
                )`,
        ),
      ).toBe(3);
    });

    it("practice_logs 写入失败时整个事务回滚，题目不残留", async () => {
      // 前提：本地 libsql 默认开启 foreign_keys，否则回滚用例会空转通过
      const fk = (await dbm.drizzleDb.all(
        "PRAGMA foreign_keys" as any,
      )) as any[];
      expect(Number(Object.values(fk[0])[0])).toBe(1);

      const batch = [makeQuestion(), makeQuestion()];
      const externalIds = batch.map(buildPdfExternalId);

      // user_id 不存在 → practice_logs 外键失败（题目 insert 已成功，用于验证回滚）
      const result = await pdfImportService.confirmImport(
        MISSING_USER_ID,
        batch,
      );

      expect(result.success).toBe(false);
      expect(result.importedCount).toBe(0);
      // 钉住失败原因：确实是 practice_logs 的外键约束，而不是别的问题
      // （drizzle 只把 SQL 放在 message 上，底层错误在 cause 里）
      expect(result.message).toContain("practice_logs");

      for (const externalId of externalIds) {
        expect(
          await scalar(
            sql`SELECT COUNT(*) AS c FROM questions WHERE external_id = ${externalId}`,
          ),
        ).toBe(0);
      }
    });

    it("事务提交后 SRS 写入失败不影响导入结果", async () => {
      const q = makeQuestion();
      mockUpdateQuestionSrs.mockRejectedValue(new Error("SRS 写入失败"));

      const result = await pdfImportService.confirmImport(USER_ID, [q]);

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);
      expect(
        await scalar(
          sql`SELECT COUNT(*) AS c FROM questions WHERE external_id = ${buildPdfExternalId(q)}`,
        ),
      ).toBe(1);
    });
  });
});
