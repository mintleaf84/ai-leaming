"use server";

import {
  actionClient,
  authenticatedAction,
  adminAction,
} from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
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
  checkUsageQuota,
} from "@/lib/billing/subscription-service";
import type { UsageType } from "@/types";
import { z } from "zod";
import {
  SubscriptionPlanSchema,
  SetUserSubscriptionSchema,
  UsageTypeSchema,
} from "@/lib/validations/subscription";

// ==================== 套餐管理 (管理员) ====================

/**
 * 获取所有套餐
 */
export const getPlansAction = adminAction
  .inputSchema(z.boolean().default(false))
  .action(async ({ parsedInput: activeOnly }) => {
    const plans = await getAllPlans(activeOnly);
    return { success: true, plans };
  });

/**
 * 保存套餐 (创建或更新)
 */
export const savePlanAction = adminAction
  .inputSchema(SubscriptionPlanSchema)
  .action(async ({ parsedInput: plan }) => {
    await upsertPlan(plan as any);
    revalidatePath("/admin/plans");
    revalidatePath("/pricing");
    return { success: true };
  });

/**
 * 删除套餐
 */
export const deletePlanAction = adminAction
  .inputSchema(z.string())
  .action(async ({ parsedInput: planId }) => {
    const result = await deletePlan(planId);
    if (!result.success) {
      throw new Error(result.error || "删除失败");
    }
    revalidatePath("/admin/plans");
    revalidatePath("/pricing");
    return { success: true };
  });

// ==================== 用户订阅管理 (管理员) ====================

/**
 * 为用户设置订阅 (管理员操作)
 */
export const setUserSubscriptionAction = adminAction
  .inputSchema(SetUserSubscriptionSchema)
  .action(async ({ parsedInput: input }) => {
    const { userId, planId, durationMonths } = input;

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
      throw new Error("套餐不存在");
    }

    await createSubscription(userId, planId, expiresAt);
    revalidatePath("/admin/users");
    return { success: true };
  });

/**
 * 取消用户订阅 (降级为免费版)
 */
export const cancelUserSubscriptionAction = adminAction
  .inputSchema(z.number())
  .action(async ({ parsedInput: userId }) => {
    await cancelSubscription(userId);
    revalidatePath("/admin/users");
    return { success: true };
  });

/**
 * 获取订阅统计数据
 */
export const getSubscriptionStatsAction = adminAction.action(async () => {
  const stats = await getSubscriptionStats();
  return { success: true, stats };
});

// ==================== 用户侧订阅查询 ====================

/**
 * 获取当前用户的订阅详情
 */
export const getMySubscriptionAction = authenticatedAction.action(
  async ({ ctx }) => {
    const { user } = ctx;
    const detail = await getUserSubscriptionDetail(user.id);
    return { success: true, subscription: detail };
  },
);

/**
 * 获取当前用户今日用量
 */
export const getMyUsageAction = authenticatedAction.action(async ({ ctx }) => {
  const { user } = ctx;
  const usage = await getDailyUsage(user.id);
  const detail = await getUserSubscriptionDetail(user.id);
  return {
    success: true,
    usage,
    limits: detail?.plan.limits || {
      ai_chat: 0,
      practice: 0,
      review: 0,
      rag: 0,
    },
  };
});

/**
 * 检查用量配额
 */
export const checkQuotaAction = authenticatedAction
  .inputSchema(UsageTypeSchema)
  .action(async ({ parsedInput: usageType, ctx }) => {
    const { user } = ctx;
    const result = await checkUsageQuota(user.id, usageType as UsageType);
    return { success: true, ...result };
  });

// ==================== 公开接口 ====================

/**
 * 获取所有激活的套餐 (用于定价页)
 */
export const getActivePlansAction = actionClient.action(async () => {
  const plans = await getAllPlans(true);
  return { success: true, plans };
});
