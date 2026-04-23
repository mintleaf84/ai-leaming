// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Drizzle Mock（必须在 import service 之前） ----
const { mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
    const makeChain = () => {
        const chain: Record<string, unknown> = {};
        const methods = ['insert', 'values', 'update', 'set', 'delete', 'select', 'from',
            'where', 'orderBy', 'limit', 'all', 'get', 'groupBy'];
        methods.forEach((m) => { chain[m] = vi.fn(() => chain); });
        return chain;
    };

    const chain = makeChain();

    const mockQuery = {
        knowledge_cards: {
            findFirst: vi.fn(),
        },
    };

    const mockDrizzleDb = {
        ...chain,
        query: mockQuery,
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        select: vi.fn(() => chain),
    };

    const mockDrizzleSchema = {
        knowledge_cards: {
            id: 'id',
            session_id: 'session_id',
            title: 'title',
            category: 'category',
            tags: 'tags',
            front: 'front',
            back: 'back',
            key_points: 'key_points',
            source_content: 'source_content',
            created_at: 'created_at',
            updated_at: 'updated_at',
        },
    };

    return { mockDrizzleDb, mockDrizzleSchema };
});

vi.mock('@/lib/db', () => ({
    default: mockDrizzleDb,
    db: mockDrizzleDb,
    drizzleDb: mockDrizzleDb,
    drizzleSchema: mockDrizzleSchema,
}));

// Mock RAG service
vi.mock('@/lib/ai/rag', () => ({
    ragService: {
        addChunk: vi.fn().mockResolvedValue(undefined),
        deleteChunksBySource: vi.fn(),
    },
}));

import {
    createKnowledgeCard,
    getAllKnowledgeCards,
    getKnowledgeCard,
    updateKnowledgeCard,
    deleteKnowledgeCard,
    getCategories,
    exportToAnkiTSV,
    type KnowledgeCard,
} from '@/lib/services/knowledge';

// ---- 辅助：获取链式调用的末端方法 ----
const chain = mockDrizzleDb as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('KnowledgeService', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // 重置链式调用
        const chainMethods = ['values', 'set', 'from', 'where', 'orderBy', 'limit', 'groupBy'];
        chainMethods.forEach((m) => { chain[m].mockReturnValue(mockDrizzleDb); });
        mockDrizzleDb.insert.mockReturnValue(mockDrizzleDb);
        mockDrizzleDb.update.mockReturnValue(mockDrizzleDb);
        mockDrizzleDb.delete.mockReturnValue(mockDrizzleDb);
        mockDrizzleDb.select.mockReturnValue(mockDrizzleDb);

        // 默认终止方法返回空
        chain['all'].mockResolvedValue([]);
        chain['get'].mockResolvedValue(undefined);
    });

    // ────────────────────────────
    // createKnowledgeCard
    // ────────────────────────────
    describe('createKnowledgeCard', () => {
        it('应该插入卡片并返回新 ID', async () => {
            chain['values'].mockResolvedValueOnce({ lastInsertRowid: BigInt(7) });

            const card: KnowledgeCard = {
                title: '测试卡片',
                category: '数学',
                tags: ['代数'],
                front: '问题',
                back: '答案',
                key_points: [],
            };

            const id = await createKnowledgeCard(card);

            expect(id).toBe(7);
            expect(mockDrizzleDb.insert).toHaveBeenCalled();
        });

        it('RAG 同步失败不应影响返回值', async () => {
            chain['values'].mockResolvedValueOnce({ lastInsertRowid: BigInt(8) });

            const { ragService } = await import('@/lib/ai/rag');
            vi.mocked(ragService.addChunk).mockRejectedValueOnce(new Error('RAG 故障'));

            const card: KnowledgeCard = {
                title: 'RAG 失败测试',
                category: '语文',
                tags: [],
                front: 'Q',
                back: 'A',
                key_points: [],
            };

            const id = await createKnowledgeCard(card);
            expect(id).toBe(8);
        });
    });

    // ────────────────────────────
    // getAllKnowledgeCards
    // ────────────────────────────
    describe('getAllKnowledgeCards', () => {
        it('应该正确解析 JSON 字段', async () => {
            const rawRow = {
                id: 1,
                title: '卡片1',
                category: '数学',
                tags: '["代数","几何"]',
                front: 'Q',
                back: 'A',
                key_points: '[{"term":"项","definition":"单项式的基本单元"}]',
            };
            // getAllKnowledgeCards 的终端方法是 limit()，不是 all()
            chain['limit'].mockResolvedValueOnce([rawRow]);

            const result = await getAllKnowledgeCards();

            expect(result).toHaveLength(1);
            expect(result[0].tags).toEqual(['代数', '几何']);
            expect(result[0].key_points).toEqual([{ term: '项', definition: '单项式的基本单元' }]);
        });

        it('空结果时应返回空数组', async () => {
            chain['limit'].mockResolvedValueOnce([]);
            const result = await getAllKnowledgeCards();
            expect(result).toEqual([]);
        });
    });

    // ────────────────────────────
    // getKnowledgeCard
    // ────────────────────────────
    describe('getKnowledgeCard', () => {
        it('找到时应解析 JSON 并返回卡片', async () => {
            const rawRow = {
                id: 2,
                title: '卡片2',
                category: '物理',
                tags: '["力学"]',
                front: 'Q2',
                back: 'A2',
                key_points: '[]',
            };
            mockDrizzleDb.query.knowledge_cards.findFirst.mockResolvedValueOnce(rawRow);

            const result = await getKnowledgeCard(2);

            expect(result).not.toBeNull();
            expect(result!.id).toBe(2);
            expect(result!.tags).toEqual(['力学']);
        });

        it('未找到时应返回 null', async () => {
            mockDrizzleDb.query.knowledge_cards.findFirst.mockResolvedValueOnce(undefined);
            const result = await getKnowledgeCard(999);
            expect(result).toBeNull();
        });
    });

    // ────────────────────────────
    // updateKnowledgeCard
    // ────────────────────────────
    describe('updateKnowledgeCard', () => {
        it('更新成功时应返回 true', async () => {
            // update 链的末端（where 调用后隐式 resolve）需要返回 rowsAffected
            chain['where'].mockResolvedValueOnce({ rowsAffected: 1 });
            // 为 RAG 同步：getKnowledgeCard 需要查询
            mockDrizzleDb.query.knowledge_cards.findFirst.mockResolvedValue({
                id: 1, title: '旧标题', category: '数学', tags: '[]', front: 'Q', back: 'A', key_points: '[]',
            });

            const result = await updateKnowledgeCard(1, { title: '新标题' });

            expect(result).toBe(true);
        });

        it('无匹配行时应返回 false', async () => {
            chain['where'].mockResolvedValueOnce({ rowsAffected: 0 });

            const result = await updateKnowledgeCard(999, { title: '不存在' });

            expect(result).toBe(false);
        });
    });

    // ────────────────────────────
    // deleteKnowledgeCard
    // ────────────────────────────
    describe('deleteKnowledgeCard', () => {
        it('删除成功时应返回 true', async () => {
            chain['where'].mockResolvedValueOnce({ rowsAffected: 1 });

            const result = await deleteKnowledgeCard(1);

            expect(result).toBe(true);
        });

        it('无匹配行时应返回 false', async () => {
            chain['where'].mockResolvedValueOnce({ rowsAffected: 0 });

            const result = await deleteKnowledgeCard(999);

            expect(result).toBe(false);
        });
    });

    // ────────────────────────────
    // getCategories
    // ────────────────────────────
    describe('getCategories', () => {
        it('应该返回分类列表', async () => {
            // getCategories 的终端方法是 all()，使用 mockImplementationOnce 避免队列污染
            chain['all'].mockImplementationOnce(() => Promise.resolve([
                { category: '数学' },
                { category: '语文' },
            ]));

            const result = await getCategories();

            expect(result).toEqual(['数学', '语文']);
        });

        it('空结果时应返回空数组', async () => {
            chain['all'].mockImplementationOnce(() => Promise.resolve([]));
            expect(await getCategories()).toEqual([]);
        });
    });
});

