'use server';

import { getErrorMessage } from '@/lib/utils/error';
import db from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/auth';
import { logAdminAction } from '@/lib/admin/audit';

export type AiConfig = {
    id: number;
    name: string;
    api_url: string;
    api_key: string;
    model_economy: string;
    model_premium: string;
    model_embedding?: string;
    embedding_dimensions?: number;
    model_rerank?: string;
    model_knowledge?: string;
    is_active: boolean;
    created_at?: string;
};

// 获取所有配置
export async function getAiConfigsAction(): Promise<AiConfig[]> {
    const settings = db.prepare('SELECT * FROM ai_configs ORDER BY created_at DESC').all() as AiConfig[];
    return settings.map(s => ({
        ...s,
        is_active: Boolean(s.is_active)
    }));
}

// 保存配置（新增或更新）
export async function saveAiConfigAction(config: Partial<AiConfig>) {
    const user = await requireRole(['admin']);
    try {
        if (config.id) {
            // Update
            const stmt = db.prepare(`
      UPDATE ai_configs 
      SET name = ?, api_url = ?, api_key = ?, model_economy = ?, model_premium = ?, model_embedding = ?, embedding_dimensions = ?, model_knowledge = ?, model_rerank = ?
      WHERE id = ?
    `);
            stmt.run(
                config.name,
                config.api_url,
                config.api_key,
                config.model_economy || 'gpt-4o-mini',
                config.model_premium || 'gpt-4o',
                config.model_embedding || 'text-embedding-3-small',
                config.embedding_dimensions || 768,
                config.model_knowledge || '',
                config.model_rerank || '',
                config.id
            );
        } else {
            // Insert
            // First check if it's the first config, if so make it active
            const count = db.prepare('SELECT COUNT(*) as count FROM ai_configs').get() as { count: number };
            const isActive = count.count === 0 ? 1 : 0;

            const stmt = db.prepare(`
      INSERT INTO ai_configs (name, api_url, api_key, model_economy, model_premium, model_embedding, embedding_dimensions, model_knowledge, model_rerank, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
            stmt.run(
                config.name,
                config.api_url,
                config.api_key,
                config.model_economy || 'gpt-4o-mini',
                config.model_premium || 'gpt-4o',
                config.model_embedding || 'text-embedding-3-small',
                config.embedding_dimensions || 768,
                config.model_knowledge || '',
                config.model_rerank || '',
                isActive
            );
        }

        revalidatePath('/admin');

        // 记录日志
        logAdminAction(user.id, user.username, 'UPDATE_AI_CONFIG', 'ai_config', config.id?.toString() || 'new', { name: config.name });

        return { success: true };
    } catch (error: unknown) {
        console.error('saveAiConfigAction error:', error);
        return { success: false, error: getErrorMessage(error) };
    }
}

// 删除配置
export async function deleteAiConfigAction(id: number) {
    const user = await requireRole(['admin']);
    // Check if active
    const config = db.prepare('SELECT is_active FROM ai_configs WHERE id = ?').get(id) as { is_active: number };
    if (config && config.is_active) {
        return { success: false, error: "无法删除当前激活的配置，请先切换到其他配置。" };
    }

    db.prepare('DELETE FROM ai_configs WHERE id = ?').run(id);

    // 记录日志
    logAdminAction(user.id, user.username, 'DELETE_AI_CONFIG', 'ai_config', id.toString());

    revalidatePath('/admin');
    return { success: true };
}

// 设置激活配置
export async function setActiveAiConfigAction(id: number) {
    const user = await requireRole(['admin']);
    const transaction = db.transaction(() => {
        db.prepare('UPDATE ai_configs SET is_active = 0').run();
        db.prepare('UPDATE ai_configs SET is_active = 1 WHERE id = ?').run(id);
    });

    transaction();

    // 记录日志
    logAdminAction(user.id, user.username, 'UPDATE_AI_CONFIG', 'ai_config', id.toString(), { action: 'set_active' });

    revalidatePath('/admin');
    return { success: true };
}

export interface AiModelRoute {
    feature: string;
    config_id: number;
    model_name: string;
    updated_at?: string;
}

/**
 * 获取模型路由配置
 */
export async function getAiModelRoutesAction(): Promise<AiModelRoute[]> {
    await requireRole(['admin']);
    return db.prepare('SELECT * FROM ai_model_routes').all() as AiModelRoute[];
}

/**
 * 保存模型路由配置
 */
export async function saveAiModelRouteAction(route: AiModelRoute) {
    const user = await requireRole(['admin']);

    const stmt = db.prepare(`
        INSERT INTO ai_model_routes (feature, config_id, model_name, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(feature) DO UPDATE SET
            config_id = excluded.config_id,
            model_name = excluded.model_name,
            updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(route.feature, route.config_id, route.model_name);

    // 记录日志
    logAdminAction(
        user.id,
        user.username,
        'UPDATE_AI_ROUTE',
        'ai_model_route',
        route.feature,
        { config_id: route.config_id, model_name: route.model_name }
    );

    revalidatePath('/admin/ai');
    return { success: true };
}

