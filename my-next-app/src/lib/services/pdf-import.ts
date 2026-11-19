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
  pdf_import_tasks,
  practice_logs,
  question_folder_items,
  question_folders,
  questions,
} from "@/lib/db/drizzle-schema";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { srsService } from "@/lib/services/srs";
import type { PdfImportResult, ParsedPdfQuestion } from "@/types/pdf-import";
import { randomUUID } from "crypto";
import {
  contentHash,
  findQuestionIdByContent,
} from "@/lib/services/question-dedup";
import { buildPdfExternalId } from "@/lib/services/question-idempotency";
import { log } from "@/lib/logger";
import { safeParseJson } from "@/lib/utils/json";
import { withTransaction } from "@/lib/db/executor";
import { AppError, NotFoundError } from "@/lib/errors/app-error";

/**
 * 任务态存 `pdf_import_tasks` 表（不再放进程内存）。
 *
 * 为什么落库：任务态只在内存里时，"提交"与"逐块解析/轮询"落到不同实例就查不到，
 * 重启还会丢正在进行的导入 —— 这是多实例部署的硬障碍之一。落库后任务跨请求、
 * 跨实例、跨重启可见。
 *
 * **归属校验必须在 SQL 的 where 里**：taskId 虽然是不易猜的 UUID，但没有归属条件就是
 * IDOR —— 拿到 taskId 的任何登录用户都能读走别人 PDF 的 OCR 文本、或删掉别人的任务。
 */

/**
 * 任务不存在、或存在但不属于当前用户 —— **两种情况合并成同一个错误**。
 * 如果「不属于你」返回 403、「不存在」返回 404，就等于给攻击者一个探测
 * taskId 是否存在的接口。
 */
