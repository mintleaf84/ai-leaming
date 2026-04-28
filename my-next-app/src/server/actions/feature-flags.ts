'use server';
import logger from '@/lib/logger';

import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

const GLOBAL_USER_ID = 0; // 用 0 代表全局系统配置

/**
 * 获取全局功能开关状态
 * @param key 功能键名，建议以 feature_ 开头以示区分
 * @param defaultValue 当数据库中无配置时的默认值
 */
export async function getGlobalFeatureFlag(key: string, defaultValue: boolean = false): Promise<boolean> {
  try {
    const row = await drizzleDb
      .select({ value: drizzleSchema.system_settings.value })
      .from(drizzleSchema.system_settings)
      .where(
        and(
          eq(drizzleSchema.system_settings.user_id, GLOBAL_USER_ID),
          eq(drizzleSchema.system_settings.key, key)
        )
      )
      .limit(1)
      .all();

    if (row.length === 0) {
      return defaultValue;
    }
    return row[0].value === 'true';
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch feature flag [${key}]`);
    return defaultValue;
  }
}

/**
 * 切换全局功能开关
 * (限管理员/后台使用)
 */
export async function toggleGlobalFeatureFlag(key: string, value: boolean) {
  try {
    // 确保存在一个 id=0 的系统级虚拟用户，以满足 system_settings 表的外键约束
    await drizzleDb.insert(drizzleSchema.users).values({
      id: GLOBAL_USER_ID,
      username: 'system_global_user',
      password_hash: 'none',
      role: 'admin'
    }).onConflictDoNothing();

    await drizzleDb.insert(drizzleSchema.system_settings).values({
      user_id: GLOBAL_USER_ID,
      key,
      value: String(value)
    }).onConflictDoUpdate({
      target: [drizzleSchema.system_settings.user_id, drizzleSchema.system_settings.key],
      set: { value: String(value), updated_at: sql`CURRENT_TIMESTAMP` }
    });
    
    // 清除应用路由缓存级别，让依赖开关的页面能够无缝响应热更新
    revalidatePath('/', 'layout');
    return { success: true, value };
  } catch (error) {
    logger.error({ err: error }, `Failed to toggle feature flag [${key}]`);
    return { success: false, error: '数据库更新开关失败' };
  }
}
