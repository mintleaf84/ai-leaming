import db from '@/lib/db';

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
    const result = db.prepare(`
    INSERT INTO knowledge_cards (session_id, title, category, tags, front, back, key_points, source_content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
        card.session_id || null,
        card.title,
        card.category || '',
        JSON.stringify(card.tags || []),
        card.front,
        card.back,
        JSON.stringify(card.key_points || []),
        card.source_content || ''
    );

    const cardId = result.lastInsertRowid as number;

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
export function getAllKnowledgeCards(category?: string, limit: number = 100, ids?: number[]): KnowledgeCard[] {
    let query = 'SELECT * FROM knowledge_cards';
    const params: any[] = [];
    const conditions: string[] = [];

    if (category) {
        conditions.push('category = ?');
        params.push(category);
    }

    if (ids && ids.length > 0) {
        conditions.push(`id IN (${ids.map(() => '?').join(',')})`);
        params.push(...ids);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
        ...row,
        tags: JSON.parse(row.tags || '[]'),
        key_points: JSON.parse(row.key_points || '[]'),
    }));
}

/**
 * 获取单个知识卡片
 */
export function getKnowledgeCard(id: number): KnowledgeCard | null {
    const row = db.prepare('SELECT * FROM knowledge_cards WHERE id = ?').get(id) as any;

    if (!row) return null;

    return {
        ...row,
        tags: JSON.parse(row.tags || '[]'),
        key_points: JSON.parse(row.key_points || '[]'),
    };
}

/**
 * 更新知识卡片
 */
export async function updateKnowledgeCard(id: number, updates: Partial<KnowledgeCard>): Promise<boolean> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
        fields.push('title = ?');
        values.push(updates.title);
    }
    if (updates.category !== undefined) {
        fields.push('category = ?');
        values.push(updates.category);
    }
    if (updates.tags !== undefined) {
        fields.push('tags = ?');
        values.push(JSON.stringify(updates.tags));
    }
    if (updates.front !== undefined) {
        fields.push('front = ?');
        values.push(updates.front);
    }
    if (updates.back !== undefined) {
        fields.push('back = ?');
        values.push(updates.back);
    }
    if (updates.key_points !== undefined) {
        fields.push('key_points = ?');
        values.push(JSON.stringify(updates.key_points));
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = db.prepare(`UPDATE knowledge_cards SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const success = result.changes > 0;

    if (success) {
        // RAG Sync: Delete old, add new
        try {
            ragService.deleteChunksBySource('card', id);

            // Fetch full card to re-index
            const card = getKnowledgeCard(id);
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
    const result = db.prepare('DELETE FROM knowledge_cards WHERE id = ?').run(id);
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
export function getCategories(): string[] {
    const rows = db.prepare("SELECT DISTINCT category FROM knowledge_cards WHERE category IS NOT NULL AND category != '' ORDER BY category").all() as { category: string }[];
    return rows.map(row => row.category);
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
export function getKnowledgeStats(): { total: number; byCategory: { category: string; count: number }[] } {
    const total = (db.prepare('SELECT COUNT(*) as count FROM knowledge_cards').get() as { count: number }).count;
    const byCategory = db.prepare(`
    SELECT category, COUNT(*) as count 
    FROM knowledge_cards 
    WHERE category IS NOT NULL AND category != '' 
    GROUP BY category 
    ORDER BY count DESC
  `).all() as { category: string; count: number }[];

    return { total, byCategory };
}
