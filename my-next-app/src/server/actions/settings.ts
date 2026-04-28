'use server';

import logger from '@/lib/logger';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/auth';
import { settingsService, type SystemSettings } from '@/lib/services/settings';

/**
 * 获取系统设置
 */
export async function getSettingsAction(): Promise<SystemSettings> {
    try {
        const user = await requireUser();
        return await settingsService.getSettings(user.id);
    } catch (error) {
        logger.error({ err: error }, '[SettingsAction] 获取设置失败');
        return {
            reviewThreshold: 60,
            aiSeverity: 'medium',
            darkMode: false
        };
    }
}

/**
 * 更新系统设置
 */
export async function updateSettingsAction(settings: Partial<SystemSettings>) {
    try {
        const user = await requireUser();
        await settingsService.updateSettings(user.id, settings);
        
        revalidatePath('/settings');
        return { success: true };
    } catch (error) {
        logger.error({ err: error }, '[SettingsAction] 更新设置失败');
        return { success: false, error: '更新失败' };
    }
}

/**
 * 重置用户所有数据 (危险操作)
 */
export async function resetUserDataAction() {
    try {
        const user = await requireUser();
        await settingsService.resetUserData(user.id);

        // 刷新所有相关路由
        revalidatePath('/');
        revalidatePath('/dashboard');
        revalidatePath('/chat');
        revalidatePath('/history');
        revalidatePath('/knowledge');

        return { success: true, message: "您的学习数据已重置" };
    } catch (error) {
        logger.error({ err: error }, '[SettingsAction] 数据重置失败');
        return { success: false, error: '重置失败，请稍后重试' };
    }
}
