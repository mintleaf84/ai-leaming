import { drizzleDb } from './index';
import { system_settings, users } from './drizzle-schema';
import { eq, and, sql } from 'drizzle-orm';

export async function getSetting(key: string): Promise<string | null> {
  try {
    const row = await drizzleDb
      .select({ value: system_settings.value })
      .from(system_settings)
      .where(and(eq(system_settings.user_id, 1), eq(system_settings.key, key)))
      .limit(1)
      .all();
    return row[0]?.value ?? null;
  } catch (error) {
    console.error(`[DB] getSetting failed for key: ${key}`, error);
    return null;
  }
}

export async function setSetting(key: string, value: string) {
  await drizzleDb
    .insert(system_settings)
    .values({ user_id: 1, key, value })
    .onConflictDoUpdate({
      target: [system_settings.user_id, system_settings.key],
      set: { value, updated_at: sql`CURRENT_TIMESTAMP` }
    });
}

export async function setUserAsAdmin(userId: number) {
  await drizzleDb
    .update(users)
    .set({ role: 'admin' })
    .where(eq(users.id, userId));
}