'use server';
import logger from '@/lib/logger';

import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/auth';
import { revalidatePath } from 'next/cache';
import { TAG_COLORS, type NoteTag } from '@/types';
import { isSqliteConstraintError } from '@/lib/utils/error';

// 获取用户的所有标签
export async function getTagsAction() {
    try {
        const user = await requireUser();
        const tags = db.prepare(`
            SELECT * FROM note_tags WHERE user_id = ? ORDER BY name
        `).all(user.id) as NoteTag[];
        return { success: true, tags };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Get tags failed');
        return { success: false, message: '获取标签失败' };
    }
}

// 创建新标签
export async function createTagAction(name: string, color?: string) {
    try {
        const user = await requireUser();
        const tagColor = color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];

        const stmt = db.prepare(`
            INSERT INTO note_tags (user_id, name, color) VALUES (?, ?, ?)
        `);
        const result = stmt.run(user.id, name.trim(), tagColor);

        revalidatePath('/notes');
        return { success: true, tagId: result.lastInsertRowid };
    } catch (error: unknown) {
        if (isSqliteConstraintError(error, 'SQLITE_CONSTRAINT_UNIQUE')) {
            return { success: false, message: '标签名已存在' };
        }
        logger.error({ err: error }, 'Create tag failed');
        return { success: false, message: '创建标签失败' };
    }
}

// 删除标签
export async function deleteTagAction(tagId: number) {
    try {
        const user = await requireUser();
        const stmt = db.prepare(`
            DELETE FROM note_tags WHERE id = ? AND user_id = ?
        `);
        const result = stmt.run(tagId, user.id);

        if (result.changes === 0) {
            return { success: false, message: '标签不存在或无权限' };
        }

        revalidatePath('/notes');
        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Delete tag failed');
        return { success: false, message: '删除标签失败' };
    }
}

// 获取笔记的标签
export async function getNoteTagsAction(noteId: number) {
    try {
        const user = await requireUser();

        // 验证笔记所有权
        const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(noteId, user.id);
        if (!note) {
            return { success: false, message: '笔记不存在' };
        }

        const tags = db.prepare(`
            SELECT t.* FROM note_tags t
            JOIN note_tag_relations r ON t.id = r.tag_id
            WHERE r.note_id = ?
        `).all(noteId) as NoteTag[];

        return { success: true, tags };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Get note tags failed');
        return { success: false, message: '获取笔记标签失败' };
    }
}

// 设置笔记的标签（替换所有）
export async function setNoteTagsAction(noteId: number, tagIds: number[]) {
    try {
        const user = await requireUser();

        // 验证笔记所有权
        const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(noteId, user.id);
        if (!note) {
            return { success: false, message: '笔记不存在' };
        }

        // 使用事务
        db.transaction(() => {
            // 删除现有关联
            db.prepare('DELETE FROM note_tag_relations WHERE note_id = ?').run(noteId);

            // 添加新关联
            if (tagIds.length > 0) {
                const insertStmt = db.prepare('INSERT OR IGNORE INTO note_tag_relations (note_id, tag_id) VALUES (?, ?)');
                for (const tagId of tagIds) {
                    insertStmt.run(noteId, tagId);
                }
            }
        })();

        revalidatePath('/notes');
        revalidatePath(`/notes/${noteId}`);
        return { success: true };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Set note tags failed');
        return { success: false, message: '设置标签失败' };
    }
}

// 按标签筛选笔记
export async function getNotesByTagAction(tagId: number) {
    try {
        const user = await requireUser();

        const notes = db.prepare(`
            SELECT n.id, n.title, n.updated_at, substr(n.content, 1, 100) as preview
            FROM notes n
            JOIN note_tag_relations r ON n.id = r.note_id
            WHERE n.user_id = ? AND r.tag_id = ?
            ORDER BY n.updated_at DESC
        `).all(user.id, tagId) as { id: number; title: string; updated_at: string; preview: string | null }[];

        return { success: true, notes };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Get notes by tag failed');
        return { success: false, message: '获取笔记失败' };
    }
}
