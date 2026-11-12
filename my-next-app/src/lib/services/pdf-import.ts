/**
 * PDF 错题导入服务
 * 编排 OCR 识别 → 分块缓存 → 并发解析 → DB 写入 → 文件夹关联
 * 支持 PDF OCR 和手动粘贴文本两种导入方式
 */

import { performPaddleOCR } from "@/lib/ai/paddle-ocr";
import {
  cleanOcrText,
  splitIntoQuestionChunks,
  parseSingleChunk as parseSingleChunkRaw,
} from "@/lib/import/pdf-question-parser";
import { drizzleDb } from "@/lib/db";
import {
  practice_logs,
  question_folder_items,
  question_folders,
  questions,
} from "@/lib/db/drizzle-schema";
import { and, eq, inArray } from "drizzle-orm";
import { srsService } from "@/lib/services/srs";
import type { PdfImportResult, ParsedPdfQuestion } from "@/types/pdf-import";
import { createHash, randomUUID } from "crypto";
import { log } from "@/lib/logger";

// 内存缓存：taskId → { chunks, ocrText, expiresAt }
const chunkCache = new Map<
  string,
  {
    chunks: string[];
    ocrText: string;
    expiresAt: number;
  }
>();

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 分钟

// 定期清理过期缓存
setInterval(
  () => {
    const now = Date.now();
    for (const [key, val] of chunkCache) {
      if (now > val.expiresAt) chunkCache.delete(key);
    }
  },
  5 * 60 * 1000,
);

/**
 * 确认导入的串行锁（与 import-service 的 withImportLock 同一原因）。
 *
 * `@libsql/client` 本地文件驱动只有一条连接，两个 `transaction()` 并发时会互相
 * 踩（后者提交报 "SQL statements in progress"）。用户重复点击「确认导入」就是
 * 这种场景，串行化后第二次会走幂等分支（全部跳过）而不是双双失败。
 */
let confirmQueue: Promise<unknown> = Promise.resolve();

function withConfirmLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = confirmQueue.then(fn, fn);
  confirmQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * PDF 导入的确定性幂等键。
 *
 * 内容指纹（题目正文 + 选项 JSON + 答案）在"同一份 PDF/文本被重复确认"时稳定，
 * 因此对同一批题目重复导入只会落一份。`pdf:` 前缀占 4 字符，sha1 十六进制取
 * 前 36 位，总长固定 40 字符，便于与粉笔导入的 `external_id` 区分。
 *
 * 注：题面被 OCR 轻微改写会得到不同的键（内容指纹的固有局限），此时靠
 * 「先查后插 + 唯一索引」保证不会有同一键的重复行，但会被当成新题落库。
 */
export function buildPdfExternalId(q: ParsedPdfQuestion): string {
  const options = JSON.stringify(q.options ?? []);
  const digest = createHash("sha1")
    .update(`${q.content}\u0001${options}\u0001${q.answer}`)
    .digest("hex")
    .slice(0, 36);
  return `pdf:${digest}`;
}

/** 事务执行器：事务内一切读写都必须走它，不能用全局 drizzleDb */
type ConfirmExecutor = typeof drizzleDb;

/**
 * 确认导入的原子写入：题目 + 文件夹关联 + 错题本日志。
 *
 * 只插入本次真正新增的题目（已存在的按 skipped 计数并跳过），因此重复确认不会
 * 产生重复行。所有语句都用传入的 `exec`：若在事务内混用全局 `drizzleDb`，
 * 语句会跑在事务连接之外，表现为逐条失败 + 提交时 SQLITE_BUSY。
 */
