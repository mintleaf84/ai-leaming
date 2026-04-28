'use server';

import { authenticatedAction } from '@/lib/safe-action';
import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { BackupData } from '@/types/data';

/**
 * 备份数据的 Zod Schema
 */
const BackupDataSchema = z.object({
  version: z.number(),
  timestamp: z.string(),
  user_mastery: z.array(z.object({
    tag_name: z.string(),
    score: z.number(),
    history: z.string(),
    last_updated: z.string(),
  })),
  practice_logs: z.array(z.object({
    session_id: z.string(),
    question_id: z.number(),
    user_answer: z.string(),
    is_correct: z.number(),
    is_monitored_correct: z.number(),
    duration_ms: z.number(),
    timestamp: z.string(),
  })),
  observation_zone: z.array(z.object({
    tag_name: z.string(),
    reason: z.string(),
    entered_at: z.string(),
    status: z.enum(['active', 'recovering', 'graduated']),
  })),
});

/**
 * 导出用户数据
 */
export const exportUserDataAction = authenticatedAction
  .action(async ({ ctx }) => {
    const { user } = ctx;
    const userId = Number(user.id);

    const masteryRows = await drizzleDb.select().from(drizzleSchema.user_mastery).where(eq(drizzleSchema.user_mastery.user_id, userId));
    const logRows = await drizzleDb.select().from(drizzleSchema.practice_logs).where(eq(drizzleSchema.practice_logs.user_id, userId));
    const obsRows = await drizzleDb.select().from(drizzleSchema.observation_zone).where(eq(drizzleSchema.observation_zone.user_id, userId));

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      user_mastery: masteryRows.map(r => ({
          tag_name: r.tag_name,
          score: r.score || 0,
          history: r.history || '',
          last_updated: r.last_updated || ''
      })),
      practice_logs: logRows.map(r => ({
          session_id: r.session_id || '',
          question_id: r.question_id,
          user_answer: r.user_answer || '',
          is_correct: r.is_correct ? 1 : 0,
          is_monitored_correct: r.is_monitored_correct ? 1 : 0,
          duration_ms: r.duration_ms || 0,
          timestamp: r.timestamp || ''
      })),
      observation_zone: obsRows.map(r => ({
          tag_name: r.tag_name,
          reason: r.reason || '',
          entered_at: r.entered_at || '',
          status: r.status as 'active' | 'recovering' | 'graduated'
      }))
    } as BackupData;
  });

/**
 * 导入用户数据
 */
export const importUserDataAction = authenticatedAction
  .inputSchema(BackupDataSchema)
  .action(async ({ parsedInput: data, ctx }) => {
    if (data.version !== 1) {
      throw new Error("备份版本不匹配，目前仅支持版本 1");
    }

    const { user } = ctx;
    const userId = Number(user.id);

    await drizzleDb.transaction(async (tx) => {
      // 1. 清理现有数据
      await tx.delete(drizzleSchema.user_mastery).where(eq(drizzleSchema.user_mastery.user_id, userId));
      await tx.delete(drizzleSchema.practice_logs).where(eq(drizzleSchema.practice_logs.user_id, userId));
      await tx.delete(drizzleSchema.observation_zone).where(eq(drizzleSchema.observation_zone.user_id, userId));

      // 2. 插入 User Mastery
      if (data.user_mastery.length > 0) {
        await tx.insert(drizzleSchema.user_mastery).values(
          data.user_mastery.map((row: { tag_name: string; score: number; history: string; last_updated: string }) => ({
            user_id: userId,
            tag_name: row.tag_name,
            score: row.score,
            history: row.history,
            last_updated: row.last_updated
          }))
        );
      }

      // 3. 插入 Practice Logs
      if (data.practice_logs.length > 0) {
        await tx.insert(drizzleSchema.practice_logs).values(
          data.practice_logs.map((row: { session_id: string; question_id: number; user_answer: string; is_correct: number; is_monitored_correct: number; duration_ms: number; timestamp: string }) => ({
            user_id: userId,
            session_id: row.session_id,
            question_id: row.question_id,
            user_answer: row.user_answer,
            is_correct: Boolean(row.is_correct),
            is_monitored_correct: Boolean(row.is_monitored_correct),
            duration_ms: row.duration_ms,
            timestamp: row.timestamp
          }))
        );
      }

      // 4. 插入 Observation Zone
      if (data.observation_zone.length > 0) {
        await tx.insert(drizzleSchema.observation_zone).values(
          data.observation_zone.map((row: { tag_name: string; reason: string; entered_at: string; status: string }) => ({
            user_id: userId,
            tag_name: row.tag_name,
            reason: row.reason,
            entered_at: row.entered_at,
            status: row.status as 'active' | 'recovering' | 'graduated'
          }))
        );
      }
    });

    return { success: true, message: "数据导入成功" };
  });
