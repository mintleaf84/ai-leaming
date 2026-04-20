'use server';
import logger from '@/lib/logger';

import db from '@/lib/db';
import { calculateCultivation } from '@/lib/cultivation/engine';
import { _CultivationState, LeaderboardEntry } from '@/lib/cultivation/types';

/**
 * 获取封神榜数据 (前 20 名)
 */
export async function getLeaderboardAction(): Promise<LeaderboardEntry[]> {
  try {
    // 聚合统计全员数据
    // 注意：SQLite 的聚合查询
    const rows = db.prepare(`
      SELECT 
        u.id, 
        u.username, 
        COUNT(DISTINCT p.id) as total_practiced,
        (SELECT AVG(score) FROM user_mastery WHERE user_id = u.id) as avg_mastery
      FROM users u
      LEFT JOIN practice_logs p ON u.id = p.user_id
      GROUP BY u.id
      ORDER BY total_practiced DESC
      LIMIT 20
    `).all() as { id: number; username: string; total_practiced: number; avg_mastery: number | null }[];

    // 映射境界数据
    const leaderboard = rows.map(row => {
      const mastery = Math.round(row.avg_mastery || 0);
      return {
        userId: row.id,
        username: row.username,
        totalPracticed: row.total_practiced,
        averageMastery: mastery,
        cultivation: calculateCultivation(row.total_practiced, mastery)
      };
    });

    return leaderboard;
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch leaderboard');
    return [];
  }
}
