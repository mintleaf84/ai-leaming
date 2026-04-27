'use server';

import logger from '@/lib/logger';
import { requireUser } from '@/lib/auth/auth';
import { revalidatePath } from 'next/cache';
import { 
    historyService, 
    type HistoryFilter, 
    type PaginatedHistory, 
    type SessionHistoryItem 
} from '@/lib/services/history';

/**
 * 导出类型供外部使用
 */
export type { HistoryFilter, SessionHistoryItem, PaginatedHistory };

/**
 * 会话详情类型
 */
export type SessionDetail = NonNullable<Awaited<ReturnType<typeof historyService.getSessionDetail>>>;

/**
 * 获取练习历史记录
 */
export async function getSessionHistoryAction(filter?: HistoryFilter): Promise<PaginatedHistory> {
  try {
    const user = await requireUser();
    return await historyService.getHistory(user.id, filter);
  } catch (error) {
    logger.error({ err: error }, "[HistoryAction] 获取练习历史失败");
    return { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
  }
}

/**
 * 获取可用的练习模式列表
 */
export async function getAvailableModesAction(): Promise<string[]> {
  try {
    const user = await requireUser();
    return await historyService.getAvailableModes(user.id);
  } catch (error) {
    logger.error({ err: error }, "[HistoryAction] 获取模式列表失败");
    return [];
  }
}

/**
 * 获取会话详情
 */
export async function getSessionDetailAction(sessionId: string) {
  try {
    const user = await requireUser();
    return await historyService.getSessionDetail(user.id, sessionId);
  } catch (error) {
    logger.error({ err: error }, "[HistoryAction] 获取会话详情失败");
    return null;
  }
}

/**
 * 删除练习会话
 */
export async function deleteSessionAction(sessionId: string) {
  try {
    const user = await requireUser();
    const success = await historyService.deleteSession(user.id, sessionId);

    if (success) {
      revalidatePath('/history');
    }
    return { success };
  } catch (error) {
    logger.error({ err: error }, "[HistoryAction] 删除失败");
    return { success: false, message: "删除失败，请稍后重试" };
  }
}

/**
 * 重命名练习会话
 */
export async function renameSessionAction(sessionId: string, newName: string) {
  try {
    const user = await requireUser();
    const success = await historyService.renameSession(user.id, sessionId, newName);

    if (success) {
      revalidatePath('/history');
    }
    return { success };
  } catch (error) {
    logger.error({ err: error }, "[HistoryAction] 重命名失败");
    return { success: false, message: "重命名失败，请稍后重试" };
  }
}

/**
 * 导出练习会话为 Markdown 格式
 */
export async function exportSessionMarkdownAction(sessionId: string) {
  try {
    const user = await requireUser();
    
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
  } catch (error) {
    logger.error({ err: error }, "[HistoryAction] 导出失败");
    return { success: false, error: "导出失败，请稍后重试" };
  }
}
