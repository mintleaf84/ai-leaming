import { drizzleDb, drizzleSchema } from '@/lib/db';
import { notes, note_tags, note_tag_relations } from '@/lib/db/drizzle-schema';
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { TAG_COLORS } from '@/types';
import { ragService } from '@/lib/ai/rag';

/**
 * 知识卡片相关类型
 */
export interface KnowledgeCard {
    id?: number;
    session_id?: number;
    title: string;
    category: string;
    tags: string[];
    front: string;        // 卡片正面（问题）
    back: string;         // 卡片背面（答案）
    key_points: { term: string; definition: string }[];
    suggestions?: string[]; // AI 建议的其他提取方向（不入库，仅用于前端交互）
    source_content?: string;
    created_at?: string;
    updated_at?: string;
}

/**
 * 笔记相关类型
 */
export type Note = InferSelectModel<typeof notes>;
export type NoteTag = InferSelectModel<typeof note_tags>;

export type NotePreview = Pick<Note, 'id' | 'title' | 'updated_at'> & {
    preview: string | null;
};

export interface CreateNoteInput {
    title?: string;
    content?: string;
}

export interface UpdateNoteInput {
    id: number;
    title?: string;
    content?: string;
}

/**
 * --- 知识卡片服务函数 ---
 */

/**
 * 创建知识卡片
 */
export async function createKnowledgeCard(card: KnowledgeCard, userId?: number): Promise<number> {
    const result = await drizzleDb.insert(drizzleSchema.knowledge_cards).values({
        user_id: userId || 1,
        session_id: card.session_id || null,
        title: card.title,
        category: card.category || '',
        tags: JSON.stringify(card.tags || []),
        front: card.front,
        back: card.back,
        key_points: JSON.stringify(card.key_points || []),
        source_content: card.source_content || ''
    });

    const cardId = Number(result.lastInsertRowid);

    // RAG Sync (Async but awaited)
    try {
        const content = `${card.front}\n\n${card.back}`;
        await ragService.addChunk(content, {
            source_type: 'card',
            source_id: cardId,
            title: card.title,
            category: card.category,
            tags: card.tags
        });
    } catch (e) {
        console.error(`[KnowledgeService] Failed to sync RAG for card ${cardId}`, e);
    }

    return cardId;
}

/**
 * 获取知识卡片列表
 */
export async function getAllKnowledgeCards(category?: string, limit: number = 100, ids?: number[], userId?: number): Promise<KnowledgeCard[]> {
    const conditions = [];
    if (category) {
        conditions.push(eq(drizzleSchema.knowledge_cards.category, category));
    }
    if (ids && ids.length > 0) {
        conditions.push(inArray(drizzleSchema.knowledge_cards.id, ids));
    }
    if (userId) {
        conditions.push(eq(drizzleSchema.knowledge_cards.user_id, userId));
    }

    const rows = await drizzleDb.select()
        .from(drizzleSchema.knowledge_cards)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(drizzleSchema.knowledge_cards.created_at))
        .limit(limit);

    return rows.map(row => ({
        ...row,
        tags: JSON.parse(row.tags || '[]') as string[],
        key_points: JSON.parse(row.key_points || '[]') as { term: string; definition: string }[],
    })) as KnowledgeCard[];
}

/**
 * 获取单个知识卡片
 */
export async function getKnowledgeCard(id: number): Promise<KnowledgeCard | null> {
    const row = await drizzleDb.query.knowledge_cards.findFirst({
        where: eq(drizzleSchema.knowledge_cards.id, id)
    });

    if (!row) return null;

    return {
        ...row,
        tags: JSON.parse(row.tags || '[]') as string[],
        key_points: JSON.parse(row.key_points || '[]') as { term: string; definition: string }[],
    } as KnowledgeCard;
}

/**
 * 更新知识卡片
 */
