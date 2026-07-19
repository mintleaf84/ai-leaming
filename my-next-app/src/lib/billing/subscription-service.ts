/**
 * 订阅服务
 * 核心订阅逻辑：套餐管理、用户订阅、用量统计
 */

import { drizzleDb, drizzleSchema } from "../db";
import { eq, and, sql, asc } from "drizzle-orm";
import { getBeijingDateString } from "../utils/datetime";
import {
  SubscriptionPlan,
  UserSubscription,
  UserSubscriptionDetail,
  UsageType,
  UsageCheckResult,
  USAGE_TYPE_LABELS,
} from "../../types/subscription";

const { subscription_plans, user_subscriptions, daily_usage } = drizzleSchema;

// ==================== 套餐管理 ====================

/**
 * 获取所有套餐 (可选只返回激活的)
 */
export async function getAllPlans(
  activeOnly = true,
): Promise<SubscriptionPlan[]> {
  const query = drizzleDb.select().from(subscription_plans);

  if (activeOnly) {
    query.where(eq(subscription_plans.is_active, 1));
  }

  const rows = await query.orderBy(asc(subscription_plans.sort_order));
  return rows.map(parsePlanRow);
}

/**
 * 根据 ID 获取套餐
 */
export async function getPlanById(
  planId: string,
): Promise<SubscriptionPlan | null> {
  const rows = await drizzleDb
    .select()
    .from(subscription_plans)
    .where(eq(subscription_plans.id, planId))
    .limit(1);

  return rows.length > 0 ? parsePlanRow(rows[0]) : null;
}

/**
 * 创建或更新套餐
 */
export async function upsertPlan(
  plan: Omit<SubscriptionPlan, "created_at">,
): Promise<void> {
  await drizzleDb
    .insert(subscription_plans)
    .values({
      id: plan.id,
      name: plan.name,
      tier: plan.tier,
      price_monthly: plan.price_monthly,
      limits: JSON.stringify(plan.limits),
      features: JSON.stringify(plan.features),
      is_active: plan.is_active ? 1 : 0,
      sort_order: plan.sort_order ?? 0,
    })
    .onConflictDoUpdate({
      target: subscription_plans.id,
      set: {
        name: sql`excluded.name`,
        tier: sql`excluded.tier`,
        price_monthly: sql`excluded.price_monthly`,
        limits: sql`excluded.limits`,
        features: sql`excluded.features`,
        is_active: sql`excluded.is_active`,
        sort_order: sql`excluded.sort_order`,
      },
    });
}

/**
 * 删除套餐 (不能删除有用户订阅的套餐)
 */
export async function deletePlan(
  planId: string,
): Promise<{ success: boolean; error?: string }> {
  // 检查是否有用户订阅此套餐
  const rows = await drizzleDb
    .select({ count: sql<number>`count(*)` })
    .from(user_subscriptions)
    .where(eq(user_subscriptions.plan_id, planId));

  const subCount = rows[0]?.count ?? 0;

  if (subCount > 0) {
    return { success: false, error: `该套餐下有 ${subCount} 个用户，无法删除` };
  }

  await drizzleDb
    .delete(subscription_plans)
    .where(eq(subscription_plans.id, planId));
  return { success: true };
}

// ==================== 用户订阅管理 ====================

/**
 * 获取用户订阅状态
 */
export async function getUserSubscription(
  userId: number,
): Promise<UserSubscription | null> {
  const rows = await drizzleDb
    .select()
    .from(user_subscriptions)
    .where(eq(user_subscriptions.user_id, userId))
    .limit(1);

  return rows.length > 0 ? (rows[0] as unknown as UserSubscription) : null;
}

/**
 * 获取用户订阅详情 (包含套餐信息和今日用量)
 */
