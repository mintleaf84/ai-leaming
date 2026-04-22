import db, { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';

/**
 * 知识卡片服务
 * 负责知识卡片的 CRUD 和导出操作
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
 * 创建知识卡片
 */
import { ragService } from '@/lib/ai/rag';

/**
 * 创建知识卡片
 */
export async function createKnowledgeCard(card: KnowledgeCard): Promise<number> {
    const result = await drizzleDb.insert(drizzleSchema.knowledge_cards).values({
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
export async function getAllKnowledgeCards(category?: string, limit: number = 100, ids?: number[]): Promise<KnowledgeCard[]> {
    const conditions = [];
    if (category) {
        conditions.push(eq(drizzleSchema.knowledge_cards.category, category));
    }
    if (ids && ids.length > 0) {
        conditions.push(inArray(drizzleSchema.knowledge_cards.id, ids));
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
    const updatesObj: Record<string, any> = {
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
    
    const success = result.changes > 0;

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
    const success = result.changes > 0;

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
export async function getKnowledgeStats(): Promise<{ total: number; byCategory: { category: string; count: number }[] }> {
    const totalResult = await drizzleDb.select({ count: sql<number>`count(*)` })
        .from(drizzleSchema.knowledge_cards)
        .get();
    
    const byCategory = await drizzleDb.select({
        category: drizzleSchema.knowledge_cards.category,
        count: sql<number>`count(*)`
    })
    .from(drizzleSchema.knowledge_cards)
    .where(and(
        sql`${drizzleSchema.knowledge_cards.category} IS NOT NULL`,
        sql`${drizzleSchema.knowledge_cards.category} != ''`
    ))
    .groupBy(drizzleSchema.knowledge_cards.category)
    .orderBy(desc(sql`count(*)`))
    .all();

    return { 
        total: totalResult?.count || 0, 
        byCategory: byCategory as { category: string; count: number }[] 
    };
}