export async function updateKnowledgeCard(id: number, updates: Partial<KnowledgeCard>): Promise<boolean> {
    const updatesObj: Record<string, unknown> = {
        updated_at: sql`CURRENT_TIMESTAMP`
    };

    if (updates.title !== undefined) updatesObj.title = updates.title;
    if (updates.category !== undefined) updatesObj.category = updates.category;
    if (updates.tags !== undefined) updatesObj.tags = JSON.stringify(updates.tags);
    if (updates.front !== undefined) updatesObj.front = updates.front;
    if (updates.back !== undefined) updatesObj.back = updates.back;
    if (updates.key_points !== undefined) updatesObj.key_points = JSON.stringify(updates.key_points);

    const result = await drizzleDb.update(drizzleSchema.knowledge_cards)
        .set(updatesObj)
        .where(eq(drizzleSchema.knowledge_cards.id, id));
    
    const success = result.rowsAffected > 0;

    if (success) {
        // RAG Sync: Delete old, add new
        try {
            ragService.deleteChunksBySource('card', id);

            // Fetch full card to re-index
            const card = await getKnowledgeCard(id);
            if (card) {
                const content = `${card.front}\n\n${card.back}`;
                await ragService.addChunk(content, {
                    source_type: 'card',
                    source_id: id,
                    title: card.title,
                    category: card.category,
                    tags: card.tags
                });
            }
        } catch (e) {
            console.error(`[KnowledgeService] Failed to update RAG for card ${id}`, e);
        }
    }

    return success;
}

/**
 * 删除知识卡片
 */
export async function deleteKnowledgeCard(id: number): Promise<boolean> {
    const result = await drizzleDb.delete(drizzleSchema.knowledge_cards)
        .where(eq(drizzleSchema.knowledge_cards.id, id));
    const success = result.rowsAffected > 0;

    if (success) {
        try {
            ragService.deleteChunksBySource('card', id);
        } catch (e) {
            console.error(`[KnowledgeService] Failed to delete RAG for card ${id}`, e);
        }
    }

    return success;
}

/**
 * 获取所有分类
 */
export async function getCategories(): Promise<string[]> {
    const rows = await drizzleDb.select({ category: drizzleSchema.knowledge_cards.category })
        .from(drizzleSchema.knowledge_cards)
        .where(and(
            sql`${drizzleSchema.knowledge_cards.category} IS NOT NULL`,
            sql`${drizzleSchema.knowledge_cards.category} != ''`
        ))
        .groupBy(drizzleSchema.knowledge_cards.category)
        .orderBy(drizzleSchema.knowledge_cards.category)
        .all();
    return rows.map(row => row.category as string);
}

/**
 * 导出为 Anki TSV 格式
 * 格式: front<TAB>back<TAB>tags
 */
export function exportToAnkiTSV(cards: KnowledgeCard[]): string {
    const lines: string[] = [];

    for (const card of cards) {
        // 构建 Anki 标签：category::tag1 tag2
        const ankiTags: string[] = [];
        if (card.category) {
            ankiTags.push(card.category.replace(/\s+/g, '_'));
        }
        if (card.tags && card.tags.length > 0) {
            ankiTags.push(...card.tags.map(t => t.replace(/\s+/g, '_')));
        }

        // 构建卡片背面内容（包含关键点）
        let backContent = card.back || '';
        if (card.key_points && card.key_points.length > 0) {
            backContent += '\n\n【关键点】\n';
            backContent += card.key_points.map(kp => `• ${kp.term}: ${kp.definition}`).join('\n');
        }

        // 转义制表符和换行符
        const front = (card.front || card.title).replace(/\t/g, ' ').replace(/\n/g, '<br>');
        const back = backContent.replace(/\t/g, ' ').replace(/\n/g, '<br>');
        const tags = ankiTags.join(' ');

        lines.push(`${front}\t${back}\t${tags}`);
    }

    return lines.join('\n');
}

/**
 * 获取知识卡片统计
 */
export async function getKnowledgeStats(userId?: number): Promise<{ total: number; byCategory: { category: string; count: number }[] }> {
    const conditions: unknown[] = [];
    if (userId) {
        conditions.push(eq(drizzleSchema.knowledge_cards.user_id, userId));
    }
    const totalResult = await drizzleDb.select({ count: sql<number>`count(*)` })
        .from(drizzleSchema.knowledge_cards)
        .where(conditions.length > 0 ? and(...conditions as Parameters<typeof and>) : undefined)
        .get();
    
    const catConditions: unknown[] = [
        sql`${drizzleSchema.knowledge_cards.category} IS NOT NULL`,
        sql`${drizzleSchema.knowledge_cards.category} != ''`
    ];
    if (userId) {
        catConditions.push(eq(drizzleSchema.knowledge_cards.user_id, userId));
    }
    const byCategory = await drizzleDb.select({
        category: drizzleSchema.knowledge_cards.category,
        count: sql<number>`count(*)`
    })
    .from(drizzleSchema.knowledge_cards)
    .where(and(...catConditions as Parameters<typeof and>))
    .groupBy(drizzleSchema.knowledge_cards.category)
    .orderBy(desc(sql`count(*)`))
    .all();

    return { 
        total: totalResult?.count || 0, 
        byCategory: byCategory as { category: string; count: number }[] 
    };
}

