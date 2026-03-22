/**
 * 订阅服务
 * 核心订阅逻辑：套餐管理、用户订阅、用量统计
 */

import db from '../db';
import { getBeijingDateString } from '../utils/datetime';
import {
    SubscriptionPlan,
    UserSubscription,
    UserSubscriptionDetail,
    DailyUsage,
    UsageType,
    UsageCheckResult,
    USAGE_TYPE_LABELS
} from './subscription-types';

// ==================== 套餐管理 ====================

/**
 * 获取所有套餐 (可选只返回激活的)
 */
export function getAllPlans(activeOnly = true): SubscriptionPlan[] {
    const sql = activeOnly
        ? 'SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY sort_order ASC'
        : 'SELECT * FROM subscription_plans ORDER BY sort_order ASC';

    const rows = db.prepare(sql).all() as any[];
    return rows.map(parsePlanRow);
}

/**
 * 根据 ID 获取套餐
 */
export function getPlanById(planId: string): SubscriptionPlan | null {
    const row = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planId) as any;
    return row ? parsePlanRow(row) : null;
}

/**
 * 创建或更新套餐
 */
export function upsertPlan(plan: Omit<SubscriptionPlan, 'created_at'>): void {
    db.prepare(`
    INSERT INTO subscription_plans (id, name, tier, price_monthly, limits, features, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      tier = excluded.tier,
      price_monthly = excluded.price_monthly,
      limits = excluded.limits,
      features = excluded.features,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order
  `).run(
        plan.id,
        plan.name,
        plan.tier,
        plan.price_monthly,
        JSON.stringify(plan.limits),
        JSON.stringify(plan.features),
        plan.is_active ? 1 : 0,
        plan.sort_order ?? 0
    );
}

/**
 * 删除套餐 (不能删除有用户订阅的套餐)
 */
export function deletePlan(planId: string): { success: boolean; error?: string } {
    // 检查是否有用户订阅此套餐
    const subCount = db.prepare(
        'SELECT COUNT(*) as count FROM user_subscriptions WHERE plan_id = ?'
    ).get(planId) as { count: number };

    if (subCount.count > 0) {
        return { success: false, error: `该套餐下有 ${subCount.count} 个用户，无法删除` };
    }

    db.prepare('DELETE FROM subscription_plans WHERE id = ?').run(planId);
    return { success: true };
}

// ==================== 用户订阅管理 ====================

/**
 * 获取用户订阅状态
 */
export function getUserSubscription(userId: number): UserSubscription | null {
    const row = db.prepare(`
    SELECT * FROM user_subscriptions WHERE user_id = ?
  `).get(userId) as any;
    return row || null;
}

/**
 * 获取用户订阅详情 (包含套餐信息和今日用量)
 */
export function getUserSubscriptionDetail(userId: number): UserSubscriptionDetail | null {
    const sub = getUserSubscription(userId);
    if (!sub) {
        // 自动为用户创建免费订阅
        createSubscription(userId, 'free');
        return getUserSubscriptionDetail(userId);
    }

    const plan = getPlanById(sub.plan_id);
    if (!plan) return null;

    // 检查订阅是否过期
    if (sub.expires_at && new Date(sub.expires_at) < new Date()) {
        // 订阅已过期，降级到免费版
        updateSubscription(userId, 'free', null);
        return getUserSubscriptionDetail(userId);
    }

    const usageToday = getDailyUsage(userId);

    return {
        ...sub,
        plan,
        usage_today: usageToday
    };
}

/**
 * 创建用户订阅
 */
export function createSubscription(
    userId: number,
    planId: string,
    expiresAt: string | null = null
): void {
    db.prepare(`
    INSERT INTO user_subscriptions (user_id, plan_id, status, expires_at)
    VALUES (?, ?, 'active', ?)
    ON CONFLICT(user_id) DO UPDATE SET
      plan_id = excluded.plan_id,
      status = 'active',
      started_at = CURRENT_TIMESTAMP,
      expires_at = excluded.expires_at
  `).run(userId, planId, expiresAt);
}

