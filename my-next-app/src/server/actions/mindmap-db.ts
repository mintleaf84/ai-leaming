'use server';
import logger from '@/lib/logger';

import db from '@/lib/db';
import { requireUser } from '@/lib/auth/auth';
import { revalidatePath } from 'next/cache';

export interface Mindmap {
    id: number;
    user_id: number;
    title: string;
    content: string | null;
    created_at: string;
    updated_at: string;
}

export type CreateMindmapInput = {
    title?: string;
    content?: string;
};

export type UpdateMindmapInput = {
    id: number;
    title?: string;
    content?: string;
};

export async function createMindmapAction(input: CreateMindmapInput = {}) {
    try {
        const user = await requireUser();
        const { title = '未命名思维导图', content = '# 新建导图\n\n- 在此输入内容' } = input;

        const stmt = db.prepare(`
            INSERT INTO mindmaps (user_id, title, content)
            VALUES (?, ?, ?)
        `);

        const result = stmt.run(user.id, title, content);

        revalidatePath('/mindmap');
        return { success: true, id: result.lastInsertRowid as number };
    } catch (error: unknown) {
        logger.error('Create mindmap failed:', error);
        return { success: false, message: '创建思维导图失败' };
    }
}

export async function updateMindmapAction(input: UpdateMindmapInput) {
    try {
        const user = await requireUser();
        const { id, title, content } = input;

        const existing = db.prepare('SELECT id FROM mindmaps WHERE id = ? AND user_id = ?').get(id, user.id);
        if (!existing) {
            return { success: false, message: '脑图不存在或无权限' };
        }

        const updates: string[] = [];
        const params: (string | number | null)[] = [];

        if (title !== undefined) {
            updates.push('title = ?');
            params.push(title);
        }
        if (content !== undefined) {
            updates.push('content = ?');
            params.push(content);
        }

        if (updates.length === 0) return { success: true };

        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);

        const stmt = db.prepare(`
            UPDATE mindmaps 
            SET ${updates.join(', ')} 
            WHERE id = ?
        `);

        stmt.run(...params);

        revalidatePath('/mindmap');
        revalidatePath(`/mindmap/${id}`);
        return { success: true };
    } catch (error: unknown) {
        logger.error('Update mindmap failed:', error);
        return { success: false, message: '保存思维导图失败' };
    }
}

export async function deleteMindmapAction(id: number) {
    try {
        const user = await requireUser();

        const stmt = db.prepare('DELETE FROM mindmaps WHERE id = ? AND user_id = ?');
        const result = stmt.run(id, user.id);

        if (result.changes === 0) {
            return { success: false, message: '导图不存在或无权限' };
        }

        revalidatePath('/mindmap');
        return { success: true };
    } catch (error: unknown) {
        logger.error('Delete mindmap failed:', error);
        return { success: false, message: '删除失败' };
    }
}

export async function getMindmapsAction() {
    try {
        const user = await requireUser();

        const records = db.prepare(`
            SELECT id, title, updated_at
            FROM mindmaps 
            WHERE user_id = ? 
            ORDER BY updated_at DESC
        `).all(user.id) as Pick<Mindmap, 'id' | 'title' | 'updated_at'>[];

        return { success: true, records };
    } catch (error: unknown) {
        logger.error('Get mindmaps failed:', error);
        return { success: false, message: '获取图谱列表失败' };
    }
}

export async function getMindmapDetailAction(id: number) {
    try {
        const user = await requireUser();

        const record = db.prepare(`
            SELECT * FROM mindmaps WHERE id = ? AND user_id = ?
        `).get(id, user.id) as Mindmap | undefined;

        if (!record) {
            return { success: false, message: '导图不存在' };
        }

        return { success: true, data: record };
    } catch (error: unknown) {
        logger.error('Get mindmap detail failed:', error);
        return { success: false, message: '获取详情失败' };
    }
}
