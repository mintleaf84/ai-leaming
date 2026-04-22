'use server';
import logger from '@/lib/logger';

import { getErrorMessage } from '@/lib/utils/error';
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/auth';

export type Settings = {
  reviewThreshold: number;
  aiSeverity: 'low' | 'medium' | 'high';
  darkMode: boolean;
};

export async function getSettingsAction(): Promise<Settings> {
  const user = await requireUser();
  const rows = db.prepare('SELECT key, value FROM system_settings WHERE user_id = ?').all(user.id) as { key: string; value: string }[];
  const settingsMap = new Map(rows.map(r => [r.key, r.value]));

  return {
    reviewThreshold: parseInt(settingsMap.get('review_threshold') || '60'),
    aiSeverity: (settingsMap.get('ai_severity') as 'low' | 'medium' | 'high' | undefined) ?? 'medium',
    darkMode: settingsMap.get('dark_mode') === 'true',
  };
}

export async function updateSettingsAction(settings: Partial<Settings>) {
  const user = await requireUser();
  const stmt = db.prepare(`
    INSERT INTO system_settings (user_id, key, value, updated_at) 
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);

  if (settings.reviewThreshold !== undefined) {
    stmt.run(user.id, 'review_threshold', settings.reviewThreshold.toString());
  }
  if (settings.aiSeverity !== undefined) {
    stmt.run(user.id, 'ai_severity', settings.aiSeverity);
  }
  if (settings.darkMode !== undefined) {
    stmt.run(user.id, 'dark_mode', settings.darkMode.toString());
  }

  revalidatePath('/settings');
  return { success: true };
}

export async function resetUserDataAction() {
  const user = await requireUser();

  db.prepare('DELETE FROM practice_logs WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM practice_sessions WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM user_mastery WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM observation_zone WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM chat_sessions WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM knowledge_cards WHERE user_id = ?').run(user.id);

  revalidatePath('/');
  revalidatePath('/dashboard');
  revalidatePath('/chat');
  revalidatePath('/history');
  revalidatePath('/knowledge');

  return { success: true, message: "您的学习数据已重置" };
}


