"use server";

import { authenticatedAction } from "@/lib/safe-action";
import { pdfImportService } from "@/lib/services/pdf-import";
import { questionFolderService } from "@/lib/services/question-folder";
import { z } from "zod";
import type { PdfImportResult } from "@/types/pdf-import";

/**
 * 确认导入到数据库
 */
export const confirmPdfImportAction = authenticatedAction
  .inputSchema(
    z.object({
      questions: z.array(
        z.object({
          content: z.string(),
          options: z.array(z.string()),
          type: z.enum(["single", "multi", "truefalse"]),
          answer: z.string(),
          explanation: z.string(),
          confidence: z.number(),
          tags: z.array(z.string()),
        }),
      ),
      folderId: z.number().optional(),
      addToWrongBook: z.boolean().default(true),
    }),
  )
  .action(async ({ parsedInput: input, ctx }): Promise<PdfImportResult> => {
    const { questions, folderId, addToWrongBook } = input;
    return pdfImportService.confirmImport(
      ctx.user.id,
      questions,
      folderId,
      addToWrongBook,
    );
  });

/**
 * 获取用户文件夹列表（供导入页面选择）
 */
export const getImportFoldersAction = authenticatedAction.action(
  async ({ ctx }) => {
    return questionFolderService.getFolders(ctx.user.id);
  },
);
