'use server';
import logger from '@/lib/logger';

import { drizzleDb } from '@/lib/db';
import { notes, note_tags, note_tag_relations } from '@/lib/db/drizzle-schema';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { requireUser } from '@/lib/auth/auth';
import { revalidatePath } from 'next/cache';
import { TAG_COLORS } from '@/types';
import type { NoteTag } from '@/types';
import { isSqliteConstraintError } from '@/lib/utils/error';
import type { NotePreview } from './note';

// 获取用户的所有标签
export async function getTagsAction() {
    try {
        const user = await requireUser();
        const tags = await drizzleDb.select()
            .from(note_tags)
            .where(eq(note_tags.user_id, user.id))
            .orderBy(asc(note_tags.name));
            
        return { success: true, tags: tags as NoteTag[] };
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

        const [result] = await drizzleDb.insert(note_tags).values({
            user_id: user.id,
            name: name.trim(),
            color: tagColor,
        }).returning({ id: note_tags.id });

        revalidatePath('/notes');
        return { success: true, tagId: result.id };
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
        
        await drizzleDb.delete(note_tags)
            .where(and(eq(note_tags.id, tagId), eq(note_tags.user_id, user.id)));

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
        const [note] = await drizzleDb.select({ id: notes.id })
            .from(notes)
            .where(and(eq(notes.id, noteId), eq(notes.user_id, user.id)))
            .limit(1);

        if (!note) {
            return { success: false, message: '笔记不存在' };
        }

        const tags = await drizzleDb.select({
                id: note_tags.id,
                user_id: note_tags.user_id,
                name: note_tags.name,
                color: note_tags.color,
                created_at: note_tags.created_at
            })
            .from(note_tags)
            .innerJoin(note_tag_relations, eq(note_tags.id, note_tag_relations.tag_id))
            .where(eq(note_tag_relations.note_id, noteId));

        return { success: true, tags: tags as NoteTag[] };
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
        const [note] = await drizzleDb.select({ id: notes.id })
            .from(notes)
            .where(and(eq(notes.id, noteId), eq(notes.user_id, user.id)))
            .limit(1);

        if (!note) {
            return { success: false, message: '笔记不存在' };
        }

        // 使用事务
        await drizzleDb.transaction(async (tx) => {
            // 删除现有关联
            await tx.delete(note_tag_relations).where(eq(note_tag_relations.note_id, noteId));

            // 添加新关联
            if (tagIds.length > 0) {
                const values = tagIds.map(tagId => ({
                    note_id: noteId,
                    tag_id: tagId,
                }));
                // Drizzle 的 insert().values() 支持数组批量插入
                await tx.insert(note_tag_relations).values(values).onConflictDoNothing();
            }
        });

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

        const result = await drizzleDb.select({
                id: notes.id,
                title: notes.title,
                updated_at: notes.updated_at,
                preview: sql<string>`substr(${notes.content}, 1, 200)` // 统一使用 200 字预览
            })
            .from(notes)
            .innerJoin(note_tag_relations, eq(notes.id, note_tag_relations.note_id))
            .where(and(eq(notes.user_id, user.id), eq(note_tag_relations.tag_id, tagId)))
            .orderBy(desc(notes.updated_at));

        return { success: true, notes: result as NotePreview[] };
    } catch (error: unknown) {
        logger.error({ err: error }, 'Get notes by tag failed');
        return { success: false, message: '获取笔记失败' };
    }
}
