'use server';
import logger from '@/lib/logger';

import { db,  drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, desc, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/auth';
import { logAdminAction } from '@/lib/admin/audit';
import crypto from 'crypto';
import { getErrorMessage } from '@/lib/utils/error';

export interface ApiKeyView {
    id: number;
    key_string: string;
    description: string;
    is_active: number;
    created_at: string;
    updated_at: string;
}

/**
 * 获取所有 API Key 列表
 */
export async function getApiKeysAction(): Promise<ApiKeyView[]> {
    await requireRole(['admin']);
    try {
        const rows = await drizzleDb.query.api_keys.findMany({
            orderBy: [desc(drizzleSchema.api_keys.created_at)]
        });
        return rows as ApiKeyView[];
    } catch (error) {
        logger.error({ err: error }, '[ApiKeys] 获取列表失败');
        return [];
    }
}

/**
 * 生成新的 API Key
 */
export async function createApiKeyAction(
    description: string
): Promise<{ success: boolean; key?: string; error?: string }> {
    const user = await requireRole(['admin']);
    try {
        // 生成 32 字节的随机密钥（以 hex 编码，共 64 字符）
        const keyString = `sk_${crypto.randomBytes(24).toString('hex')}`;

        await drizzleDb.insert(drizzleSchema.api_keys).values({
            key_string: keyString,
            description: description || '未命名密钥'
        });

        logAdminAction(user.id, user.username, 'CREATE_API_KEY', 'api_key', null, { description });

        return { success: true, key: keyString };
    } catch (error: unknown) {
        logger.error({ err: error }, '[ApiKeys] 创建失败');
        return { success: false, error: getErrorMessage(error) };
    }
}

/**
 * 切换 API Key 的激活状态
 */
export async function toggleApiKeyAction(
    id: number,
    isActive: boolean
): Promise<{ success: boolean; error?: string }> {
    const user = await requireRole(['admin']);
    try {
        await drizzleDb.update(drizzleSchema.api_keys)
            .set({ 
                is_active: isActive ? 1 : 0, 
                updated_at: sql`CURRENT_TIMESTAMP` 
            })
            .where(eq(drizzleSchema.api_keys.id, id));

        logAdminAction(user.id, user.username, 'TOGGLE_API_KEY', 'api_key', id.toString(), {
            is_active: isActive,
        });

        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, '[ApiKeys] 切换状态失败');
        return { success: false, error: getErrorMessage(error) };
    }
}

/**
 * 删除 API Key
 */
export async function deleteApiKeyAction(
    id: number
): Promise<{ success: boolean; error?: string }> {
    const user = await requireRole(['admin']);
    try {
        await drizzleDb.delete(drizzleSchema.api_keys)
            .where(eq(drizzleSchema.api_keys.id, id));

        logAdminAction(user.id, user.username, 'DELETE_API_KEY', 'api_key', id.toString());

        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, '[ApiKeys] 删除失败');
        return { success: false, error: getErrorMessage(error) };
    }
}