async function writeConfirm(
  exec: ConfirmExecutor,
  userId: number,
  questionsToImport: ParsedPdfQuestion[],
  folderId: number | undefined,
  addToWrongBook: boolean,
): Promise<{ insertedIds: number[]; skippedCount: number }> {
  // 1. 生成幂等键并做批内去重（同一批里出现两道完全相同的题，只落一条）
  const pending = new Map<string, ParsedPdfQuestion>();
  let skippedCount = 0;
  for (const q of questionsToImport) {
    const externalId = buildPdfExternalId(q);
    if (pending.has(externalId)) {
      skippedCount += 1;
      continue;
    }
    pending.set(externalId, q);
  }

  // 2. 查出已存在的键，只插入新增的（这样才能区分"新增"与"已存在"）
  const candidateIds = [...pending.keys()];
  const existingRows =
    candidateIds.length > 0
      ? await exec
          .select({ external_id: questions.external_id })
          .from(questions)
          .where(inArray(questions.external_id, candidateIds))
      : [];
  const existingIds = new Set(
    existingRows
      .map((row) => row.external_id)
      .filter((v): v is string => typeof v === "string"),
  );
  skippedCount += existingIds.size;

  const toInsert = [...pending.entries()].filter(
    ([externalId]) => !existingIds.has(externalId),
  );
  if (toInsert.length === 0) return { insertedIds: [], skippedCount };

  // 3. 插入新增题目。onConflictDoNothing 兜住"预检后另一个请求先提交"的并发窗口：
  //    此时 returning 为空，按跳过计数，不会因唯一索引整批失败。
  const insertedIds: number[] = [];
  for (const [externalId, q] of toInsert) {
    const result = await exec
      .insert(questions)
      .values({
        external_id: externalId,
        content: q.content,
        options: JSON.stringify(q.options),
        answer: q.answer,
        explanation: q.explanation,
        tags: JSON.stringify(q.tags),
        type:
          q.type === "multi"
            ? "multi"
            : q.type === "truefalse"
              ? "truefalse"
              : "single",
        source: "pdf_import",
      })
      .onConflictDoNothing({ target: questions.external_id })
      .returning({ id: questions.id });

    if (result.length > 0) {
      insertedIds.push(result[0].id);
    } else {
      skippedCount += 1;
    }
  }

  if (insertedIds.length === 0) return { insertedIds, skippedCount };

  // 4. 文件夹关联：直接写关联表（INSERT OR IGNORE 语义），不调 questionFolderService
  //    —— 后者内部用全局 drizzleDb，在事务里会踩同一个连接。
  if (folderId) {
    // 保持 addQuestions 的既有语义：文件夹不属于该用户时静默跳过关联
    const folder = await exec
      .select({ id: question_folders.id })
      .from(question_folders)
      .where(
        and(
          eq(question_folders.id, folderId),
          eq(question_folders.user_id, userId),
        ),
      )
      .limit(1);

    if (folder.length > 0) {
      await exec
        .insert(question_folder_items)
        .values(
          insertedIds.map((questionId) => ({
            folder_id: folderId,
            question_id: questionId,
          })),
        )
        .onConflictDoNothing();
    }
  }

  // 5. 加入错题本：与题目写入同一事务，避免"题目进来了、错题本没有"的半截状态
  if (addToWrongBook) {
    await exec.insert(practice_logs).values(
      insertedIds.map((questionId) => ({
        user_id: userId,
        question_id: questionId,
        user_answer: "",
        is_correct: false,
        duration_ms: 0,
      })),
    );
  }

  return { insertedIds, skippedCount };
}