export async function getCategories(userId?: number): Promise<string[]> {
    const conditions: unknown[] = [
        sql`${drizzleSchema.knowledge_cards.category} IS NOT NULL`,
        sql`${drizzleSchema.knowledge_cards.category} != ''`
    ];
    if (userId) {
        conditions.push(eq(drizzleSchema.knowledge_cards.user_id, userId));
    }
    const rows = await drizzleDb.select({ category: drizzleSchema.knowledge_cards.category })
        .from(drizzleSchema.knowledge_cards)
        .where(and(...conditions as Parameters<typeof and>))
        .groupBy(drizzleSchema.knowledge_cards.category)
        .orderBy(drizzleSchema.knowledge_cards.category)
        .all();
    return rows.map(row => row.category as string);
}

/**
 * --- 笔记服务 (knowledgeService 对象) ---
 */
export const knowledgeService = {
    /**
     * 创建笔记
     */
    async createNote(userId: number, title: string = '无标题', content: string | null = null) {
        const [result] = await drizzleDb.insert(notes).values({
            user_id: userId,
            title,
            content,
        }).returning({ id: notes.id });
        return result.id;
    },

    /**
     * 更新笔记 (带所有权校验)
     */
    async updateNote(userId: number, noteId: number, data: { title?: string; content?: string }) {
        const [existing] = await drizzleDb.select({ id: notes.id })
            .from(notes)
            .where(and(eq(notes.id, noteId), eq(notes.user_id, userId)))
            .limit(1);

        if (!existing) throw new Error('笔记不存在或无权限');

        const updateData: Record<string, unknown> = {
            updated_at: sql`CURRENT_TIMESTAMP`
        };
        if (data.title !== undefined) updateData.title = data.title;
        if (data.content !== undefined) updateData.content = data.content;

        await drizzleDb.update(notes).set(updateData).where(eq(notes.id, noteId));
        return true;
    },

    /**
     * 删除笔记 (带所有权校验)
     */
    async deleteNote(userId: number, noteId: number) {
        await drizzleDb.delete(notes)
            .where(and(eq(notes.id, noteId), eq(notes.user_id, userId)));
        return true;
    },

    /**
     * 获取笔记列表
     */
    async getNoteList(userId: number): Promise<NotePreview[]> {
        return await drizzleDb.select({
            id: notes.id,
            title: notes.title,
            updated_at: notes.updated_at,
            preview: sql<string>`substr(${notes.content}, 1, 200)`
        })
        .from(notes)
        .where(eq(notes.user_id, userId))
        .orderBy(desc(notes.updated_at)) as NotePreview[];
    },

    /**
     * 搜索笔记
     */
    async searchNotes(userId: number, query: string): Promise<NotePreview[]> {
        const searchPattern = `%${query}%`;
        return await drizzleDb.select({
            id: notes.id,
            title: notes.title,
            updated_at: notes.updated_at,
            preview: sql<string>`substr(${notes.content}, 1, 200)`
        })
        .from(notes)
        .where(
            and(
                eq(notes.user_id, userId),
                sql`(${notes.title} LIKE ${searchPattern} OR ${notes.content} LIKE ${searchPattern})`
            )
        )
        .orderBy(desc(notes.updated_at))
        .limit(50) as NotePreview[];
    },

    /**
     * 获取笔记详情
     */
    async getNoteDetail(userId: number, noteId: number): Promise<Note> {
        const [note] = await drizzleDb.select()
            .from(notes)
            .where(and(eq(notes.id, noteId), eq(notes.user_id, userId)))
            .limit(1);

        if (!note) throw new Error('笔记不存在');
        return note as Note;
    },

    /** --- 标签相关 --- **/

    /**
     * 获取用户所有标签
     */
    async getTags(userId: number): Promise<NoteTag[]> {
        return await drizzleDb.select()
            .from(note_tags)
            .where(eq(note_tags.user_id, userId))
            .orderBy(asc(note_tags.name)) as NoteTag[];
    },

    /**
     * 创建标签
     */
    async createTag(userId: number, name: string, color?: string) {
        const tagColor = color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
        const [result] = await drizzleDb.insert(note_tags).values({
            user_id: userId,
            name: name.trim(),
            color: tagColor,
        }).returning({ id: note_tags.id });
        return result.id;
    },

    /**
     * 删除标签
     */
    async deleteTag(userId: number, tagId: number) {
        await drizzleDb.delete(note_tags)
            .where(and(eq(note_tags.id, tagId), eq(note_tags.user_id, userId)));
        return true;
    },

    /**
     * 获取笔记关联的标签
     */
    async getNoteTags(userId: number, noteId: number): Promise<NoteTag[]> {
        return await drizzleDb.select({
            id: note_tags.id,
            user_id: note_tags.user_id,
            name: note_tags.name,
            color: note_tags.color,
            created_at: note_tags.created_at
        })
        .from(note_tags)
        .innerJoin(note_tag_relations, eq(note_tags.id, note_tag_relations.tag_id))
        .where(eq(note_tag_relations.note_id, noteId)) as NoteTag[];
    },

    /**
     * 核心事务：设置笔记标签
     */
    async setNoteTags(userId: number, noteId: number, tagIds: number[]) {
        // 1. 所有权校验
        const [note] = await drizzleDb.select({ id: notes.id })
            .from(notes)
            .where(and(eq(notes.id, noteId), eq(notes.user_id, userId)))
            .limit(1);

        if (!note) throw new Error('笔记不存在');

        // 2. 事务更新
        await drizzleDb.transaction(async (tx) => {
            await tx.delete(note_tag_relations).where(eq(note_tag_relations.note_id, noteId));
            if (tagIds.length > 0) {
                const values = tagIds.map(tagId => ({
                    note_id: noteId,
                    tag_id: tagId,
                }));
                await tx.insert(note_tag_relations).values(values).onConflictDoNothing();
            }
        });
        return true;
    },

    /**
     * 按标签筛选笔记
     */
    async getNotesByTag(userId: number, tagId: number): Promise<NotePreview[]> {
        return await drizzleDb.select({
            id: notes.id,
            title: notes.title,
            updated_at: notes.updated_at,
            preview: sql<string>`substr(${notes.content}, 1, 200)`
        })
        .from(notes)
        .innerJoin(note_tag_relations, eq(notes.id, note_tag_relations.note_id))
        .where(and(eq(notes.user_id, userId), eq(note_tag_relations.tag_id, tagId)))
        .orderBy(desc(notes.updated_at)) as NotePreview[];
    },

    /**
     * 获取知识图谱数据
     */
    async getKnowledgeGraphData(userId: number) {
        const masteryData = await drizzleDb.select({ 
            tag_name: drizzleSchema.user_mastery.tag_name, 
            score: drizzleSchema.user_mastery.score 
        })
        .from(drizzleSchema.user_mastery)
        .where(eq(drizzleSchema.user_mastery.user_id, userId))
        .all();

        const nodes: Array<{ id: string; group: number; score: number }> = [{ id: "核心知识体系", group: 0, score: 100 }];
        const links: Array<{ source: string; target: string; value: number }> = [];
        const nodeMap = new Map<string, { score: number; count: number }>();

        nodeMap.set("核心知识体系", { score: 100, count: 1 });

        masteryData.forEach(m => {
            const parts = m.tag_name.split('/');
            for (let i = 0; i < parts.length; i++) {
                const currentPath = parts.slice(0, i + 1).join('/');
                if (!nodeMap.has(currentPath)) {
                    nodeMap.set(currentPath, { score: 0, count: 0 });
                }
                if (currentPath === m.tag_name) {
                    const node = nodeMap.get(currentPath)!;
                    node.score = m.score || 0;
                    node.count = 1;
                }
            }
        });

        const addedNodes = new Set<string>();
        addedNodes.add("核心知识体系");

        masteryData.forEach(m => {
            const parts = m.tag_name.split('/');
            let parentId = "核心知识体系";

            for (let i = 0; i < parts.length; i++) {
                const currentId = parts.slice(0, i + 1).join('/');
                if (!addedNodes.has(currentId)) {
                    const nodeData = nodeMap.get(currentId);
                    nodes.push({
                        id: currentId,
                        group: i === 0 ? 1 : 2,
                        score: nodeData?.count ? nodeData.score : 0
                    });
                    addedNodes.add(currentId);
                }

                const linkExists = links.some(l => l.source === parentId && l.target === currentId);
                if (!linkExists) {
                    links.push({ source: parentId, target: currentId, value: i === 0 ? 2 : 1 });
                }
                parentId = currentId;
            }
        });

        return { nodes, links };
    }
};
