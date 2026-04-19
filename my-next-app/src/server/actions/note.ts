'use server';

import db from '@/lib/db';
import { requireUser } from '@/lib/auth/auth';
import { revalidatePath } from 'next/cache';
import { WELCOME_NOTE_CONTENT } from '@/lib/content/welcome';

export async function createWelcomeNoteAction() {
    return createNoteAction({
        title: '👋 欢迎使用智能笔记',
        content: JSON.stringify(WELCOME_NOTE_CONTENT),
    });
}

export interface Note {
    id: number;
    user_id: number;
    title: string;
    content: string | null;
    created_at: string;
    updated_at: string;
}

/** 笔记列表项（不含完整内容） */
export interface NotePreview {
    id: number;
    title: string;
    updated_at: string;
    preview: string | null;
}

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

        const stmt = db.prepare(`
            INSERT INTO notes (user_id, title, content)
            VALUES (?, ?, ?)
        `);

        const result = stmt.run(user.id, title, content);

        revalidatePath('/notes');
        return { success: true, noteId: result.lastInsertRowid };
    } catch (error: unknown) {
        console.error('Create note failed:', error);
        return { success: false, message: '创建笔记失败' };
    }
}

export async function updateNoteAction(input: UpdateNoteInput) {
    try {
        const user = await requireUser();
        const { id, title, content } = input;

        // Ensure ownership
        const existing = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(id, user.id);
        if (!existing) {
            return { success: false, message: '笔记不存在或无权限' };
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
            UPDATE notes 
            SET ${updates.join(', ')} 
            WHERE id = ?
        `);

        stmt.run(...params);

        revalidatePath('/notes');
        revalidatePath(`/notes/${id}`);
        return { success: true };
    } catch (error: unknown) {
        console.error('Update note failed:', error);
        return { success: false, message: '保存笔记失败' };
    }
}

export async function deleteNoteAction(id: number) {
    try {
        const user = await requireUser();

        const stmt = db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?');
        const result = stmt.run(id, user.id);

        if (result.changes === 0) {
            return { success: false, message: '笔记不存在或无权限' };
        }

        revalidatePath('/notes');
        return { success: true };
    } catch (error: unknown) {
        console.error('Delete note failed:', error);
        return { success: false, message: '删除笔记失败' };
    }
}

export async function getNotesAction() {
    try {
        const user = await requireUser();

        const notes = db.prepare(`
            SELECT id, title, updated_at, substr(content, 1, 100) as preview
            FROM notes 
            WHERE user_id = ? 
            ORDER BY updated_at DESC
        `).all(user.id) as NotePreview[];

        return { success: true, notes };
    } catch (error: unknown) {
        console.error('Get notes failed:', error);
        return { success: false, message: '获取笔记列表失败' };
    }
}

export async function getNoteDetailAction(id: number) {
    try {
        const user = await requireUser();

        const note = db.prepare(`
            SELECT * FROM notes WHERE id = ? AND user_id = ?
        `).get(id, user.id) as Note | undefined;

        if (!note) {
            return { success: false, message: '笔记不存在' };
        }

        return { success: true, note };
    } catch (error: unknown) {
        console.error('Get note detail failed:', error);
        return { success: false, message: '获取笔记详情失败' };
    }
}

export async function searchNotesAction(query: string) {
    try {
        const user = await requireUser();

        if (!query.trim()) {
            // 空查询返回全部笔记
            return getNotesAction();
        }

        const searchPattern = `%${query}%`;

        const notes = db.prepare(`
            SELECT id, title, updated_at, substr(content, 1, 200) as preview
            FROM notes 
            WHERE user_id = ? AND (title LIKE ? OR content LIKE ?)
            ORDER BY updated_at DESC
            LIMIT 50
        `).all(user.id, searchPattern, searchPattern) as NotePreview[];

        return { success: true, notes };
    } catch (error: unknown) {
        console.error('Search notes failed:', error);
        return { success: false, message: '搜索笔记失败' };
    }
}