export const pdfImportService = {
  /**
   * 步骤 1a：OCR + 分块，缓存结果，返回 taskId 和块数
   */
  async ocrAndSplit(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    onProgress?: (stage: string, detail: string) => void,
  ): Promise<{ taskId: string; totalChunks: number }> {
    onProgress?.("ocr", "正在 OCR 识别...");
    const ocrText = await performPaddleOCR(fileBuffer, fileName, mimeType);

    if (!ocrText || ocrText.trim().length < 10) {
      throw new Error("OCR 识别结果为空，请检查 PDF 文件");
    }

    const cleaned = cleanOcrText(ocrText);
    const chunks = splitIntoQuestionChunks(cleaned);

    if (chunks.length === 0) {
      throw new Error("未能从 PDF 中分割出题目");
    }

    const taskId = randomUUID();
    chunkCache.set(taskId, {
      chunks,
      ocrText: cleaned,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return { taskId, totalChunks: chunks.length };
  },

  /**
   * 步骤 1a-alt：手动文本 → 分块，缓存结果，返回 taskId 和块数（跳过 OCR）
   */
  async splitText(
    text: string,
  ): Promise<{ taskId: string; totalChunks: number }> {
    if (!text || text.trim().length < 20) {
      throw new Error("文本内容过短，无法识别题目");
    }

    const cleaned = cleanOcrText(text);
    const chunks = splitIntoQuestionChunks(cleaned);

    if (chunks.length === 0) {
      throw new Error("未能从文本中分割出题目");
    }

    const taskId = randomUUID();
    chunkCache.set(taskId, {
      chunks,
      ocrText: cleaned,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return { taskId, totalChunks: chunks.length };
  },

  /**
   * 步骤 1b：解析单个块（由前端并发调用）
   */
  async parseSingleChunk(
    taskId: string,
    chunkIndex: number,
  ): Promise<{
    questions: ParsedPdfQuestion[];
    chunkIndex: number;
    warnings: string[];
  }> {
    const cached = chunkCache.get(taskId);
    if (!cached) {
      throw new Error("任务不存在或已过期，请重新上传");
    }
    if (chunkIndex < 0 || chunkIndex >= cached.chunks.length) {
      throw new Error(
        `块索引 ${chunkIndex} 超出范围 (0-${cached.chunks.length - 1})`,
      );
    }

    const chunkText = cached.chunks[chunkIndex];

    try {
      const questions = await parseSingleChunkRaw(chunkText);
      return { questions, chunkIndex, warnings: [] };
    } catch (err) {
      const msg = `第 ${chunkIndex + 1} 块解析失败: ${err instanceof Error ? err.message : String(err)}`;
      log.error("[PdfImport]", msg);
      // 显式降级：单块失败以空结果 + warning 返回，由上层汇总后提示用户
      return { questions: [], chunkIndex, warnings: [msg] };
    }
  },

  /**
   * 步骤 1c：清理缓存（解析全部完成后调用）
   */
  cleanup(taskId: string) {
    chunkCache.delete(taskId);
  },

  /**
   * 步骤 2：确认导入，写入 questions 表 + 文件夹关联
   */
  async confirmImport(
    userId: number,
    questionsToImport: ParsedPdfQuestion[],
    folderId?: number,
    addToWrongBook: boolean = true,
  ): Promise<PdfImportResult> {
    if (questionsToImport.length === 0) {
      return {
        success: false,
        importedCount: 0,
        skippedCount: 0,
        message: "没有要导入的题目",
      };
    }

    try {
      // 题目 + 文件夹关联 + 错题本日志整体一个事务：任一步失败全回滚。
      // 旧实现逐条 insert 后再做关联/日志，后置步骤失败时题目已经落库，用户
      // 重试就会造出重复题目（本项目评审指出的数据正确性缺口）。
      const { insertedIds, skippedCount } = await withConfirmLock(() =>
        drizzleDb.transaction(async (tx) => {
          // 事务内所有写操作都必须走 tx，用全局 drizzleDb 会报 SQLITE_BUSY
          const exec = tx as unknown as typeof drizzleDb;
          return writeConfirm(
            exec,
            userId,
            questionsToImport,
            folderId,
            addToWrongBook,
          );
        }),
      );

      // FSRS 复习卡放在事务提交之后：它可重入（重复调用按同一题覆盖更新），
      // 失败也只是"复习队列里少一条"，下次同步/补跑即可修复。
      // 放进事务会让一条 SRS 写入失败连带回滚已导入的题目 —— 代价远大于收益。
      if (addToWrongBook && insertedIds.length > 0) {
        await Promise.all(
          insertedIds.map(async (questionId) => {
            try {
              await srsService.updateQuestionSrs(
                userId,
                questionId,
                false,
                0,
                undefined,
                undefined,
                0,
              );
            } catch (srsError) {
              // 显式降级：SRS 卡是旁路副作用，本题跳过写入，不影响导入结果
              log.error(
                `[PdfImport] SRS 卡片写入失败（题目 ${questionId}，可重入补跑）:`,
                srsError,
              );
              return;
            }
          }),
        );
      }

      const wrongBookNote = addToWrongBook ? "，已加入错题本和复习队列" : "";
      const skippedNote =
        skippedCount > 0 ? `（${skippedCount} 道已存在，已跳过）` : "";
      return {
        success: true,
        importedCount: insertedIds.length,
        skippedCount,
        message: `成功导入 ${insertedIds.length} 道题目${folderId ? "到文件夹" : ""}${skippedNote}${wrongBookNote}`,
      };
    } catch (error) {
      log.error("[PdfImport] confirmImport failed:", error);
      return {
        success: false,
        importedCount: 0,
        skippedCount: 0,
        message: `导入失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
};
