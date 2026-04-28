'use server';
import logger from '@/lib/logger';
import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { requireUser } from '@/lib/auth/auth';

// --- Types ---

/** user_mastery 表行 */
interface UserMasteryRow {
    tag_name: string;
    score: number;
    history: string;
    last_updated: string;
}

/** practice_logs 表行（备份相关字段） */
interface PracticeLogBackupRow {
    session_id: string;
    question_id: number;
    user_answer: string;
    is_correct: number;
    is_monitored_correct: number;
    duration_ms: number;
    timestamp: string;
}

/** observation_zone 表行 */
interface ObservationZoneRow {
    tag_name: string;
    reason: string;
    entered_at: string;
    status: 'active' | 'recovering' | 'graduated';
}

export interface BackupData {
    version: number;
    timestamp: string;
    user_mastery: UserMasteryRow[];
    practice_logs: PracticeLogBackupRow[];
    observation_zone: ObservationZoneRow[];
}

// --- Actions ---

export async function exportUserDataAction(): Promise<BackupData> {
  try {
    const user = await requireUser();
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
    };
  } catch (error) {
    logger.error({ err: error }, "Export failed");
    throw new Error("Failed to export data");
  }
}

export async function importUserDataAction(data: BackupData): Promise<{ success: boolean; message: string }> {
  if (!data || data.version !== 1) {
    return { success: false, message: "Invalid backup format or version mismatch." };
  }

  try {
    const user = await requireUser();
    const userId = Number(user.id);

    await drizzleDb.transaction(async (tx) => {
      // 1. Clear existing user data
      await tx.delete(drizzleSchema.user_mastery).where(eq(drizzleSchema.user_mastery.user_id, userId));
      await tx.delete(drizzleSchema.practice_logs).where(eq(drizzleSchema.practice_logs.user_id, userId));
      await tx.delete(drizzleSchema.observation_zone).where(eq(drizzleSchema.observation_zone.user_id, userId));

      // 2. Insert User Mastery
      if (data.user_mastery.length > 0) {
        await tx.insert(drizzleSchema.user_mastery).values(
          data.user_mastery.map(row => ({
            user_id: userId,
            tag_name: row.tag_name,
            score: row.score,
            history: row.history,
            last_updated: row.last_updated
          }))
        );
      }

      // 3. Insert Practice Logs
      if (data.practice_logs.length > 0) {
        await tx.insert(drizzleSchema.practice_logs).values(
          data.practice_logs.map(row => ({
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

      // 4. Insert Observation Zone
      if (data.observation_zone.length > 0) {
        await tx.insert(drizzleSchema.observation_zone).values(
          data.observation_zone.map(row => ({
            user_id: userId,
            tag_name: row.tag_name,
            reason: row.reason,
            entered_at: row.entered_at,
            status: row.status
          }))
        );
      }
    });

    return { success: true, message: "Data imported successfully." };
  } catch (error) {
    logger.error({ err: error }, "Import failed");
    return { success: false, message: `Import failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
