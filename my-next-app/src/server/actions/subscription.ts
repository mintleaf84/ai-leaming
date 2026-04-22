/**
 * 订阅相关 Server Actions
 * 用于前端调用的订阅管理接口
 */

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, requireUser } from '@/lib/auth/auth';
import {
    getAllPlans,
    getPlanById,
    upsertPlan,
    deletePlan,
    getUserSubscriptionDetail,
    createSubscription,
    cancelSubscription,
    getSubscriptionStats,
    getDailyUsage,
    checkUsageQuota
} from '@/lib/billing/subscription-service';
import { SubscriptionPlan, UsageType } from '@/types';

// ==================== 套餐管理 (管理员) ====================

/**
 * 获取所有套餐
 */
export async function getPlansAction(activeOnly = false) {
    try {
        await requireRole(['admin']);
        const plans = await getAllPlans(activeOnly);
        return { success: true, plans };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

/**
 * 保存套餐 (创建或更新)
 */
export async function savePlanAction(plan: Omit<SubscriptionPlan, 'created_at'>) {
    try {
        await requireRole(['admin']);
        await upsertPlan(plan);
        revalidatePath('/admin/plans');
        revalidatePath('/pricing');
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

/**
 * 删除套餐
 */
export async function deletePlanAction(planId: string) {
    try {
        await requireRole(['admin']);
        const result = await deletePlan(planId);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        revalidatePath('/admin/plans');
        revalidatePath('/pricing');
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

// ==================== 用户订阅管理 (管理员) ====================

/**
 * 为用户设置订阅 (管理员操作)
 */
export async function setUserSubscriptionAction(
    userId: number,
    planId: string,
    durationMonths?: number // 订阅时长，null 表示永久
) {
    try {
        await requireRole(['admin']);

        // 计算过期时间
        let expiresAt: string | null = null;
        if (durationMonths && durationMonths > 0) {
            const expireDate = new Date();
            expireDate.setMonth(expireDate.getMonth() + durationMonths);
            expiresAt = expireDate.toISOString();
        }

        // 检查套餐是否存在
        const plan = await getPlanById(planId);
        if (!plan) {
            return { success: false, error: '套餐不存在' };
        }

        await createSubscription(userId, planId, expiresAt);
        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

/**
 * 取消用户订阅 (降级为免费版)
 */
export async function cancelUserSubscriptionAction(userId: number) {
    try {
        await requireRole(['admin']);
        await cancelSubscription(userId);
        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

/**
 * 获取订阅统计数据
 */
export async function getSubscriptionStatsAction() {
    try {
        await requireRole(['admin']);
        const stats = await getSubscriptionStats();
        return { success: true, stats };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

// ==================== 用户侧订阅查询 ====================

/**
 * 获取当前用户的订阅详情
 */
export async function getMySubscriptionAction() {
    try {
        const user = await requireUser();
        const detail = await getUserSubscriptionDetail(user.id);
        return { success: true, subscription: detail };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

/**
 * 获取当前用户今日用量
 */
export async function getMyUsageAction() {
    try {
        const user = await requireUser();
        const usage = await getDailyUsage(user.id);
        const detail = await getUserSubscriptionDetail(user.id);
        return {
            success: true,
            usage,
            limits: detail?.plan.limits || { ai_chat: 0, practice: 0, review: 0, rag: 0 }
        };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

/**
 * 检查用量配额 (供其他 Server Action 调用)
 */
export async function checkQuotaAction(usageType: UsageType) {
    try {
        const user = await requireUser();
        const result = await checkUsageQuota(user.id, usageType);
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: (error as Error).message, allowed: false };
    }
}

// ==================== 公开接口 ====================

/**
 * 获取所有激活的套餐 (用于定价页)
 */
export async function getActivePlansAction() {
    try {
        const plans = await getAllPlans(true);
        return { success: true, plans };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}
