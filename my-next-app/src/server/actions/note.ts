'use server';
import logger from '@/lib/logger';

import { drizzleDb } from '@/lib/db';
import { notes } from '@/lib/db/drizzle-schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireUser } from '@/lib/auth/auth';
import { revalidatePath } from 'next/cache';
import { WELCOME_NOTE_CONTENT } from '@/lib/content/welcome';
import type { InferSelectModel } from 'drizzle-orm';

export async function createWelcomeNoteAction() {
    return createNoteAction({
        title: '👋 欢迎使用智能笔记',
        content: JSON.stringify(WELCOME_NOTE_CONTENT),
    });
}

/** 笔记全量类型 */
export type Note = InferSelectModel<typeof notes>;

/** 笔记列表项（不含完整内容） */
export type NotePreview = Pick<Note, 'id' | 'title' | 'updated_at'> & {
    preview: string | null;
};

export type CreateNoteInput = {
    title?: string;
    content?: string;
};

export type UpdateNoteInput = {
    id: number;
    title?: string;
    content?: string;
};

export async function createNoteAction(input: CreateNoteInput = {}) {
    try {
        const user = await requireUser();
        const { title = '无标题', content = null } = input;

        const [result] = await drizzleDb.insert(notes).values({
            user_id: user.id,
            title,
            content,
        }).returning({ id: notes.id });

        revalidatePath('/notes');
        return { success: true, noteId: result.id };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Create note failed');
        return { success: false, message: '创建笔记失败' };
    }
}

export async function updateNoteAction(input: UpdateNoteInput) {
    try {
        const user = await requireUser();
        const { id, title, content } = input;

        // 验证所有权
        const [existing] = await drizzleDb.select({ id: notes.id })
            .from(notes)
            .where(and(eq(notes.id, id), eq(notes.user_id, user.id)))
            .limit(1);

        if (!existing) {
            return { success: false, message: '笔记不存在或无权限' };
        }

        const updateData: Partial<typeof notes.$inferInsert> = {};
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;
        
        if (Object.keys(updateData).length === 0) return { success: true };

        await drizzleDb.update(notes)
            .set({
                ...updateData,
                updated_at: sql`CURRENT_TIMESTAMP`, // 显式更新时间戳
            })
            .where(eq(notes.id, id));

        revalidatePath('/notes');
        revalidatePath(`/notes/${id}`);
        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Update note failed');
        return { success: false, message: '保存笔记失败' };
    }
}

export async function deleteNoteAction(id: number) {
    try {
        const user = await requireUser();

        await drizzleDb.delete(notes)
            .where(and(eq(notes.id, id), eq(notes.user_id, user.id)));

        // 注意：libsql 的 delete 返回结果可能不同，这里依赖成功执行即为成功
        revalidatePath('/notes');
        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Delete note failed');
        return { success: false, message: '删除笔记失败' };
    }
}

export async function getNotesAction() {
    try {
        const user = await requireUser();

        const result = await drizzleDb.select({
            id: notes.id,
            title: notes.title,
            updated_at: notes.updated_at,
            preview: sql<string>`substr(${notes.content}, 1, 200)`
        })
        .from(notes)
        .where(eq(notes.user_id, user.id))
        .orderBy(desc(notes.updated_at));

        return { success: true, notes: result as NotePreview[] };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Get notes failed');
        return { success: false, message: '获取笔记列表失败' };
    }
}

export async function getNoteDetailAction(id: number) {
    try {
        const user = await requireUser();

        const [note] = await drizzleDb.select()
            .from(notes)
            .where(and(eq(notes.id, id), eq(notes.user_id, user.id)))
            .limit(1);

        if (!note) {
            return { success: false, message: '笔记不存在' };
        }

        return { success: true, note: note as Note };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Get note detail failed');
        return { success: false, message: '获取笔记详情失败' };
    }
}

export async function searchNotesAction(query: string) {
    try {
        const user = await requireUser();

        if (!query.trim()) {
            return getNotesAction();
        }

        const searchPattern = `%${query}%`;

        const result = await drizzleDb.select({
            id: notes.id,
            title: notes.title,
            updated_at: notes.updated_at,
            preview: sql<string>`substr(${notes.content}, 1, 200)`
        })
        .from(notes)
        .where(
            and(
                eq(notes.user_id, user.id),
                sql`(${notes.title} LIKE ${searchPattern} OR ${notes.content} LIKE ${searchPattern})`
            )
        )
        .orderBy(desc(notes.updated_at))
        .limit(50);

        return { success: true, notes: result as NotePreview[] };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Search notes failed');
        return { success: false, message: '搜索笔记失败' };
    }
}
