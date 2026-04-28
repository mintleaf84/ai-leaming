'use server';
import logger from '@/lib/logger';
import { drizzleDb, drizzleSchema } from '@/lib/db';
import { calculateCultivation } from '@/lib/cultivation/engine';
import { LeaderboardEntry } from '@/lib/cultivation/types';
import { eq, sql, desc, countDistinct } from 'drizzle-orm';

/**
 * 获取封神榜数据 (前 20 名)
 */
export async function getLeaderboardAction(): Promise<LeaderboardEntry[]> {
  try {
    const { users, practice_logs, user_mastery } = drizzleSchema;

    const rows = await drizzleDb.select({
        id: users.id,
        username: users.username,
        total_practiced: countDistinct(practice_logs.id),
        avg_mastery: sql<number>`(SELECT AVG(score) FROM ${user_mastery} WHERE user_id = ${users.id})`
    })
    .from(users)
    .leftJoin(practice_logs, eq(users.id, practice_logs.user_id))
    .groupBy(users.id)
    .orderBy(desc(sql`total_practiced`))
    .limit(20)
    .all();

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
