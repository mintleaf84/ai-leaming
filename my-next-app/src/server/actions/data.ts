'use server';

import db from '@/lib/db';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';

// --- Types ---

export interface BackupData {
  version: number;
  timestamp: string;
  user_mastery: any[];
  practice_logs: any[];
  observation_zone: any[];
}

// --- Actions ---

export async function exportUserDataAction(): Promise<BackupData> {
  try {
    const user = await requireUser();
    const user_mastery = db.prepare('SELECT * FROM user_mastery WHERE user_id = ?').all(user.id);
    const practice_logs = db.prepare('SELECT * FROM practice_logs WHERE user_id = ?').all(user.id);
    const observation_zone = db.prepare('SELECT * FROM observation_zone WHERE user_id = ?').all(user.id);

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      user_mastery,
      practice_logs,
      observation_zone
    };
  } catch (error) {
    console.error("Export failed:", error);
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
    console.error("Import failed:", error);
    return { success: false, message: `Import failed: ${(error as Error).message}` };
  }
}
