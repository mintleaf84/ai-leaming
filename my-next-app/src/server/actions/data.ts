'use server';
import logger from '@/lib/logger';

import { db } from '@/lib/db';
import { z } from 'zod';
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
    status: string;
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
    const user_mastery = db.prepare('SELECT * FROM user_mastery WHERE user_id = ?').all(user.id) as UserMasteryRow[];
    const practice_logs = db.prepare('SELECT * FROM practice_logs WHERE user_id = ?').all(user.id) as PracticeLogBackupRow[];
    const observation_zone = db.prepare('SELECT * FROM observation_zone WHERE user_id = ?').all(user.id) as ObservationZoneRow[];

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      user_mastery,
      practice_logs,
      observation_zone
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

    const transaction = db.transaction(() => {
      // 1. Clear existing user data
      db.prepare('DELETE FROM user_mastery WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM practice_logs WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM observation_zone WHERE user_id = ?').run(user.id);

      // 2. Insert User Mastery
      const insertMastery = db.prepare(`
        INSERT INTO user_mastery (user_id, tag_name, score, history, last_updated)
        VALUES (?, @tag_name, @score, @history, @last_updated)
      `);
      for (const row of data.user_mastery) {
        insertMastery.run(user.id, row);
      }

      // 3. Insert Practice Logs
      const insertLog = db.prepare(`
        INSERT INTO practice_logs (user_id, session_id, question_id, user_answer, is_correct, is_monitored_correct, duration_ms, timestamp)
        VALUES (?, @session_id, @question_id, @user_answer, @is_correct, @is_monitored_correct, @duration_ms, @timestamp)
      `);
      for (const row of data.practice_logs) {
        insertLog.run(user.id, row);
      }

      // 4. Insert Observation Zone
      const insertObs = db.prepare(`
        INSERT INTO observation_zone (user_id, tag_name, reason, entered_at, status)
        VALUES (?, @tag_name, @reason, @entered_at, @status)
      `);
      for (const row of data.observation_zone) {
        insertObs.run(user.id, row);
      }
    });

    transaction();
    return { success: true, message: "Data imported successfully." };
  } catch (error) {
    logger.error({ err: error }, "Import failed");
    return { success: false, message: `Import failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
