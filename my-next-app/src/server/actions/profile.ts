"use server";

import { authenticatedAction } from "@/lib/safe-action";
import { getUserSubscriptionDetail } from "@/lib/billing/subscription-service";
import { revalidatePath } from "next/cache";
import { userService } from "@/lib/services/user";
import { z } from "zod";
import type { UserProfile } from "@/types/profile";

/**
 * 获取用户个人中心概览数据
 */
export const getUserProfileAction = authenticatedAction.action(
  async ({ ctx }): Promise<UserProfile> => {
    const { user } = ctx;

    // 1. 获取核心画像 (并发调用)
    const [profile, subscription] = await Promise.all([
      userService.getUserProfileFull(user.id),
      getUserSubscriptionDetail(user.id),
    ]);

    if (!profile) {
      throw new Error("用户不存在");
    }

    return {
      id: user.id,
      username: profile.username,
      role: profile.role,
      created_at: profile.created_at,
      subscription: subscription
        ? {
            plan_name: subscription.plan.name,
            plan_id: subscription.plan_id,
            status: subscription.status,
            expires_at: subscription.expires_at,
            usage_today: subscription.usage_today,
            limits: subscription.plan.limits,
          }
        : null,
      stats: profile.stats,
    };
  },
);

/**
 * 更新用户个人资料
 */
export const updateProfileAction = authenticatedAction
  .inputSchema(
    z.object({
      username: z.string().min(2, "用户名长度至少为2个字符"),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const { user } = ctx;
    const { username } = input;

    // 通过 Service 更新
    const result = await userService.updateUsername(user.id, username);
    if (!result.success) {
      throw new Error(result.error || "更新失败");
    }

    // 刷新相关页面缓存
    revalidatePath("/dashboard");
    revalidatePath("/settings");
    revalidatePath("/");

    return { success: true, message: "个人资料已更新" };
  });