/**
 * 更新用户订阅
 */
export function updateSubscription(
    userId: number,
    planId: string,
    expiresAt: string | null
): void {
    db.prepare(`
    UPDATE user_subscriptions
    SET plan_id = ?, expires_at = ?, status = 'active', started_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(planId, expiresAt, userId);
}

/**
 * 取消用户订阅 (降级到免费版)
 */
export function cancelSubscription(userId: number): void {
    db.prepare(`
    UPDATE user_subscriptions
    SET plan_id = 'free', status = 'cancelled', expires_at = NULL
    WHERE user_id = ?
  `).run(userId);
}

// ==================== 用量管理 ====================

/**
 * 获取用户今日用量
 */
export function getDailyUsage(userId: number): Record<UsageType, number> {
    const today = getBeijingDateString();
    const rows = db.prepare(`
    SELECT usage_type, count FROM daily_usage
    WHERE user_id = ? AND usage_date = ?
  `).all(userId, today) as { usage_type: string; count: number }[];

    const result: Record<UsageType, number> = {
        ai_chat: 0,
        practice: 0,
        review: 0,
        rag: 0,
        mnemonic: 0,
        first_principles: 0
    };

    rows.forEach(row => {
        if (row.usage_type in result) {
            result[row.usage_type as UsageType] = row.count;
        }
    });

    return result;
}

/**
 * 增加用量计数
 */
export function incrementUsage(userId: number, usageType: UsageType, amount = 1): void {
    const today = getBeijingDateString();

    db.prepare(`
    INSERT INTO daily_usage (user_id, usage_date, usage_type, count)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, usage_date, usage_type) DO UPDATE SET
      count = count + ?
  `).run(userId, today, usageType, amount, amount);
}

/**
 * 检查用量配额
 */
export function checkUsageQuota(userId: number, usageType: UsageType): UsageCheckResult {
    const subDetail = getUserSubscriptionDetail(userId);
    if (!subDetail) {
        return {
            allowed: false,
            current: 0,
            limit: 0,
            remaining: 0,
            message: '无法获取订阅信息'
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
            remaining: -1
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
            : `今日${USAGE_TYPE_LABELS[usageType]}次数已用完 (${current}/${limit})，升级套餐解锁更多`
    };
}

/**
 * 检查并消费配额 (原子操作)
 */
export function checkAndConsumeQuota(
    userId: number,
    usageType: UsageType
): UsageCheckResult {
    // 使用事务确保检查与扣费的原子性，防止并发下的配额绕过 (Race Condition)
    return db.transaction(() => {
        const result = checkUsageQuota(userId, usageType);

        if (result.allowed) {
            incrementUsage(userId, usageType);
            result.current += 1;
            if (result.remaining !== -1) {
                result.remaining -= 1;
            }
        }

        return result;
    })();
}

// ==================== 统计查询 ====================

/**
 * 获取订阅统计数据
 */
export function getSubscriptionStats(): {
    totalUsers: number;
    byPlan: { plan_id: string; plan_name: string; count: number }[];
} {
    const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM user_subscriptions').get() as { count: number }).count;

    const byPlan = db.prepare(`
    SELECT us.plan_id, sp.name as plan_name, COUNT(*) as count
    FROM user_subscriptions us
    LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
    GROUP BY us.plan_id
    ORDER BY count DESC
  `).all() as { plan_id: string; plan_name: string; count: number }[];

    return { totalUsers, byPlan };
}

// ==================== 辅助函数 ====================

function parsePlanRow(row: any): SubscriptionPlan {
    return {
        ...row,
        limits: JSON.parse(row.limits || '{}'),
        features: JSON.parse(row.features || '[]'),
        is_active: Boolean(row.is_active)
    };
}
