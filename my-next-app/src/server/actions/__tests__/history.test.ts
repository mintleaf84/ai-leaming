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

vi.mock('@/lib/db', () => ({
    default: mockDb
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn(),
}));

import { requireUser } from '@/lib/auth/auth';

describe('History Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // 默认 Mock 登录用户
        vi.mocked(requireUser).mockResolvedValue({ id: 1, username: 'testuser' } as any);
    });

    // ========== getSessionHistoryAction 测试 ==========
    describe('getSessionHistoryAction', () => {
        it('应该返回分页的会话历史', async () => {
            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT COUNT(*)')) {
                    return { get: () => ({ count: 25 }) };
                }
                if (sql.includes('SELECT')) {
                    return {
                        all: () => [
                            { id: 'session-1', totalQuestions: 10, correctCount: 8, reviewCount: 2, createdAt: '2026-01-17' },
                            { id: 'session-2', totalQuestions: 5, correctCount: 3, reviewCount: 1, createdAt: '2026-01-16' }
                        ]
                    };
                }
                return { get: () => null, all: () => [] };
            });

            const { getSessionHistoryAction } = await import('../history');
            const result = await getSessionHistoryAction();

            expect(result.total).toBe(25);
            expect(result.items).toHaveLength(2);
            expect(result.items[0].accuracy).toBe(80); // 8/10 * 100
        });

        it('应该支持日期筛选', async () => {
            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('date(created_at) >= date(?)')) {
                    return { get: () => ({ count: 5 }), all: () => [] };
                }
                return { get: () => ({ count: 0 }), all: () => [] };
            });

            const { getSessionHistoryAction } = await import('../history');
            const result = await getSessionHistoryAction({
                dateFrom: '2026-01-01',
                dateTo: '2026-01-17'
            });

            expect(result.total).toBe(5);
        });

        it('应该支持正确率筛选', async () => {
            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT COUNT(*)')) {
                    return { get: () => ({ count: 3 }) };
                }
                return {
                    all: () => [
                        { id: 's1', totalQuestions: 10, correctCount: 9, reviewCount: 0, createdAt: '2026-01-17' }, // 90%
                        { id: 's2', totalQuestions: 10, correctCount: 5, reviewCount: 0, createdAt: '2026-01-16' }, // 50%
                        { id: 's3', totalQuestions: 10, correctCount: 7, reviewCount: 0, createdAt: '2026-01-15' }, // 70%
                    ]
                };
            });

            const { getSessionHistoryAction } = await import('../history');
            const result = await getSessionHistoryAction({ accuracyMin: 60 });

            // 只返回正确率 >= 60 的会话
            expect(result.items.every(i => i.accuracy >= 60)).toBe(true);
        });
    });

    // ========== getSessionDetailAction 测试 ==========
    describe('getSessionDetailAction', () => {
        it('应该返回会话详情', async () => {
            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('FROM practice_sessions WHERE id')) {
                    return {
                        get: () => ({ id: 'session-1', totalQuestions: 5, correctCount: 4, reviewCount: 1, createdAt: '2026-01-17' })
                    };
                }
                if (sql.includes('FROM practice_logs')) {
                    return {
                        all: () => [
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
                        ]
                    };
                }
                return { get: () => null, all: () => [] };
            });

            const { getSessionDetailAction } = await import('../history');
            const result = await getSessionDetailAction('session-1');

            expect(result).not.toBeNull();
            expect(result!.session.accuracy).toBe(80);
            expect(result!.logs).toHaveLength(1);
            expect(result!.logs[0].options).toEqual(['A', 'B', 'C']);
        });

        it('会话不存在时应返回 null', async () => {
            mockDb.prepare.mockImplementation(() => ({
                get: () => null,
                all: () => []
            }));

            const { getSessionDetailAction } = await import('../history');
            const result = await getSessionDetailAction('non-existent');

            expect(result).toBeNull();
        });
    });

    // ========== deleteSessionAction 测试 ==========
    describe('deleteSessionAction', () => {
        it('应该成功删除会话', async () => {
            const mockRun = vi.fn();

            // Mock db.prepare 返回带 run 方法的 statement
            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT id FROM practice_sessions')) {
                    return { get: () => ({ id: 'session-1' }) };
                }
                // DELETE 语句返回带 run 的对象
                return { run: mockRun };
            });

            // Mock db.transaction 返回一个可调用的函数
            mockDb.transaction.mockImplementation((fn: Function) => {
                // 返回一个函数，当被调用时执行 fn
                return (...args: any[]) => fn(...args);
            });

            const { deleteSessionAction } = await import('../history');
            const result = await deleteSessionAction('session-1');

            expect(result.success).toBe(true);
            expect(mockRun).toHaveBeenCalled();
        });

        it('会话不存在时应返回错误', async () => {
            mockDb.prepare.mockReturnValue({ get: () => null });

            const { deleteSessionAction } = await import('../history');
            const result = await deleteSessionAction('non-existent');

            expect(result.success).toBe(false);
            expect(result.message).toContain('不存在');
        });
    });

    // ========== renameSessionAction 测试 ==========
    describe('renameSessionAction', () => {
        it('应该成功重命名会话', async () => {
            const mockRun = vi.fn();
            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT id FROM practice_sessions')) {
                    return { get: () => ({ id: 'session-1' }) };
                }
                if (sql.includes('UPDATE practice_sessions SET session_name')) {
                    return { run: mockRun };
                }
                return { get: () => null, run: vi.fn() };
            });

            const { renameSessionAction } = await import('../history');
            const result = await renameSessionAction('session-1', '新名称');

            expect(result.success).toBe(true);
            expect(mockRun).toHaveBeenCalled();
        });

        it('会话不存在时应返回错误', async () => {
            mockDb.prepare.mockReturnValue({ get: () => null });

            const { renameSessionAction } = await import('../history');
            const result = await renameSessionAction('non-existent', '新名称');

            expect(result.success).toBe(false);
        });
    });

    // ========== getAvailableModesAction 测试 ==========
    describe('getAvailableModesAction', () => {
        it('应该返回可用的练习模式列表', async () => {
            mockDb.prepare.mockReturnValue({
                all: () => [
                    { practice_mode: 'normal' },
                    { practice_mode: 'review' },
                    { practice_mode: 'exam' }
                ]
            });

            const { getAvailableModesAction } = await import('../history');
            const result = await getAvailableModesAction();

            expect(result).toEqual(['normal', 'review', 'exam']);
        });

        it('无练习记录时应返回空数组', async () => {
            mockDb.prepare.mockReturnValue({ all: () => [] });

            const { getAvailableModesAction } = await import('../history');
            const result = await getAvailableModesAction();

            expect(result).toEqual([]);
        });
    });
});
