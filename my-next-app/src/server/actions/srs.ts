'use server';

import { requireUser } from '@/lib/auth/auth';
import { cache } from 'react';
import { Rating } from 'ts-fsrs';
import { srsService, type SrsGlobalStats } from '@/lib/services/srs';

/**
 * 获取全局 SRS 统计数据
 */
export const getSrsGlobalStatsAction = cache(async (): Promise<SrsGlobalStats> => {
  const user = await requireUser();
  return await srsService.getGlobalStats(user.id);
});

export type SrsHistoryEntry = {
  date: string;
  rating: string;
  duration: number;
  isCorrect: boolean;
};

/**
 * 获取单道题目的 SRS 历史记录
 */
export const getQuestionSrsHistoryAction = async (questionId: number): Promise<SrsHistoryEntry[]> => {
  const user = await requireUser();
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
};

export type SrsPrediction = {
  rating: Rating;
  label: string;
  nextDueDate: string;
  interval: number;
};

/**
 * 获取题目复习后的预测（不同评分下的结果）
 */
export const getQuestionSrsPredictionsAction = async (questionId: number): Promise<SrsPrediction[]> => {
    const user = await requireUser();
    const { fsrs, generatorParameters } = await import('ts-fsrs');

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
};

/**
 * 同步历史练习记录到 SRS (冷启动)
 */
export const syncSrsDataAction = async () => {
  const user = await requireUser();
  return await srsService.syncFromPracticeLogs(user.id);
};
