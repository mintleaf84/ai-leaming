'use server';
import logger from '@/lib/logger';

import { drizzleDb } from '@/lib/db';
import { mindmaps } from '@/lib/db/drizzle-schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireUser } from '@/lib/auth/auth';
import { revalidatePath } from 'next/cache';
import type { InferSelectModel } from 'drizzle-orm';

export type Mindmap = InferSelectModel<typeof mindmaps>;

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

        const [result] = await drizzleDb.insert(mindmaps).values({
            user_id: user.id,
            title,
            content,
        }).returning({ id: mindmaps.id });

        revalidatePath('/mindmap');
        return { success: true, id: result.id };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Create mindmap failed');
        return { success: false, message: '创建思维导图失败' };
    }
}

export async function updateMindmapAction(input: UpdateMindmapInput) {
    try {
        const user = await requireUser();
        const { id, title, content } = input;

        const [existing] = await drizzleDb.select({ id: mindmaps.id })
            .from(mindmaps)
            .where(and(eq(mindmaps.id, id), eq(mindmaps.user_id, user.id)))
            .limit(1);

        if (!existing) {
            return { success: false, message: '脑图不存在或无权限' };
        }

        const updateData: Partial<typeof mindmaps.$inferInsert> = {};
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;

        if (Object.keys(updateData).length === 0) return { success: true };

        await drizzleDb.update(mindmaps)
            .set({
                ...updateData,
                updated_at: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(mindmaps.id, id), eq(mindmaps.user_id, user.id)));

        revalidatePath('/mindmap');
        revalidatePath(`/mindmap/${id}`);
        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Update mindmap failed');
        return { success: false, message: '保存思维导图失败' };
    }
}

export async function deleteMindmapAction(id: number) {
    try {
        const user = await requireUser();

        await drizzleDb.delete(mindmaps)
            .where(and(eq(mindmaps.id, id), eq(mindmaps.user_id, user.id)));

        revalidatePath('/mindmap');
        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Delete mindmap failed');
        return { success: false, message: '删除失败' };
    }
}

export async function getMindmapsAction() {
    try {
        const user = await requireUser();

        const records = await drizzleDb.select({
                id: mindmaps.id,
                title: mindmaps.title,
                updated_at: mindmaps.updated_at
            })
            .from(mindmaps)
            .where(eq(mindmaps.user_id, user.id))
            .orderBy(desc(mindmaps.updated_at));

        return { success: true, records };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Get mindmaps failed');
        return { success: false, message: '获取图谱列表失败' };
    }
}

export async function getMindmapDetailAction(id: number) {
    try {
        const user = await requireUser();

        const [record] = await drizzleDb.select()
            .from(mindmaps)
            .where(and(eq(mindmaps.id, id), eq(mindmaps.user_id, user.id)))
            .limit(1);

        if (!record) {
            return { success: false, message: '导图不存在' };
        }

        return { success: true, data: record as Mindmap };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Get mindmap detail failed');
        return { success: false, message: '获取详情失败' };
    }
}
