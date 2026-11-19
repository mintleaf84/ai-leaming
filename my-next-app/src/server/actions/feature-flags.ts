"use server";
import logger from "@/lib/logger";

import { drizzleDb, drizzleSchema } from "@/lib/db";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cache } from "react";

const GLOBAL_USER_ID = 0; // 用 0 代表全局系统配置

/**
 * 单个 flag 的库读取，**按请求记忆化**。
 *
 * 为什么需要：`layout.tsx` 一次渲染串行查 3 个 flag，dashboard 页再查 3 个
 * （其中 ENABLE_TEXTBOOK / ENABLE_NOTES 与 layout 完全重叠），而 system_settings
 * 是全局配置表 —— 同一请求里同一个 key 查第二遍必然是同一个结果，纯属固定开销。
 * `cache()` 的作用域就是一次 RSC 渲染 / 一次 server action 调用，正好是"请求级"，
 * 不会跨请求缓存（管理后台改完开关 revalidate 后立刻生效）。
 *
 * 无 React 渲染上下文时（单测直接调用、脚本调用）React 会退化为直接执行，
 * 行为与缓存前一致。
 */
const loadFlagValue = cache(async (key: string): Promise<boolean | null> => {
  try {
    const row = await drizzleDb
      .select({ value: drizzleSchema.system_settings.value })
      .from(drizzleSchema.system_settings)
      .where(
        and(
          eq(drizzleSchema.system_settings.user_id, GLOBAL_USER_ID),
          eq(drizzleSchema.system_settings.key, key),
        ),
      )
      .limit(1)
      .all();

    // null = 库里没有这条配置，由调用方决定默认值
    if (row.length === 0) return null;
    return row[0].value === "true";
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch feature flag [${key}]`);
    return null;
  }
});

/**
 * 获取全局功能开关状态
 * @param key 功能键名，建议以 feature_ 开头以示区分
 * @param defaultValue 当数据库中无配置时的默认值
 */
export async function getGlobalFeatureFlag(
  key: string,
  defaultValue: boolean = false,
): Promise<boolean> {
  const value = await loadFlagValue(key);
  return value ?? defaultValue;
}

/**
 * 切换全局功能开关
 * (限管理员/后台使用)
 */
export async function toggleGlobalFeatureFlag(key: string, value: boolean) {
  try {
    // 确保存在一个 id=0 的系统级虚拟用户，以满足 system_settings 表的外键约束
    await drizzleDb
      .insert(drizzleSchema.users)
      .values({
        id: GLOBAL_USER_ID,
        username: "system_global_user",
        password_hash: "none",
        role: "admin",
      })
      .onConflictDoNothing();

    await drizzleDb
      .insert(drizzleSchema.system_settings)
      .values({
        user_id: GLOBAL_USER_ID,
        key,
        value: String(value),
      })
      .onConflictDoUpdate({
        target: [
          drizzleSchema.system_settings.user_id,
          drizzleSchema.system_settings.key,
        ],
        set: { value: String(value), updated_at: sql`CURRENT_TIMESTAMP` },
      });

    // 清除应用路由缓存级别，让依赖开关的页面能够无缝响应热更新
    revalidatePath("/", "layout");
    return { success: true, value };
  } catch (error) {
    logger.error({ err: error }, `Failed to toggle feature flag [${key}]`);
    return { success: false, error: "数据库更新开关失败" };
  }
}
