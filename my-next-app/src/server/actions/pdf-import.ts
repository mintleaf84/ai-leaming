'use server';

import { authenticatedAction } from '@/lib/safe-action';
import { pdfImportService } from '@/lib/services/pdf-import';
import { questionFolderService } from '@/lib/services/question-folder';
import { z } from 'zod';
import type { PdfImportPreview, PdfImportResult } from '@/types/pdf-import';

/**
 * 预览 PDF 导入（OCR + AI 解析，不写 DB）
 */
export const previewPdfImportAction = authenticatedAction
  .inputSchema(z.object({
    fileBase64: z.string().min(1, '文件不能为空'),
    fileName: z.string().min(1, '文件名不能为空'),
    mimeType: z.literal('application/pdf'),
  }))
  .action(async ({ parsedInput: input }): Promise<PdfImportPreview> => {
    const { fileBase64, fileName, mimeType } = input;

    const buffer = Buffer.from(fileBase64, 'base64');
    return pdfImportService.parseAndPreview(buffer, fileName, mimeType);
  });

/**
 * 确认导入到数据库
 */
export const confirmPdfImportAction = authenticatedAction
  .inputSchema(z.object({
    questions: z.array(z.object({
      content: z.string(),
      options: z.array(z.string()),
      type: z.enum(['single', 'multi']),
      answer: z.string(),
      explanation: z.string(),
      confidence: z.number(),
      tags: z.array(z.string()),
    })),
    folderId: z.number().optional(),
    addToWrongBook: z.boolean().default(true),
  }))
  .action(async ({ parsedInput: input, ctx }): Promise<PdfImportResult> => {
    const { questions, folderId, addToWrongBook } = input;
    return pdfImportService.confirmImport(ctx.user.id, questions, folderId, addToWrongBook);
  });

/**
 * 获取用户文件夹列表（供导入页面选择）
 */
export const getImportFoldersAction = authenticatedAction
  .action(async ({ ctx }) => {
    return questionFolderService.getFolders(ctx.user.id);
  });
