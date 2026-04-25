// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
const { mockDb } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
            transaction: vi.fn(),
        }
    };
});

vi.mock('@/lib/db', () => ({ default: mockDb, db: mockDb, drizzleDb: {}, drizzleSchema: {} }));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn(),
}));

import { requireUser } from '@/lib/auth/auth';

describe('Wrong Questions Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireUser).mockResolvedValue({ id: 1, username: 'testuser' } as any);
    });

    // ========== getWrongQuestionsAction 测试 ==========
    describe('getWrongQuestionsAction', () => {
        it('应该返回错题列表', async () => {
            mockDb.prepare.mockReturnValue({
                all: () => [
                    {
                        questionId: '1',
                        questionContent: '测试题目1',
                        tags: '["心理学","认知"]',
                        wrongCount: 3,
                        lastWrongAt: '2026-01-17',
                        correctAnswer: 'A',
                        userLastAnswer: 'B'
                    },
                    {
                        questionId: '2',
                        questionContent: '测试题目2',
                        tags: '["心理学"]',
                        wrongCount: 1,
                        lastWrongAt: '2026-01-16',
                        correctAnswer: 'C',
                        userLastAnswer: 'D'
                    }
                ]
            });

            const { getWrongQuestionsAction } = await import('../wrong-questions');
            const result = await getWrongQuestionsAction();

            expect(result).toHaveLength(2);
            expect(result[0].questionId).toBe('1');
            expect(result[0].tags).toEqual(['心理学', '认知']);
            expect(result[0].wrongCount).toBe(3);
        });

        it('无错题时应返回空数组', async () => {
            mockDb.prepare.mockReturnValue({ all: () => [] });

            const { getWrongQuestionsAction } = await import('../wrong-questions');
            const result = await getWrongQuestionsAction();

            expect(result).toEqual([]);
        });
    });

    // ========== getWrongQuestionsByTagAction 测试 ==========
    describe('getWrongQuestionsByTagAction', () => {
        it('应该按标签分组返回错题', async () => {
            mockDb.prepare.mockReturnValue({
                all: () => [
                    { question_id: '1', content: '题目1', tags: '["心理学"]', wrong_count: 2, last_wrong_at: '2026-01-17', correct_answer: 'A', last_user_answer: 'B' },
                    { question_id: '2', content: '题目2', tags: '["心理学"]', wrong_count: 1, last_wrong_at: '2026-01-16', correct_answer: 'B', last_user_answer: 'C' },
                    { question_id: '3', content: '题目3', tags: '["逻辑学"]', wrong_count: 3, last_wrong_at: '2026-01-15', correct_answer: 'C', last_user_answer: 'D' },
                ]
            });

            const { getWrongQuestionsByTagAction } = await import('../wrong-questions');
            const result = await getWrongQuestionsByTagAction();

            expect(result.length).toBeGreaterThan(0);
            const psychTag = result.find(g => g.tag === '心理学');
            expect(psychTag).toBeDefined();
            expect(psychTag!.count).toBe(2);
        });
    });

    // ========== getWrongQuestionsStatsAction 测试 ==========
    describe('getWrongQuestionsStatsAction', () => {
        it('应该返回错题统计信息', async () => {
            mockDb.prepare.mockReturnValue({
                get: () => ({ count: 15 })
            });

            const { getWrongQuestionsStatsAction } = await import('../wrong-questions');
            const result = await getWrongQuestionsStatsAction();

            expect(result.total).toBeDefined();
            expect(result.recent).toBeDefined();
            expect(result.frequent).toBeDefined();
        });
    });

    // ========== markAsMasteredAction 测试 ==========
    describe('markAsMasteredAction', () => {
        it('应该成功标记错题为已掌握', async () => {
            const mockRun = vi.fn().mockReturnValue({ changes: 1 });
            mockDb.prepare.mockReturnValue({ run: mockRun });

            const { markAsMasteredAction } = await import('../wrong-questions');
            const result = await markAsMasteredAction('123', '已理解');

            expect(result.success).toBe(true);
            expect(mockRun).toHaveBeenCalled();
        });

        it('应该处理空备注', async () => {
            const mockRun = vi.fn().mockReturnValue({ changes: 1 });
            mockDb.prepare.mockReturnValue({ run: mockRun });

            const { markAsMasteredAction } = await import('../wrong-questions');
            const result = await markAsMasteredAction('123');

            expect(result.success).toBe(true);
        });
    });

    // ========== unmarkMasteredAction 测试 ==========
    describe('unmarkMasteredAction', () => {
        it('应该成功取消已掌握标记', async () => {
            const mockRun = vi.fn().mockReturnValue({ changes: 1 });
            mockDb.prepare.mockReturnValue({ run: mockRun });

            const { unmarkMasteredAction } = await import('../wrong-questions');
            const result = await unmarkMasteredAction('123');

            expect(result.success).toBe(true);
        });
    });

    // ========== getMasteredQuestionsAction 测试 ==========
    describe('getMasteredQuestionsAction', () => {
        it('应该返回已掌握的错题列表', async () => {
            mockDb.prepare.mockReturnValue({
                all: () => [
                    {
                        questionId: '1',  // SQL 别名
                        questionContent: '已掌握题目',
                        tags: '["心理学"]',
                        masteredAt: '2026-01-17',
                        note: '理解了核心概念'
                    }
                ]
            });

            const { getMasteredQuestionsAction } = await import('../wrong-questions');
            const result = await getMasteredQuestionsAction();

            expect(result).toHaveLength(1);
            expect(result[0].questionId).toBe('1');
            expect(result[0].note).toBe('理解了核心概念');
        });

        it('无已掌握题目时应返回空数组', async () => {
            mockDb.prepare.mockReturnValue({ all: () => [] });

            const { getMasteredQuestionsAction } = await import('../wrong-questions');
            const result = await getMasteredQuestionsAction();

            expect(result).toEqual([]);
        });
    });

    // ========== getWrongQuestionDetailAction 测试 ==========
    describe('getWrongQuestionDetailAction', () => {
        it('应该返回错题详情', async () => {
            mockDb.prepare.mockImplementation((sql: string) => {
                const s = sql.toLowerCase();
                if (s.includes('from questions') && (s.includes('where q.id') || s.includes('where id'))) {
                    return {
                        get: () => ({
                            id: 1,
                            content: '详细题目',
                            options: '["A","B","C","D"]',
                            answer: 'A',
                            tags: '["心理学"]',
                            explanation: '题目解析',
                            type: 'single'
                        })
                    };
                }
                if (s.includes('count(*)') && s.includes('practice_logs') && s.includes('is_correct = 0')) {
                    return {
                        get: () => ({ wrongCount: 2, lastWrongAt: '2026-01-17' })
                    };
                }
                if (s.includes('from practice_logs') && s.includes('order by timestamp desc') && s.includes('limit 20')) {
                    return {
                        all: () => [
                            { timestamp: '2026-01-17', userAnswer: 'B', isCorrect: 0 },
                            { timestamp: '2026-01-16', userAnswer: 'A', isCorrect: 1 }
                        ]
                    };
                }
                if (s.includes('select user_answer') && s.includes('is_correct = 0')) {
                    return {
                        get: () => ({ user_answer: 'B' })
                    };
                }
                return { get: () => ({ count: 0, wrongCount: 0 }), all: () => [] };
            });

            const { getWrongQuestionDetailAction } = await import('../wrong-questions');
            const result = await getWrongQuestionDetailAction('1');

            expect(result).not.toBeNull();
            expect(result!.options).toEqual(['A', 'B', 'C', 'D']);
            expect(result!.historyLogs).toHaveLength(2);
        });

        it('题目不存在时应返回 null', async () => {
            mockDb.prepare.mockReturnValue({ get: () => null, all: () => [] });

            const { getWrongQuestionDetailAction } = await import('../wrong-questions');
            const result = await getWrongQuestionDetailAction('999');

            expect(result).toBeNull();
        });
    });

    // ========== createWrongQuestionsPracticeAction 测试 ==========
    describe('createWrongQuestionsPracticeAction', () => {
        it('应该创建错题练习会话', async () => {
            const mockRun = vi.fn();
            mockDb.prepare.mockReturnValue({ run: mockRun });

            const { createWrongQuestionsPracticeAction } = await import('../wrong-questions');
            const result = await createWrongQuestionsPracticeAction(['1', '2', '3']);

            expect(result.success).toBe(true);
            expect(result.sessionId).toBeDefined();
        });

        it('空题目列表应返回错误', async () => {
            const { createWrongQuestionsPracticeAction } = await import('../wrong-questions');
            const result = await createWrongQuestionsPracticeAction([]);

            expect(result.success).toBe(false);
        });
    });
});