export class PdfImportTaskNotFoundError extends NotFoundError {
  constructor() {
    super("任务不存在或已过期，请重新上传", {
      code: "pdf-import.task.not-found",
    });
    this.name = "PdfImportTaskNotFoundError";
  }
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 分钟

interface OwnedTask {
  userId: number;
  chunks: string[];
}

/**
 * 任务落库失败：对外只暴露"请重试"，不携带 SQL 与绑定参数（见 saveTask 的说明）。
 */
export class PdfImportStorageError extends AppError {
  constructor() {
    super("business", "任务保存失败，请重试", {
      code: "pdf-import.task.storage-failed",
    });
    this.name = "PdfImportStorageError";
  }
}

/** 按 taskId + 归属 + 未过期取任务；任一不满足都当成"不存在或已过期" */
async function requireOwnedTask(
  userId: number,
  taskId: string,
): Promise<OwnedTask> {
  // 只取需要的列：逐块解析会被调用 N 次，把整段 OCR 原文（可能几百 KB）读出来
  // 只为抛弃它是纯浪费；ocrText 由需要它的调用方另取
  const [row] = await drizzleDb
    .select({
      user_id: pdf_import_tasks.user_id,
      chunks_json: pdf_import_tasks.chunks_json,
    })
    .from(pdf_import_tasks)
    .where(
      and(
        eq(pdf_import_tasks.id, taskId),
        eq(pdf_import_tasks.user_id, userId),
        gt(pdf_import_tasks.expires_at, Date.now()),
      ),
    )
    .limit(1);

  if (!row) {
    // 顺手回收本用户的过期行：只靠"下次写入时清理"的话，长期不再导入的用户
    // 那些过期 OCR 文本会无限期留在库里（评审指出过）。失败不影响本次读取
    void drizzleDb
      .delete(pdf_import_tasks)
      .where(
        and(
          eq(pdf_import_tasks.user_id, userId),
          lt(pdf_import_tasks.expires_at, Date.now()),
        ),
      )
      .catch((err: unknown) => {
        log.warn("[PdfImport] 过期任务回收失败（不影响本次读取）", err);
      });
    throw new PdfImportTaskNotFoundError();
  }

  const parsed = safeParseJson<unknown>(row.chunks_json, []);
  // safeParseJson 只保证"能解析"，不保证形状：null / 数字 / 混合数组都会在后面
  // 的 chunks.length 上炸。坏行与过期行同样处理——当作不存在，让用户重传
  // 不能 filter：`["第1块", 42, "第3块"]` 过滤后会变成两块，客户端按索引 1 取到的
  // 其实是第 3 块（静默错位）。整批不合格就整批作废，让用户重传
  const chunks =
    Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? (parsed as string[])
      : [];
  if (chunks.length === 0) {
    throw new PdfImportTaskNotFoundError();
  }

  return { userId: row.user_id, chunks };
}

/**
 * 落任务 + 机会式清理过期行。
 *
 * 不用 setInterval：多实例下每个实例都会跑一遍清理，反而更贵；而"写入时顺手删
 * 过期行"是 O(索引扫描) 且只在真正的写路径上发生。
 */
async function saveTask(
  userId: number,
  chunks: string[],
  ocrText: string,
): Promise<string> {
  const taskId = randomUUID();
  const now = Date.now();

  // 插入与过期清理放同一事务：否则清理失败会把"已经写成功"的任务报成失败，
  // 调用方拿不到 taskId，而那行数据又确实在库里（评审指出过）
  try {
    await withTransaction(async (exec) => {
      await exec.insert(pdf_import_tasks).values({
        id: taskId,
        user_id: userId,
        ocr_text: ocrText,
        chunks_json: JSON.stringify(chunks),
        expires_at: now + CACHE_TTL_MS,
        created_at: sql`CURRENT_TIMESTAMP`,
      });

      await exec
        .delete(pdf_import_tasks)
        .where(lt(pdf_import_tasks.expires_at, now));
    });
  } catch (err) {
    // Drizzle 0.45 的异常 message 里带 SQL 与**绑定参数**——这张表的参数就是 OCR 原文。
    // 直接抛出会把它写进日志、并经路由的 `(e as Error).message` 返回给客户端。
    // 这里只记结构化字段（不含 message），对外抛不带细节的领域错误
    log.error("[PdfImport] 任务落库失败（已隐去 SQL 与绑定参数）", {
      userId,
      errorName: err instanceof Error ? err.name : typeof err,
    });
    throw new PdfImportStorageError();
  }

  return taskId;
}

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
 * PDF 导入的确定性幂等键（`pdf:` + 内容指纹）。
 *
 * 实现在 `question-idempotency.ts`：管理端手工导入用的是同一份指纹函数、不同的
 * 前缀（`admin:`），见该文件顶部关于字段组合的取舍说明。这里保留同名导出，
 * 供既有调用方与测试继续使用。
 */
export { buildPdfExternalId };

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
): Promise<{
  insertedIds: number[];
  resolvedIds: number[];
  skippedCount: number;
}> {
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
  if (toInsert.length === 0)
    return { insertedIds: [], resolvedIds: [], skippedCount };

  // 3. 插入新增题目。onConflictDoNothing 兜住"预检后另一个请求先提交"的并发窗口：
  //    此时 returning 为空，按跳过计数，不会因唯一索引整批失败。
  const insertedIds: number[] = [];
  const reusedIds: number[] = [];
  for (const [externalId, q] of toInsert) {
    // 内容级去重：同题干已存在（external_id 不同或缺失，如神笔/PDF 交叉导入）时复用
    const existingByContent = await findQuestionIdByContent(q.content, exec);
    if (existingByContent) {
      reusedIds.push(existingByContent);
      skippedCount += 1;
      continue;
    }

    const result = await exec
      .insert(questions)
      .values({
        external_id: externalId,
        content_hash: contentHash(q.content),
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

  // 文件夹/错题本要覆盖「本次新增 + 复用已有」两类题目
  const resolvedIds = [...insertedIds, ...reusedIds];
  if (resolvedIds.length === 0)
    return { insertedIds, resolvedIds, skippedCount };

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
          resolvedIds.map((questionId) => ({
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
      resolvedIds.map((questionId) => ({
        user_id: userId,
        question_id: questionId,
        user_answer: "",
        is_correct: false,
        duration_ms: 0,
        origin: "import",
        // 错题本收藏不是「作答」：单独标 wrong_book，不参与统计口径推导
        status: "wrong_book",
      })),
    );
  }

  return { insertedIds, resolvedIds, skippedCount };
}

export const pdfImportService = {
  /**
   * 步骤 1a：OCR + 分块，缓存结果，返回 taskId 和块数
   */
  async ocrAndSplit(
    userId: number,
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

    const taskId = await saveTask(userId, chunks, cleaned);
    return { taskId, totalChunks: chunks.length };
  },

  /**
   * 步骤 1a-alt：手动文本 → 分块，缓存结果，返回 taskId 和块数（跳过 OCR）
   */
  async splitText(
    userId: number,
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

    const taskId = await saveTask(userId, chunks, cleaned);
    return { taskId, totalChunks: chunks.length };
  },

  /**
   * 步骤 1b：解析单个块（由前端并发调用）
   */
  async parseSingleChunk(
    userId: number,
    taskId: string,
    chunkIndex: number,
  ): Promise<{
    questions: ParsedPdfQuestion[];
    chunkIndex: number;
    warnings: string[];
  }> {
    const cached = await requireOwnedTask(userId, taskId);
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
  /**
   * 清理缓存。**只删自己的**：不属于当前用户时返回 `false` 且不删任何东西。
   * 返回值不用来区分「不存在」与「不是你的」（同一个 false，避免探测）。
   */
  async cleanup(userId: number, taskId: string): Promise<boolean> {
    const deleted = await drizzleDb
      .delete(pdf_import_tasks)
      .where(
        and(
          eq(pdf_import_tasks.id, taskId),
          eq(pdf_import_tasks.user_id, userId),
        ),
      )
      .returning({ id: pdf_import_tasks.id });
    return deleted.length > 0;
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
      const { insertedIds, resolvedIds, skippedCount } = await withConfirmLock(
        () =>
          withTransaction(async (exec) =>
            // 事务内所有写操作都必须走 exec，用全局 drizzleDb 会报 SQLITE_BUSY
            writeConfirm(
              exec,
              userId,
              questionsToImport,
              folderId,
              addToWrongBook,
            ),
          ),
      );

      // FSRS 复习卡放在事务提交之后：它可重入（重复调用按同一题覆盖更新），
      // 失败也只是"复习队列里少一条"，下次同步/补跑即可修复。
      // 放进事务会让一条 SRS 写入失败连带回滚已导入的题目 —— 代价远大于收益。
      // 复用已有题也要补复习卡（重入安全）
      if (addToWrongBook && resolvedIds.length > 0) {
        await Promise.all(
          resolvedIds.map(async (questionId) => {
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
