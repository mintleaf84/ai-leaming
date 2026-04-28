'use server';

import { authenticatedAction } from '@/lib/safe-action';
import { z } from 'zod';
import { practiceService } from '@/lib/services/practice';
import { KnowledgeTreeService, type KnowledgeNode } from '@/lib/services/knowledge-tree';
import { PracticeSessionConfigSchema, SubmitAnswerSchema } from '@/lib/validations/practice';

/**
 * 获取或恢复练习会话
 */
export const getPracticeSessionAction = authenticatedAction
  .inputSchema(z.boolean().default(false))
  .action(async ({ parsedInput: forceNew, ctx }) => {
    const { user } = ctx;
    return await practiceService.getOrCreateSession(user.id, forceNew);
  });

/**
 * 提交题目答案
 */
export const submitAnswerAction = authenticatedAction
  .inputSchema(SubmitAnswerSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const { user } = ctx;
    return await practiceService.submitAnswer(
        user.id, 
        input.sessionId || null, 
        input.questionId, 
        input.userAnswer, 
        input.isCorrect, 
        input.duration,
        input.totalDurationMs
    );
  });

/**
 * 获取知识体系树
 */
export const getKnowledgeTreeAction = authenticatedAction
  .action(async () => {
    const rawTags = await KnowledgeTreeService.getAggregatedTags();
    return KnowledgeTreeService.buildKnowledgeTree(rawTags);
  });

/**
 * 根据自定义配置创建会话
 */
export const getPracticeSessionByConfigAction = authenticatedAction
  .inputSchema(PracticeSessionConfigSchema)
  .action(async ({ parsedInput: config, ctx }) => {
    const { user } = ctx;
    return await practiceService.createSessionFromConfig(user.id, config);
  });

/**
 * 以后台 ID 获取完整会话内容
 */
export const getSessionByIdAction = authenticatedAction
  .inputSchema(z.string())
  .action(async ({ parsedInput: sessionId, ctx }) => {
    const { user } = ctx;
    return await practiceService.getSessionById(user.id, sessionId);
  });

/**
 * 保存会话回顾信息
 */
export const saveSessionReviewAction = authenticatedAction
  .inputSchema(z.object({
    sessionId: z.string(),
    questionId: z.number(),
    reviewData: z.record(z.unknown())
  }))
  .action(async ({ parsedInput: { sessionId, questionId, reviewData }, ctx }) => {
    const { user } = ctx;
    return await practiceService.saveSessionReview(user.id, sessionId, questionId, reviewData);
  });

/**
 * 获取可用标签列表
 */
export const getAvailableTagsAction = authenticatedAction
  .action(async () => {
    return await practiceService.getAvailableTags();
  });
