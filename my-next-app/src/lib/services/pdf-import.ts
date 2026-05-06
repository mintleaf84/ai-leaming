/**
 * PDF 错题导入服务
 * 编排 OCR 识别 → AI 解析 → DB 写入 → 文件夹关联
 */

import { performPaddleOCR } from '@/lib/ai/paddle-ocr';
import { parseOcrTextToQuestions } from '@/lib/import/pdf-question-parser';
import { questionFolderService } from './question-folder';
import { drizzleDb } from '@/lib/db';
import { questions } from '@/lib/db/drizzle-schema';
import type { PdfImportPreview, PdfImportResult, ParsedPdfQuestion } from '@/types/pdf-import';

export const pdfImportService = {
  /**
   * 步骤 1：OCR + AI 解析，返回预览数据（不写 DB）
   */
  async parseAndPreview(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    onProgress?: (stage: string, detail: string) => void,
  ): Promise<PdfImportPreview> {
    onProgress?.('ocr', '正在 OCR 识别...');
    const ocrText = await performPaddleOCR(fileBuffer, fileName, mimeType);

    if (!ocrText || ocrText.trim().length < 10) {
      return { totalCount: 0, questions: [], parseWarnings: ['OCR 识别结果为空，请检查 PDF 文件'] };
    }

    onProgress?.('ai_parse', '正在 AI 解析...');
    const result = await parseOcrTextToQuestions(ocrText, (stage, current, total) => {
      onProgress?.(stage, `AI 解析中 (${current}/${total})...`);
    });

    return {
      totalCount: result.questions.length,
      questions: result.questions,
      parseWarnings: result.parseWarnings,
    };
  },

  /**
   * 步骤 2：确认导入，写入 questions 表 + 文件夹关联
   */
  async confirmImport(
    userId: number,
    questionsToImport: ParsedPdfQuestion[],
    folderId?: number,
  ): Promise<PdfImportResult> {
    if (questionsToImport.length === 0) {
      return { success: false, importedCount: 0, message: '没有要导入的题目' };
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
            type: q.type === 'multi' ? 'multi' : 'single',
            source: 'pdf_import',
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

      return {
        success: true,
        importedCount: insertedIds.length,
        message: `成功导入 ${insertedIds.length} 道题目${folderId ? '到文件夹' : ''}`,
      };
    } catch (error) {
      console.error('[PdfImport] confirmImport failed:', error);
      return {
        success: false,
        importedCount: 0,
        message: `导入失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  },
};
