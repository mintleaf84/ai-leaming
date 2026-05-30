// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
// Mock DB
const { mockGet, mockAll } = vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockAll: vi.fn(),
}));

vi.mock('@/lib/db', () => {
    const drizzleMock: any = {
        select: vi.fn(() => {
            const chain: any = new Proxy(() => {}, {
                get: (_, prop) => {
                    if (prop === 'all') return vi.fn().mockImplementation(() => Promise.resolve(mockAll()));
                    if (prop === 'get') return vi.fn().mockImplementation(() => Promise.resolve(mockGet()));
                    if (prop === 'then') return (resolve: any) => resolve(mockAll() || []);
                    return chain;
                },
                apply: () => chain
            });
            return chain;
        }),
        insert: vi.fn(() => {
            const chain: any = new Proxy(() => {}, {
                get: (_, prop) => prop === 'onConflictDoUpdate' ? () => Promise.resolve({ changes: 1 }) : chain,
                apply: () => chain
            });
            return chain;
        }),
        transaction: vi.fn((callback) => callback(drizzleMock)), // 新增 transaction mock
        query: {
            questions: { findFirst: vi.fn().mockImplementation(() => Promise.resolve(mockGet())) },
            question_srs: { findFirst: vi.fn().mockImplementation(() => Promise.resolve(mockGet())) }
        }
    };
    return {
        default: drizzleMock,
        db: drizzleMock,
        drizzleDb: drizzleMock,
        drizzleSchema: new Proxy({}, { get: (_, prop) => prop })
    };
});

import { srsService, learnReadingSpeed } from '../srs';
import { summarizeFutureReviews } from '../srs-summary';
import { Rating, createEmptyCard } from 'ts-fsrs';

describe('SRS Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockReset();
        mockAll.mockReset();
    });

    describe('calculateRating', () => {
        const mockContent = '这是一个测试题目'; // 8个字符
        const mockOptions = JSON.stringify(['选项A', '选项B']); // 6个字符

        it('答题极快时应返回 Easy', () => {
            const rating = srsService.calculateRating(mockContent, mockOptions, 3000, 7);
            expect(rating).toBe(Rating.Easy);
        });

        it('思考时间在阈值内应返回 Good', () => {
            const rating = srsService.calculateRating(mockContent, mockOptions, 7000, 7);
            expect(rating).toBe(Rating.Good);
        });

        it('答题较慢时应返回 Hard', () => {
            const rating = srsService.calculateRating(mockContent, mockOptions, 15000, 7);
            expect(rating).toBe(Rating.Hard);
        });

        it('fill_blank 传入答案长度后应扣除打字时间并降低评级', () => {
            const rating = srsService.calculateRating(mockContent, mockOptions, 6000, 7, 'fill_blank', 20);
            expect(rating).toBe(Rating.Easy);
        });

        it('fill_blank 应使用 5 字符/秒打字扣除与 0.6 思考折扣', () => {
            const rating = srsService.calculateRating(mockContent, mockOptions, 12000, 7, 'fill_blank', 20);
            expect(rating).toBe(Rating.Easy);
        });

        it('fill_blank 思考时间恰好 4 秒时应为 Good', () => {
            const rating = srsService.calculateRating(mockContent, mockOptions, 10667, 7, 'fill_blank', 10);
            expect(rating).toBe(Rating.Good);
        });

        it('fill_blank 思考时间超过 12 秒时应为 Hard', () => {
            const rating = srsService.calculateRating(mockContent, mockOptions, 24001, 7, 'fill_blank', 10);
            expect(rating).toBe(Rating.Hard);
        });

        it('fill_blank 缺少答案长度时应回退到默认评级逻辑', () => {
            const rating = srsService.calculateRating(mockContent, mockOptions, 6000, 7, 'fill_blank');
            expect(rating).toBe(Rating.Good);
        });
    });

    describe('learnReadingSpeed', () => {
        it('应根据 EMA 算法更新阅读速度', async () => {
            const { drizzleDb } = await import('@/lib/db');
            mockAll.mockReturnValue([
                { key: 'reading_speed_base', value: '7.0' }
            ]);

            await learnReadingSpeed(1, 'A'.repeat(50), '[]', 10000);

            // EMA: 7.0 * 0.9 + (50/10) * 0.1 = 6.3 + 0.5 = 6.8
            expect(drizzleDb.insert).toHaveBeenCalled();
            expect(drizzleDb.insert).toHaveBeenCalledWith(expect.anything());
        });
    });

    describe('syncFromPracticeLogs', () => {
        it('应该只同步不存在于 SRS 中的练习记录', async () => {
            const { drizzleDb } = await import('@/lib/db');
            const mockLogs = [
                { questionId: 101, isCorrect: 1, durationMs: 5000, timestamp: '2024-01-01', userAnswer: null },
            ];

            mockAll.mockReturnValue([]);
            mockAll
                .mockReturnValueOnce([]) // reading_speed_base
                .mockReturnValueOnce([]) // reading_speed_multi
                .mockReturnValueOnce([]) // reading_speed_multi fallback base
                .mockReturnValueOnce([]) // reading_speed_truefalse
                .mockReturnValueOnce([]) // reading_speed_truefalse fallback base
                .mockReturnValueOnce([]) // reading_speed_fill_blank
                .mockReturnValueOnce([]) // reading_speed_fill_blank fallback base
                .mockReturnValueOnce(mockLogs) // syncFromPracticeLogs 查询日志
                .mockReturnValueOnce([{ type: 'single' }]) // syncFromPracticeLogs 查询题型
                .mockReturnValueOnce([{ id: 101, content: 'Q1', options: '[]', type: 'single' }]); // updateQuestionSrs 查询题目

            const syncCount = await srsService.syncFromPracticeLogs(1);

            expect(syncCount).toBe(1);
            expect(drizzleDb.insert).toHaveBeenCalled(); 
        });

        it('如果没有新日志应返回 0', async () => {
            mockAll.mockReturnValue([]);
            const syncCount = await srsService.syncFromPracticeLogs(1);
            expect(syncCount).toBe(0);
        });
    });

    describe('summarizeFutureReviews', () => {
        it('应该汇总未来 7 天的错题数量和预计耗时', () => {
            const summary = summarizeFutureReviews([
                { date: '2026-05-10', count: 2, estimatedMinutes: 5 },
                { date: '2026-05-11', count: 3, estimatedMinutes: 8 },
            ]);

            expect(summary.totalCount).toBe(5);
            expect(summary.totalMinutes).toBe(13);
        });
    });
});
