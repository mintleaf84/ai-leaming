'use server';

import logger from '@/lib/logger';
import { requireUser } from '@/lib/auth/auth';
import { revalidatePath } from 'next/cache';
import { knowledgeService, type NoteTag } from '@/lib/services/knowledge';
import { isSqliteConstraintError } from '@/lib/utils/error';

/**
 * 获取用户的所有标签
 */
export async function getTagsAction() {
    try {
        const user = await requireUser();
        const tags = await knowledgeService.getTags(user.id);
        return { success: true, tags };
    } catch (error: unknown) {
        logger.error({ err: error }, '[TagAction] 获取标签失败');
        return { success: false, message: '获取标签失败' };
    }
}

/**
 * 创建新标签
 */
export async function createTagAction(name: string, color?: string) {
    try {
        const user = await requireUser();
        const tagId = await knowledgeService.createTag(user.id, name, color);

        revalidatePath('/notes');
        return { success: true, tagId };
    } catch (error: unknown) {
        if (isSqliteConstraintError(error, 'SQLITE_CONSTRAINT_UNIQUE')) {
            return { success: false, message: '标签名已存在' };
        }
        logger.error({ err: error }, '[TagAction] 创建标签失败');
        return { success: false, message: '创建标签失败' };
    }
}

/**
 * 删除标签
 */
export async function deleteTagAction(tagId: number) {
    try {
        const user = await requireUser();
        await knowledgeService.deleteTag(user.id, tagId);

        revalidatePath('/notes');
        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, '[TagAction] 删除标签失败');
        return { success: false, message: '删除标签失败' };
    }
}

/**
 * 获取笔记的标签
 */
export async function getNoteTagsAction(noteId: number) {
    try {
        const user = await requireUser();
        const tags = await knowledgeService.getNoteTags(user.id, noteId);
        return { success: true, tags };
    } catch (error: unknown) {
        logger.error({ err: error }, '[TagAction] 获取笔记标签失败');
        return { success: false, message: '获取笔记标签失败' };
    }
}

/**
 * 设置笔记的标签（替换所有）
 */
export async function setNoteTagsAction(noteId: number, tagIds: number[]) {
    try {
        const user = await requireUser();
        await knowledgeService.setNoteTags(user.id, noteId, tagIds);

        revalidatePath('/notes');
        revalidatePath(`/notes/${noteId}`);
        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, '[TagAction] 设置标签失败');
        const message = error instanceof Error ? error.message : '设置标签失败';
        return { success: false, message };
    }
}

/**
 * 按标签筛选笔记
 */
export async function getNotesByTagAction(tagId: number) {
    try {
        const user = await requireUser();
        const notes = await knowledgeService.getNotesByTag(user.id, tagId);
        return { success: true, notes };
    } catch (error: unknown) {
        logger.error({ err: error }, '[TagAction] 筛选失败');
        return { success: false, message: '获取笔记失败' };
    }
}
