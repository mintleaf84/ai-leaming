'use server';

import { authenticatedAction } from '@/lib/safe-action';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { 
    historyService, 
    type PaginatedHistory, 
} from '@/lib/services/history';
import { HistoryFilterSchema } from '@/lib/validations/history';

/**
 * 获取练习历史记录
 */
export const getSessionHistoryAction = authenticatedAction
  .inputSchema(HistoryFilterSchema.optional())
  .action(async ({ parsedInput: filter, ctx }) => {
    const { user } = ctx;
    return await historyService.getHistory(user.id, filter || {});
  });

/**
 * 获取可用的练习模式列表
 */
export const getAvailableModesAction = authenticatedAction
  .action(async ({ ctx }) => {
    const { user } = ctx;
    return await historyService.getAvailableModes(user.id);
  });

/**
 * 获取会话详情
 */
export const getSessionDetailAction = authenticatedAction
  .inputSchema(z.string())
  .action(async ({ parsedInput: sessionId, ctx }) => {
    const { user } = ctx;
    return await historyService.getSessionDetail(user.id, sessionId);
  });

/**
 * 删除练习会话
 */
export const deleteSessionAction = authenticatedAction
  .inputSchema(z.string())
  .action(async ({ parsedInput: sessionId, ctx }) => {
    const { user } = ctx;
    const success = await historyService.deleteSession(user.id, sessionId);

    if (success) {
      revalidatePath('/history');
    }
    return { success, message: success ? '删除成功' : '删除失败' };
  });

/**
 * 重命名练习会话
 */
export const renameSessionAction = authenticatedAction
  .inputSchema(z.object({
    sessionId: z.string(),
    newName: z.string().min(1)
  }))
  .action(async ({ parsedInput: { sessionId, newName }, ctx }) => {
    const { user } = ctx;
    const success = await historyService.renameSession(user.id, sessionId, newName);

    if (success) {
      revalidatePath('/history');
    }
    return { success, message: success ? '重命名成功' : '重命名失败' };
  });

/**
 * 导出练习会话为 Markdown 格式
 */
export const exportSessionMarkdownAction = authenticatedAction
  .inputSchema(z.string())
  .action(async ({ parsedInput: sessionId, ctx }) => {
    const { user } = ctx;
    
    // 1. 获取会话详情
    const detail = await historyService.getSessionDetail(user.id, sessionId);
    if (!detail) {
      return { success: false, error: "找不到该练习记录" };
    }

    // 2. 动态导入格式化工具
    const { formatSessionToMarkdown, generateExportFilename } = await import('@/lib/utils/export-markdown');

    // 3. 获取 AI 分析报告 (如果存在)
    const analysisReport = await historyService.getAnalysisReport(sessionId);

    // 4. 格式化并返回
    const markdown = formatSessionToMarkdown(detail as any, analysisReport);
    const filename = generateExportFilename(detail.session.createdAt);

    return { success: true, markdown, filename };
  });
