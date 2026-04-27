'use server';

import logger from '@/lib/logger';
import { requireUser } from '@/lib/auth/auth';
import { practiceService, type PracticeSessionConfig } from '@/lib/services/practice';
import { KnowledgeTreeService, type KnowledgeNode } from '@/lib/services/knowledge-tree';

/**
 * 获取或恢复练习会话
 */
export async function getPracticeSessionAction(forceNew: boolean = false) {
  try {
    const user = await requireUser();
    return await practiceService.getOrCreateSession(user.id, forceNew);
  } catch (error) {
    logger.error({ err: error }, '[PracticeAction] 获取练习会话失败');
    throw new Error('无法创建练习会话，请稍后重试。');
  }
}

/**
 * 提交题目答案
 */
export async function submitAnswerAction(
  questionId: number, 
  userAnswer: string, 
  isCorrect: boolean, 
  duration: number, 
  sessionId?: string,
  totalDurationMs?: number
) {
  try {
    const user = await requireUser();
    return await practiceService.submitAnswer(
        user.id, 
        sessionId || null, 
        questionId, 
        userAnswer, 
        isCorrect, 
        duration,
        totalDurationMs
    );
  } catch (e) {
    logger.error({ err: e }, "[PracticeAction] 提交答案失败");
    return { success: false };
  }
}

/**
 * 获取知识体系树
 */
export async function getKnowledgeTreeAction(): Promise<KnowledgeNode[]> {
  try {
    const rawTags = await KnowledgeTreeService.getAggregatedTags();
    return KnowledgeTreeService.buildKnowledgeTree(rawTags);
  } catch (error) {
    logger.error({ err: error }, '[PracticeAction] 构建知识树失败');
    return [];
  }
}

/**
 * 根据自定义配置创建会话
 */
export async function getPracticeSessionByConfigAction(config: PracticeSessionConfig) {
  try {
    const user = await requireUser();
    return await practiceService.createSessionFromConfig(user.id, config);
  } catch (error) {
    logger.error({ err: error }, '[PracticeAction] 创建配置化练习失败');
    throw new Error('无法创建配置练习会话，请稍后重试。');
  }
}

/**
 * 以后台 ID 获取完整会话内容
 */
export async function getSessionByIdAction(sessionId: string) {
  try {
    const user = await requireUser();
    return await practiceService.getSessionById(user.id, sessionId);
  } catch (error) {
    logger.error({ err: error }, '[PracticeAction] 获取会话详情失败');
    return null;
  }
}

/**
 * 保存会话回顾信息
 */
export async function saveSessionReviewAction(sessionId: string, questionId: number, reviewData: Record<string, unknown>) {
  try {
    const user = await requireUser();
    return await practiceService.saveSessionReview(user.id, sessionId, questionId, reviewData);
  } catch (e) {
    logger.error({ err: e }, "[PracticeAction] 保存回顾信息失败");
    return { success: false };
  }
}

/**
 * 获取可用标签列表
 */
export async function getAvailableTagsAction(): Promise<string[]> {
  try {
    return await practiceService.getAvailableTags();
  } catch (error) {
    logger.error({ err: error }, '[PracticeAction] 获取可用标签失败');
    return [];
  }
}
