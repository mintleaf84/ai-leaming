// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock Drizzle
const { mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
    const makeChain = () => {
        const chain: any = {
            then: vi.fn((resolve) => resolve([])),
        };
        const methods = ['insert', 'values', 'update', 'set', 'delete', 'select', 'from', 'where', 'limit', 'offset', 'orderBy', 'groupBy', 'all', 'innerJoin', 'leftJoin', 'onConflictDoUpdate'];
        methods.forEach((m) => {
            chain[m] = vi.fn(() => chain);
        });
        return chain;
    };

    const chain = makeChain();
    
    // 统一 transaction 传入的对象
    chain.transaction = vi.fn(async (cb) => cb(chain));
    
    const mockDrizzleDb = chain;

    const mockDrizzleSchema = {
        practice_sessions: { id: 'id', user_id: 'user_id', created_at: 'created_at', practice_mode: 'practice_mode', session_name: 'session_name', total_questions: 'total_questions', correct_count: 'correct_count', review_count: 'review_count' },
        practice_logs: { session_id: 'session_id', user_id: 'user_id', question_id: 'question_id', duration_ms: 'duration_ms', is_correct: 'is_correct' },
        questions: { id: 'id', content: 'content', options: 'options', answer: 'answer', tags: 'tags', source: 'source', explanation: 'explanation', correct_ratio: 'correct_ratio', most_wrong_answer: 'most_wrong_answer', ai_mnemonic: 'ai_mnemonic', material: 'material', material_html: 'material_html' },
        session_reviews: { session_id: 'session_id', question_id: 'question_id', review_data: 'review_data' },
    };

    // 独立 mock query
    mockDrizzleDb.query = {
        practice_sessions: { findFirst: vi.fn() },
    };

    return { mockDrizzleDb, mockDrizzleSchema };
});

vi.mock('@/lib/db', () => ({
    default: {
        prepare: vi.fn(() => ({ get: vi.fn() })) 
    },
    drizzleDb: mockDrizzleDb,
    drizzleSchema: mockDrizzleSchema,
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1, username: 'testuser' }),
}));

describe('History Actions', () => {
    const chain = mockDrizzleDb as any;

    beforeEach(() => {
        vi.clearAllMocks();
        
        const chainMethods = ['values', 'set', 'where', 'limit', 'offset', 'orderBy', 'groupBy', 'from', 'innerJoin', 'leftJoin', 'onConflictDoUpdate', 'select', 'update', 'delete', 'insert'];
        chainMethods.forEach(m => {
            if (chain[m] && chain[m].mockReturnValue) {
                chain[m].mockReturnValue(chain);
            }
        });
        
        chain.then.mockImplementation((resolve: any) => resolve([]));
        chain.all.mockResolvedValue([]);
    });

    // ========== getSessionHistoryAction 测试 ==========
    describe('getSessionHistoryAction', () => {
        it('应该返回分页的会话历史', async () => {
            chain.then.mockImplementationOnce((resolve: any) => resolve([{ value: 25 }]));
            chain.then.mockImplementationOnce((resolve: any) => resolve([
                { id: 'session-1', totalQuestions: 10, correctCount: 8, reviewCount: 2, createdAt: '2026-01-17' },
                { id: 'session-2', totalQuestions: 5, correctCount: 3, reviewCount: 1, createdAt: '2026-01-16' }
            ]));

            const { getSessionHistoryAction } = await import('../history');
            const result = await getSessionHistoryAction();

            expect(result.total).toBe(25);
            expect(result.items).toHaveLength(2);
            expect(result.items[0].accuracy).toBe(80);
        });
    });

    // ========== getSessionDetailAction 测试 ==========
    describe('getSessionDetailAction', () => {
        it('应该返回会话详情', async () => {
            mockDrizzleDb.query.practice_sessions.findFirst.mockResolvedValue({
                id: 'session-1', total_questions: 5, correct_count: 4, review_count: 1, created_at: '2026-01-17'
            });

            chain.all.mockResolvedValue([
                {
                    questionId: 1,
                    questionContent: '测试题目',
                    options: '["A","B","C"]',
                    correctAnswer: 'A',
                    userAnswer: 'A',
                    isCorrect: 1,
                    duration: 5000,
                    tags: '["心理学"]',
                    explanation: '答案解析'
                }
            ]);

            const { getSessionDetailAction } = await import('../history');
            const result = await getSessionDetailAction('session-1');

            expect(result).not.toBeNull();
            expect(result!.session.accuracy).toBe(80);
            expect(result!.logs).toHaveLength(1);
            expect(result!.logs[0].options).toEqual(['A', 'B', 'C']);
        });
    });

    // ========== deleteSessionAction 测试 ==========
    describe('deleteSessionAction', () => {
        it('应该成功删除会话', async () => {
            mockDrizzleDb.query.practice_sessions.findFirst.mockResolvedValue({ id: 'session-1' });

            const { deleteSessionAction } = await import('../history');
            const result = await deleteSessionAction('session-1');

            expect(result.success).toBe(true);
            expect(mockDrizzleDb.transaction).toHaveBeenCalled();
            expect(chain.delete).toHaveBeenCalled();
        });
    });

    // ========== getAvailableModesAction 测试 ==========
    describe('getAvailableModesAction', () => {
        it('应该返回可用的练习模式列表', async () => {
            chain.all.mockResolvedValue([
                { practice_mode: 'normal' },
                { practice_mode: 'review' }
            ]);

            const { getAvailableModesAction } = await import('../history');
            const result = await getAvailableModesAction();

            expect(result).toEqual(['normal', 'review']);
        });
    });
});
