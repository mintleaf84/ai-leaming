'use server';

import db from '@/lib/db';
import { requireUser } from '@/lib/auth';

export async function moveToObservationZoneAction(tagName: string, reason: string) {
  const user = await requireUser();

  // 1. Insert into observation zone
  db.prepare(`
    INSERT INTO observation_zone (user_id, tag_name, reason, entered_at, status)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'active')
    ON CONFLICT(user_id, tag_name) DO UPDATE SET
      reason = excluded.reason,
      entered_at = CURRENT_TIMESTAMP,
      status = 'active'
  `).run(user.id, tagName, reason);

  // 2. Reset Mastery to 15 (Protection Reset)
  // PRD: "掌握度重置为 15%（警戒水位）"
  db.prepare('UPDATE user_mastery SET score = 15 WHERE user_id = ? AND tag_name = ?').run(user.id, tagName);

  return { success: true };
}
