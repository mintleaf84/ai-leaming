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
  validateQuestions,
} from "@/lib/import/pdf-question-parser";
import { questionFolderService } from "./question-folder";
import { drizzleDb } from "@/lib/db";
import { practice_logs, questions } from "@/lib/db/drizzle-schema";
import { srsService } from "@/lib/services/srs";
import type { PdfImportResult, ParsedPdfQuestion } from "@/types/pdf-import";
import { randomUUID } from "crypto";

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
      return { success: false, importedCount: 0, message: "没有要导入的题目" };
    }

    try {
      const insertedIds: number[] = [];

      for (const q of questionsToImport) {
        const result = await drizzleDb
          .insert(questions)
          .values({
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
          .returning({ id: questions.id });

        if (result.length > 0) {
          insertedIds.push(result[0].id);
        }
      }

      // 如果指定了文件夹，关联题目
      if (folderId && insertedIds.length > 0) {
        await questionFolderService.addQuestions(userId, folderId, insertedIds);
      }

      // 加入错题本 + FSRS 复习队列
      if (addToWrongBook && insertedIds.length > 0) {
        const logValues = insertedIds.map((qId) => ({
          user_id: userId,
          question_id: qId,
          user_answer: "",
          is_correct: false,
          duration_ms: 0,
        }));
        await drizzleDb.insert(practice_logs).values(logValues);

        await Promise.all(
          insertedIds.map((qId) =>
            srsService.updateQuestionSrs(
              userId,
              qId,
              false,
              0,
              undefined,
              undefined,
              0,
            ),
          ),
        );
      }

      const wrongBookNote = addToWrongBook ? "，已加入错题本和复习队列" : "";
      return {
        success: true,
        importedCount: insertedIds.length,
        message: `成功导入 ${insertedIds.length} 道题目${folderId ? "到文件夹" : ""}${wrongBookNote}`,
      };
    } catch (error) {
      console.error("[PdfImport] confirmImport failed:", error);
      return {
        success: false,
        importedCount: 0,
        message: `导入失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
};
