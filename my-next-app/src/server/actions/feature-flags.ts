'use server';
import logger from '@/lib/logger';

import db from '@/lib/db';
import { revalidatePath } from 'next/cache';

const GLOBAL_USER_ID = 0; // 用 0 代表全局系统配置

/**
 * 获取全局功能开关状态
 * @param key 功能键名，建议以 feature_ 开头以示区分
 * @param defaultValue 当数据库中无配置时的默认值
 */
export async function getGlobalFeatureFlag(key: string, defaultValue: boolean = false): Promise<boolean> {
  try {
    const row = db.prepare('SELECT value FROM system_settings WHERE user_id = ? AND key = ?').get(GLOBAL_USER_ID, key) as { value: string } | undefined;
    if (!row) {
      return defaultValue;
    }
    return row.value === 'true';
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
    db.prepare(`
      INSERT INTO system_settings (user_id, key, value) 
      VALUES (?, ?, ?) 
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(GLOBAL_USER_ID, key, String(value));
    
    // 清除应用路由缓存级别，让依赖开关的页面能够无缝响应热更新
    revalidatePath('/', 'layout');
    return { success: true, value };
  } catch (error) {
    logger.error({ err: error }, `Failed to toggle feature flag [${key}]`);
    return { success: false, error: '数据库更新开关失败' };
  }
}
