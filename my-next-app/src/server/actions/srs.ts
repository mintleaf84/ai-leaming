'use server';

import { authenticatedAction } from '@/lib/safe-action';
import { z } from 'zod';
import { Rating, fsrs, generatorParameters } from 'ts-fsrs';
import { srsService, type SrsGlobalStats, type SrsHistoryEntry, type SrsPrediction } from '@/lib/services/srs';

/**
 * 获取全局 SRS 统计数据
 */
export const getSrsGlobalStatsAction = authenticatedAction
  .action(async ({ ctx }): Promise<SrsGlobalStats> => {
    const { user } = ctx;
    return await srsService.getGlobalStats(user.id);
  });

/**
 * 获取单道题目的 SRS 历史记录
 */
export const getQuestionSrsHistoryAction = authenticatedAction
  .inputSchema(z.number())
  .action(async ({ parsedInput: questionId, ctx }): Promise<SrsHistoryEntry[]> => {
    const { user } = ctx;
    const { drizzleDb } = await import('@/lib/db');
    const { practice_logs } = await import('@/lib/db/drizzle-schema');
    const { eq, and } = await import('drizzle-orm');

    const logs = await drizzleDb.select({
        date: practice_logs.timestamp,
        isCorrect: practice_logs.is_correct,
        duration: practice_logs.duration_ms
      })
      .from(practice_logs)
      .where(and(
        eq(practice_logs.user_id, user.id),
        eq(practice_logs.question_id, questionId)
      ))
      .orderBy(practice_logs.timestamp);

    return logs.map(l => ({
      date: l.date || '',
      isCorrect: !!l.isCorrect,
      duration: l.duration || 0,
      rating: l.isCorrect ? 'Good' : 'Again' 
    }));
  });

/**
 * 获取题目复习后的预测（不同评分下的结果）
 */
export const getQuestionSrsPredictionsAction = authenticatedAction
  .inputSchema(z.number())
  .action(async ({ parsedInput: questionId, ctx }): Promise<SrsPrediction[]> => {
    const { user } = ctx;

    const card = await srsService.getOrCreateSrsCard(user.id, questionId);
    const f = fsrs(generatorParameters());
    const now = new Date();
    const schedulingCards = f.repeat(card, now);

    const labels: Record<number, string> = {
        [Rating.Again]: '忘记',
        [Rating.Hard]: '吃力',
        [Rating.Good]: '良好',
        [Rating.Easy]: '简单',
    };

    return [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map(r => {
        const item = (schedulingCards as any)[r].card;
        return {
            rating: r,
            label: labels[r],
            nextDueDate: item.due.toISOString(),
            interval: item.scheduled_days
        };
    });
  });

/**
 * 同步历史练习记录到 SRS (冷启动)
 */
export const syncSrsDataAction = authenticatedAction
  .action(async ({ ctx }) => {
    const { user } = ctx;
    return await srsService.syncFromPracticeLogs(user.id);
  });