// ────────────────────────────
// exportToAnkiTSV（纯函数，无需 Mock）
// ────────────────────────────
describe('exportToAnkiTSV', () => {
    it('应该生成正确的 TSV 格式', () => {
        const cards: KnowledgeCard[] = [
            {
                id: 1,
                title: '卡片1',
                category: '数学',
                tags: ['代数'],
                front: '什么是一元一次方程？',
                back: '含有一个未知数的一次方程',
                key_points: [{ term: '未知数', definition: '方程中待求的量' }],
            },
        ];

        const result = exportToAnkiTSV(cards);
        const lines = result.split('\n');

        expect(lines).toHaveLength(1);
        const [front, back, tags] = lines[0].split('\t');
        expect(front).toBe('什么是一元一次方程？');
        expect(back).toContain('含有一个未知数的一次方程');
        expect(back).toContain('未知数: 方程中待求的量');
        expect(tags).toContain('数学');
        expect(tags).toContain('代数');
    });

    it('换行符应被替换为 <br>', () => {
        const cards: KnowledgeCard[] = [
            {
                title: '多行卡片',
                category: '',
                tags: [],
                front: '第一行\n第二行',
                back: '答案',
                key_points: [],
            },
        ];

        const result = exportToAnkiTSV(cards);
        expect(result).toContain('第一行<br>第二行');
        expect(result).not.toContain('\n第二行');
    });

    it('制表符应被替换为空格', () => {
        const cards: KnowledgeCard[] = [
            {
                title: '制表符卡片',
                category: '',
                tags: [],
                front: '有\t制表符',
                back: '答案',
                key_points: [],
            },
        ];

        const result = exportToAnkiTSV(cards);
        // 确保内容中的制表符被空格替换
        const parts = result.split('\t');
        expect(parts[0]).toBe('有 制表符');
    });

    it('空 key_points 时不应追加关键点区块', () => {
        const cards: KnowledgeCard[] = [
            {
                title: '无关键点',
                category: '化学',
                tags: [],
                front: 'Q',
                back: 'A',
                key_points: [],
            },
        ];

        const result = exportToAnkiTSV(cards);
        expect(result).not.toContain('【关键点】');
    });

    it('空卡片列表应返回空字符串', () => {
        expect(exportToAnkiTSV([])).toBe('');
    });

    it('多张卡片应生成多行', () => {
        const cards: KnowledgeCard[] = [
            { title: 'C1', category: '', tags: [], front: 'Q1', back: 'A1', key_points: [] },
            { title: 'C2', category: '', tags: [], front: 'Q2', back: 'A2', key_points: [] },
        ];

        const result = exportToAnkiTSV(cards);
        expect(result.split('\n')).toHaveLength(2);
    });

    it('分类和标签中的空格应替换为下划线', () => {
        const cards: KnowledgeCard[] = [
            {
                title: '空格标签',
                category: '数学 代数',
                tags: ['一 次 方 程'],
                front: 'Q',
                back: 'A',
                key_points: [],
            },
        ];

        const result = exportToAnkiTSV(cards);
        const parts = result.split('\t');
        expect(parts[2]).toContain('数学_代数');
        expect(parts[2]).toContain('一_次_方_程');
    });
});
