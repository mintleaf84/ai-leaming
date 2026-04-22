'use server';
import logger from '@/lib/logger';

import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/auth';
import { getUserSubscriptionDetail } from '@/lib/billing/subscription-service';
import { revalidatePath } from 'next/cache';

/**
 * 获取用户个人中心概览数据
 */
export async function getUserProfileAction() {
  try {
    const user = await requireUser();

    // 获取用户订阅详情
    const subscription = getUserSubscriptionDetail(user.id);

    // 获取学习统计
    const practiceStats = db.prepare(`
      SELECT 
        COUNT(*) as total_questions,
        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_count,
        COUNT(DISTINCT date(timestamp)) as practice_days
      FROM practice_logs 
      WHERE user_id = ?
    `).get(user.id) as { total_questions: number; correct_count: number; practice_days: number } | undefined;

    // 获取会话统计
    const sessionStats = db.prepare(`
      SELECT COUNT(*) as total_sessions
      FROM practice_sessions
      WHERE user_id = ?
    `).get(user.id) as { total_sessions: number } | undefined;

    // 获取已掌握知识点数量
    const masteryStats = db.prepare(`
      SELECT 
        COUNT(*) as total_tags,
        SUM(CASE WHEN score >= 80 THEN 1 ELSE 0 END) as mastered_tags
      FROM user_mastery
      WHERE user_id = ?
    `).get(user.id) as { total_tags: number; mastered_tags: number } | undefined;

    // 获取聊天统计
    const chatStats = db.prepare(`
      SELECT COUNT(*) as total_chats
      FROM chat_sessions
      WHERE user_id = ?
    `).get(user.id) as { total_chats: number } | undefined;

    // 获取用户注册信息
    const userInfo = db.prepare(`
      SELECT username, role, created_at
      FROM users
      WHERE id = ?
    `).get(user.id) as { username: string; role: string; created_at: string } | undefined;

    return {
      success: true,
      profile: {
        id: user.id,
        username: userInfo?.username || user.username,
        role: userInfo?.role || 'student',
        created_at: userInfo?.created_at || '',
        subscription: subscription ? {
          plan_name: subscription.plan.name,
          plan_id: subscription.plan_id,
          status: subscription.status,
          expires_at: subscription.expires_at,
          usage_today: subscription.usage_today,
          limits: subscription.plan.limits
        } : null,
        stats: {
          total_questions: practiceStats?.total_questions || 0,
          correct_count: practiceStats?.correct_count || 0,
          accuracy: practiceStats?.total_questions
            ? Math.round((practiceStats.correct_count / practiceStats.total_questions) * 100)
            : 0,
          practice_days: practiceStats?.practice_days || 0,
          total_sessions: sessionStats?.total_sessions || 0,
          total_tags: masteryStats?.total_tags || 0,
          mastered_tags: masteryStats?.mastered_tags || 0,
          total_chats: chatStats?.total_chats || 0
        }
      }
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
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

    // 检查用户名是否重复 (排除自己)
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, user.id);
    if (existing) {
      return { success: false, error: '该用户名已被使用' };
    }

    // 更新数据库
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, user.id);

    revalidatePath('/dashboard');
    revalidatePath('/settings');
    revalidatePath('/'); // Ensure sidebar updates globally

    return { success: true, message: '个人资料已更新' };
  } catch (error) {
    logger.error({ err: error }, '更新资料失败');
    return { success: false, error: '更新失败，请稍后重试' };
  }
}
