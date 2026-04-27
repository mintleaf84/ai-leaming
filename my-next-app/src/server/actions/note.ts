'use server';

import logger from '@/lib/logger';
import { requireUser } from '@/lib/auth/auth';
import { revalidatePath } from 'next/cache';
import { WELCOME_NOTE_CONTENT } from '@/lib/content/welcome';
import { 
    knowledgeService, 
    type Note, 
    type NotePreview, 
    type CreateNoteInput, 
    type UpdateNoteInput 
} from '@/lib/services/knowledge';

/**
 * 导出类型供外部使用
 */
export type { Note, NotePreview, CreateNoteInput, UpdateNoteInput };

/**
 * 创建欢迎笔记
 */
export async function createWelcomeNoteAction() {
    return createNoteAction({
        title: '👋 欢迎使用智能笔记',
        content: JSON.stringify(WELCOME_NOTE_CONTENT),
    });
}

/**
 * 创建笔记
 */
export async function createNoteAction(input: CreateNoteInput = {}) {
    try {
        const user = await requireUser();
        const noteId = await knowledgeService.createNote(user.id, input.title, input.content);

        revalidatePath('/notes');
        return { success: true, noteId };
    } catch (error: unknown) {
        logger.error({ err: error }, '[NoteAction] 创建笔记失败');
        return { success: false, message: '创建笔记失败' };
    }
}

/**
 * 更新笔记
 */
export async function updateNoteAction(input: UpdateNoteInput) {
    try {
        const user = await requireUser();
        await knowledgeService.updateNote(user.id, input.id, { 
            title: input.title, 
            content: input.content 
        });

        revalidatePath('/notes');
        revalidatePath(`/notes/${input.id}`);
        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, '[NoteAction] 更新笔记失败');
        const message = error instanceof Error ? error.message : '保存笔记失败';
        return { success: false, message };
    }
}

/**
 * 删除笔记
 */
export async function deleteNoteAction(id: number) {
    try {
        const user = await requireUser();
        await knowledgeService.deleteNote(user.id, id);

        revalidatePath('/notes');
        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, '[NoteAction] 删除笔记失败');
        return { success: false, message: '删除笔记失败' };
    }
}

/**
 * 获取笔记列表
 */
export async function getNotesAction() {
    try {
        const user = await requireUser();
        const notes = await knowledgeService.getNoteList(user.id);
        return { success: true, notes };
    } catch (error: unknown) {
        logger.error({ err: error }, '[NoteAction] 获取列表失败');
        return { success: false, message: '获取笔记列表失败' };
    }
}

/**
 * 获取笔记详情
 */
export async function getNoteDetailAction(id: number) {
    try {
        const user = await requireUser();
        const note = await knowledgeService.getNoteDetail(user.id, id);
        return { success: true, note };
    } catch (error: unknown) {
        logger.error({ err: error }, '[NoteAction] 获取详情失败');
        const message = error instanceof Error ? error.message : '获取笔记详情失败';
        return { success: false, message };
    }
}

/**
 * 搜索笔记
 */
export async function searchNotesAction(query: string) {
    try {
        const user = await requireUser();
        if (!query.trim()) return getNotesAction();

        const notes = await knowledgeService.searchNotes(user.id, query);
        return { success: true, notes };
    } catch (error: unknown) {
        logger.error({ err: error }, '[NoteAction] 搜索失败');
        return { success: false, message: '搜索笔记失败' };
    }
}