export async function getUserSubscriptionDetail(
  userId: number,
): Promise<UserSubscriptionDetail | null> {
  const sub = await getUserSubscription(userId);
  if (!sub) {
    // 自动为用户创建免费订阅
    await createSubscription(userId, "free");
    return getUserSubscriptionDetail(userId);
  }

  const plan = await getPlanById(sub.plan_id);
  if (!plan) return null;

  // 检查订阅是否过期
  if (sub.expires_at && new Date(sub.expires_at) < new Date()) {
    // 订阅已过期，降级到免费版
    await updateSubscription(userId, "free", null);
    return getUserSubscriptionDetail(userId);
  }

  const usageToday = await getDailyUsage(userId);

  return {
    ...sub,
    plan,
    usage_today: usageToday,
  };
}

/**
 * 创建用户订阅
 */
export async function createSubscription(
  userId: number,
  planId: string,
  expiresAt: string | null = null,
): Promise<void> {
  await drizzleDb
    .insert(user_subscriptions)
    .values({
      user_id: userId,
      plan_id: planId,
      status: "active",
      expires_at: expiresAt,
    })
    .onConflictDoUpdate({
      target: user_subscriptions.user_id,
      set: {
        plan_id: sql`excluded.plan_id`,
        status: "active",
        started_at: sql`CURRENT_TIMESTAMP`,
        expires_at: sql`excluded.expires_at`,
      },
    });
}

/**
 * 更新用户订阅
 */
