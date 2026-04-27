'use server';

import logger from '@/lib/logger';
import { requireUser } from '@/lib/auth/auth';
import { getUserSubscriptionDetail } from '@/lib/billing/subscription-service';
import { revalidatePath } from 'next/cache';
import { userService } from '@/lib/services/user';

/**
 * 获取用户个人中心概览数据
 */
export async function getUserProfileAction() {
  try {
    const user = await requireUser();

    // 1. 获取核心画像 (并发调用)
    const [profile, subscription] = await Promise.all([
      userService.getUserProfileFull(user.id),
      getUserSubscriptionDetail(user.id)
    ]);

    if (!profile) {
        return { success: false, error: '用户不存在' };
    }

    return {
      success: true,
      profile: {
        id: user.id,
        username: profile.username,
        role: profile.role,
        created_at: profile.created_at,
        subscription: subscription ? {
          plan_name: subscription.plan.name,
          plan_id: subscription.plan_id,
          status: subscription.status,
          expires_at: subscription.expires_at,
          usage_today: subscription.usage_today,
          limits: subscription.plan.limits
        } : null,
        stats: profile.stats
      }
    };
  } catch (error: any) {
    logger.error({ err: error }, '[ProfileAction] 获取资料失败');
    return { success: false, error: error.message || '获取资料失败' };
  }
}

/**
 * 更新用户个人资料
 */
export async function updateProfileAction(data: { username: string }) {
  try {
    const user = await requireUser();
    const { username } = data;

    if (!username || username.trim().length < 2) {
      return { success: false, error: '用户名长度至少为2个字符' };
    }

    // 通过 Service 更新
    const result = await userService.updateUsername(user.id, username);
    if (!result.success) {
        return result;
    }

    // 刷新相关页面缓存
    revalidatePath('/dashboard');
    revalidatePath('/settings');
    revalidatePath('/'); 

    return { success: true, message: '个人资料已更新' };
  } catch (error) {
    logger.error({ err: error }, '[ProfileAction] 更新资料失败');
    return { success: false, error: '更新失败，请稍后重试' };
  }
}
