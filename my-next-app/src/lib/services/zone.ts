import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, sql } from 'drizzle-orm';

/**
 * 观察区相关业务逻辑
 */
export const zoneService = {
  /**
   * 将指定标签移入观察区并重置掌握度
   */
  async moveToObservationZone(userId: number, tagName: string, reason: string) {
    // 1. 插入或更新观察区记录 (LibSQL 异步操作)
    await drizzleDb.insert(drizzleSchema.observation_zone).values({
      user_id: userId,
      tag_name: tagName,
      reason: reason,
      status: 'active'
    }).onConflictDoUpdate({
      target: [drizzleSchema.observation_zone.user_id, drizzleSchema.observation_zone.tag_name],
      set: {
        reason: reason,
        entered_at: sql`CURRENT_TIMESTAMP`,
        status: 'active'
      }
    });

    // 2. 重置掌握度为 15% (警戒水位)
    await drizzleDb.update(drizzleSchema.user_mastery)
      .set({ 
        score: 15, 
        last_updated: sql`CURRENT_TIMESTAMP` 
      })
      .where(and(
        eq(drizzleSchema.user_mastery.user_id, userId),
        eq(drizzleSchema.user_mastery.tag_name, tagName)
      ));
  }
};
