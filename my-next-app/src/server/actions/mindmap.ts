'use server';

import logger from '@/lib/logger';
import { requireUser } from '@/lib/auth/auth';
import { revalidatePath } from 'next/cache';
import { 
    mindmapService, 
    type CreateMindmapInput, 
    type UpdateMindmapInput 
} from '@/lib/services/mindmap';

/**
 * 创建思维导图
 */
export async function createMindmapAction(input: CreateMindmapInput = {}) {
    try {
        const user = await requireUser();
        const id = await mindmapService.create(user.id, input);
        
        revalidatePath('/mindmap');
        return { success: true, id };
    } catch (error: unknown) {
        logger.error({ err: error }, '[MindmapAction] 创建失败');
        return { success: false, message: '创建思维导图失败' };
    }
}

/**
 * 更新思维导图内容
 */
export async function updateMindmapAction(input: UpdateMindmapInput) {
    try {
        const user = await requireUser();
        await mindmapService.update(user.id, input);

        revalidatePath('/mindmap');
        revalidatePath(`/mindmap/${input.id}`);
        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, '[MindmapAction] 更新失败');
        const message = error instanceof Error ? error.message : '保存思维导图失败';
        return { success: false, message };
    }
}

/**
 * 删除思维导图
 */
export async function deleteMindmapAction(id: number) {
    try {
        const user = await requireUser();
        await mindmapService.delete(user.id, id);

        revalidatePath('/mindmap');
        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, '[MindmapAction] 删除失败');
        return { success: false, message: '删除失败' };
    }
}

/**
 * 获取用户的思维导图列表
 */
export async function getMindmapsAction() {
    try {
        const user = await requireUser();
        const records = await mindmapService.getList(user.id);
        return { success: true, records };
    } catch (error: unknown) {
        logger.error({ err: error }, '[MindmapAction] 获取列表失败');
        return { success: false, message: '获取图谱列表失败' };
    }
}

/**
 * 获取思维导图详情
 */
export async function getMindmapDetailAction(id: number) {
    try {
        const user = await requireUser();
        const data = await mindmapService.getDetail(user.id, id);
        return { success: true, data };
    } catch (error: unknown) {
        logger.error({ err: error }, '[MindmapAction] 获取详情失败');
        const message = error instanceof Error ? error.message : '获取详情失败';
        return { success: false, message };
    }
}
