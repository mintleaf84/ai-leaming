'use server';

import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/auth';
import { cache } from 'react';
import { State, Rating } from 'ts-fsrs';

export type SrsGlobalStats = {
  totalCards: number;
  stateDistribution: {
    new: number;
    learning: number;
    review: number;
    relearning: number;
  };
  stabilityDistribution: {
    range: string;
    count: number;
  }[];
  difficultyDistribution: {
    range: string;
    count: number;
  }[];
  futureReviews: {
    date: string;
    count: number;
  }[];
  retentionStats: {
    trueRetention: number;
    totalReviews: number;
  };
  readingSpeed: {
    base: number;
    multi: number;
    truefalse: number;
  };
};

/**
 * 获取全局 SRS 统计数据
 */
export const getSrsGlobalStatsAction = cache(async (): Promise<SrsGlobalStats> => {
  const user = await requireUser();

  // 1. 状态分布
  const states = db.prepare(`
    SELECT state, COUNT(*) as count 
    FROM question_srs 
    WHERE user_id = ? 
    GROUP BY state
  `).all(user.id) as { state: number; count: number }[];

  const stateDist = {
    new: states.find(s => s.state === State.New)?.count || 0,
    learning: states.find(s => s.state === State.Learning)?.count || 0,
    review: states.find(s => s.state === State.Review)?.count || 0,
    relearning: states.find(s => s.state === State.Relearning)?.count || 0,
  };

  // 2. 稳定性分布
  // 划分区间: <1d, 1-3d, 3-7d, 7-15d, 15-30d, 30-90d, 90d+
  const stabilityRows = db.prepare(`
    SELECT 
      CASE 
        WHEN stability < 1 THEN '<1d'
        WHEN stability < 3 THEN '1-3d'
        WHEN stability < 7 THEN '3-7d'
        WHEN stability < 15 THEN '7-15d'
        WHEN stability < 30 THEN '15-30d'
        WHEN stability < 90 THEN '30-90d'
        ELSE '90d+' 
      END as range,
      COUNT(*) as count
    FROM question_srs
    WHERE user_id = ?
    GROUP BY range
  `).all(user.id) as { range: string; count: number }[];

  // 3. 难度分布
  const difficultyRows = db.prepare(`
    SELECT 
      CAST(difficulty AS INTEGER) as range,
      COUNT(*) as count
    FROM question_srs
    WHERE user_id = ?
    GROUP BY range
    ORDER BY range ASC
  `).all(user.id) as { range: number; count: number }[];

  // 4. 未来 7 天复习计划
  const futureRows = db.prepare(`
    SELECT 
      date(due_date) as date,
      COUNT(*) as count
    FROM question_srs
    WHERE user_id = ? AND date(due_date) >= date('now')
    GROUP BY date
    ORDER BY date ASC
    LIMIT 7
  `).all(user.id) as { date: string; count: number }[];

  // 5. 真实保留率 (最近 30 天)
  const retentionRow = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
    FROM practice_logs
    WHERE user_id = ? AND timestamp > datetime('now', '-30 days')
  `).get(user.id) as { total: number; correct: number };

  // 6. 个体阅读速度
  const speedSettings = db.prepare(`
    SELECT key, value 
    FROM system_settings 
    WHERE user_id = ? AND key LIKE 'reading_speed_%'
  `).all(user.id) as { key: string; value: string }[];

  const readingSpeed = {
    base: parseFloat(speedSettings.find(s => s.key === 'reading_speed_base')?.value || '7.0'),
    multi: parseFloat(speedSettings.find(s => s.key === 'reading_speed_multi')?.value || '7.0'),
    truefalse: parseFloat(speedSettings.find(s => s.key === 'reading_speed_truefalse')?.value || '7.0'),
  };

  return {
    totalCards: Object.values(stateDist).reduce((a, b) => a + b, 0),
    stateDistribution: stateDist,
    stabilityDistribution: [
      { range: '<1d', count: stabilityRows.find(r => r.range === '<1d')?.count || 0 },
      { range: '1-3d', count: stabilityRows.find(r => r.range === '1-3d')?.count || 0 },
      { range: '3-7d', count: stabilityRows.find(r => r.range === '3-7d')?.count || 0 },
      { range: '7-15d', count: stabilityRows.find(r => r.range === '7-15d')?.count || 0 },
      { range: '15-30d', count: stabilityRows.find(r => r.range === '15-30d')?.count || 0 },
      { range: '30-90d', count: stabilityRows.find(r => r.range === '30-90d')?.count || 0 },
      { range: '90d+', count: stabilityRows.find(r => r.range === '90d+')?.count || 0 },
    ],
    difficultyDistribution: difficultyRows.map(r => ({ range: r.range.toString(), count: r.count })),
    futureReviews: futureRows,
    retentionStats: {
      trueRetention: retentionRow.total > 0 ? (retentionRow.correct / retentionRow.total) * 100 : 100,
      totalReviews: retentionRow.total
    },
    readingSpeed
  };
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

  const logs = db.prepare(`
    SELECT timestamp as date, is_correct as isCorrect, duration_ms as duration
    FROM practice_logs
    WHERE user_id = ? AND question_id = ?
    ORDER BY timestamp ASC
  `).all(user.id, questionId) as { date: string; isCorrect: number; duration: number }[];

  return logs.map(l => ({
    date: l.date,
    isCorrect: !!l.isCorrect,
    duration: l.duration,
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
    const { srsService } = await import('@/lib/services/srs');
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