export async function updateSubscription(
  userId: number,
  planId: string,
  expiresAt: string | null,
): Promise<void> {
  await drizzleDb
    .update(user_subscriptions)
    .set({
      plan_id: planId,
      expires_at: expiresAt,
      status: "active",
      started_at: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(user_subscriptions.user_id, userId));
}

/**
 * 取消用户订阅 (降级到免费版)
 */
export async function cancelSubscription(userId: number): Promise<void> {
  await drizzleDb
    .update(user_subscriptions)
    .set({
      plan_id: "free",
      status: "cancelled",
      expires_at: null,
    })
    .where(eq(user_subscriptions.user_id, userId));
}

// ==================== 用量管理 ====================

/**
 * 获取用户今日用量
 */
export async function getDailyUsage(
  userId: number,
): Promise<Record<UsageType, number>> {
  const today = getBeijingDateString();
  const rows = await drizzleDb
    .select({ usage_type: daily_usage.usage_type, count: daily_usage.count })
    .from(daily_usage)
    .where(
      and(eq(daily_usage.user_id, userId), eq(daily_usage.usage_date, today)),
    );

  const result: Record<UsageType, number> = {
    ai_chat: 0,
    practice: 0,
    review: 0,
    rag: 0,
    mnemonic: 0,
    first_principles: 0,
  };

  rows.forEach((row) => {
    if (row.usage_type && row.usage_type in result) {
      result[row.usage_type as UsageType] = row.count ?? 0;
    }
  });

  return result;
}

/**
 * 增加用量计数
 */
export async function incrementUsage(
  userId: number,
  usageType: UsageType,
  amount = 1,
): Promise<void> {
  const today = getBeijingDateString();

  await drizzleDb
    .insert(daily_usage)
    .values({
      user_id: userId,
      usage_date: today,
      usage_type: usageType,
      count: amount,
    })
    .onConflictDoUpdate({
      target: [
        daily_usage.user_id,
        daily_usage.usage_date,
        daily_usage.usage_type,
      ],
      set: {
        count: sql`${daily_usage.count} + ${amount}`,
      },
    });
}

/**
 * 减少用量计数（用于回滚）
 */
export async function decrementUsage(
  userId: number,
  usageType: UsageType,
  amount = 1,
): Promise<void> {
  const today = getBeijingDateString();

  // 尝试更新现有记录
  const [existing] = await drizzleDb
    .select({ count: daily_usage.count })
    .from(daily_usage)
    .where(
      and(
        eq(daily_usage.user_id, userId),
        eq(daily_usage.usage_date, today),
        eq(daily_usage.usage_type, usageType),
      ),
    )
    .limit(1);

  if (existing && existing.count != null && existing.count > 0) {
    // 确保不会扣成负数
    const newCount = Math.max(0, existing.count - amount);
    await drizzleDb
      .update(daily_usage)
      .set({ count: newCount })
      .where(
        and(
          eq(daily_usage.user_id, userId),
          eq(daily_usage.usage_date, today),
          eq(daily_usage.usage_type, usageType),
        ),
      );
  }
}

/**
 * 检查用量配额
 */
export async function checkUsageQuota(
  userId: number,
  usageType: UsageType,
): Promise<UsageCheckResult> {
  const subDetail = await getUserSubscriptionDetail(userId);
  if (!subDetail) {
    return {
      allowed: false,
      current: 0,
      limit: 0,
      remaining: 0,
      message: "无法获取订阅信息",
    };
  }

  const limit = subDetail.plan.limits[usageType];
  const current = subDetail.usage_today[usageType];

  // -1 表示无限
  if (limit === -1) {
    return {
      allowed: true,
      current,
      limit: -1,
      remaining: -1,
    };
  }

  const remaining = Math.max(0, limit - current);
  const allowed = remaining > 0;

  return {
    allowed,
    current,
    limit,
    remaining,
    message: allowed
      ? undefined
      : `今日${USAGE_TYPE_LABELS[usageType]}次数已用完 (${current}/${limit})，升级套餐解锁更多`,
  };
}

/**
 * 检查并消费配额 (顺序操作)
 * 注意：由于 LibSQL 使用连接池，且内部函数未使用传入的 tx 对象，继续使用 transaction wrapper 会导致多个连接间的写锁死锁 (SQLITE_BUSY)。
 * 为保持代码简洁，在单进程环境下退化为顺序执行，容忍极小概率的并发透支。
 */
export async function checkAndConsumeQuota(
  userId: number,
  usageType: UsageType,
): Promise<UsageCheckResult> {
  const result = await checkUsageQuota(userId, usageType);

  if (result.allowed) {
    await incrementUsage(userId, usageType);
    result.current += 1;
    if (result.remaining !== -1) {
      result.remaining -= 1;
    }
  }

  return result;
}

// ==================== 统计查询 ====================

/**
 * 获取订阅统计数据
 */
export async function getSubscriptionStats(): Promise<{
  totalUsers: number;
  byPlan: { plan_id: string; plan_name: string; count: number }[];
}> {
  const userCountRows = await drizzleDb
    .select({ count: sql<number>`count(*)` })
    .from(user_subscriptions);
  const totalUsers = userCountRows[0]?.count ?? 0;

  const byPlan = (await drizzleDb
    .select({
      plan_id: user_subscriptions.plan_id,
      plan_name: subscription_plans.name,
      count: sql<number>`count(*)`,
    })
    .from(user_subscriptions)
    .leftJoin(
      subscription_plans,
      eq(user_subscriptions.plan_id, subscription_plans.id),
    )
    .groupBy(user_subscriptions.plan_id)
    .orderBy(sql`count(*) DESC`)) as {
    plan_id: string;
    plan_name: string;
    count: number;
  }[];

  return { totalUsers, byPlan };
}

// ==================== 辅助函数 ====================

function parsePlanRow(row: Record<string, unknown>): SubscriptionPlan {
  return {
    id: row.id as string,
    name: row.name as string,
    tier: row.tier as SubscriptionPlan["tier"],
    price_monthly: row.price_monthly as number,
    sort_order: row.sort_order as number | undefined,
    created_at: row.created_at as string | undefined,
    limits:
      typeof row.limits === "string"
        ? JSON.parse(row.limits || "{}")
        : row.limits,
    features:
      typeof row.features === "string"
        ? JSON.parse(row.features || "[]")
        : row.features,
    is_active: Boolean(row.is_active),
  };
}
