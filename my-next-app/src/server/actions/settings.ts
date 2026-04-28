'use server';

import { authenticatedAction } from '@/lib/safe-action';
import { revalidatePath } from 'next/cache';
import { settingsService } from '@/lib/services/settings';
import { SystemSettingsSchema } from '@/lib/validations/settings';

/**
 * 获取系统设置
 */
export const getSettingsAction = authenticatedAction
    .action(async ({ ctx }) => {
        const { user } = ctx;
        return await settingsService.getSettings(user.id);
    });

/**
 * 更新系统设置
 */
export const updateSettingsAction = authenticatedAction
    .inputSchema(SystemSettingsSchema.partial())
    .action(async ({ parsedInput: settings, ctx }) => {
        const { user } = ctx;
        await settingsService.updateSettings(user.id, settings);
        
        revalidatePath('/settings');
        return { success: true };
    });

/**
 * 重置用户所有数据 (危险操作)
 */
export const resetUserDataAction = authenticatedAction
    .action(async ({ ctx }) => {
        const { user } = ctx;
        await settingsService.resetUserData(user.id);

        // 刷新所有相关路由
        revalidatePath('/');
        revalidatePath('/dashboard');
        revalidatePath('/chat');
        revalidatePath('/history');
        revalidatePath('/knowledge');

        return { success: true, message: "您的学习数据已重置" };
    });
