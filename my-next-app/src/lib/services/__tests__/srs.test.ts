// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drizzleDb } from '@/lib/db';
import { resetDrizzleMock } from '@/lib/db/__mocks__';
import { srsService, learnReadingSpeed } from '../srs';
import { Rating } from 'ts-fsrs';

vi.mock('@/lib/db');
vi.mock('@/lib/db/drizzle-schema');

describe('SRS Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetDrizzleMock();
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
    });

    describe('learnReadingSpeed', () => {
        it('应根据 EMA 算法更新阅读速度', async () => {
            // 通用 Mock：模拟返回基准速度 7.0
            (drizzleDb as any).then.mockImplementation((resolve: any) => resolve([
                { key: 'reading_speed_base', value: '7.0' }
            ]));

            await learnReadingSpeed(1, 'A'.repeat(50), '[]', 10000);

            // EMA: 7.0 * 0.9 + (50/10) * 0.1 = 6.3 + 0.5 = 6.8
            expect(drizzleDb.insert).toHaveBeenCalledWith(expect.objectContaining({
                value: '6.80'
            }));
        });
    });

    describe('syncFromPracticeLogs', () => {
        it('应该只同步不存在于 SRS 中的练习记录', async () => {
            const mockLogs = [
                { questionId: 101, isCorrect: 1, durationMs: 5000, timestamp: '2024-01-01' },
            ];

            // 智能 Mock 实现：根据查询逻辑返回数据
            (drizzleDb as any).then.mockImplementation((resolve: any) => {
                // 1. 如果是查询 logs (通常是第一个查询)
                if ((drizzleDb.select as any).mock.calls.length === 1) {
                    return resolve(mockLogs);
                }
                // 2. 如果是查询题目信息 (包含 id 和 type)
                return resolve([{ id: 101, type: 'single', content: 'Q1', options: '[]' }]);
            });

            const syncCount = await srsService.syncFromPracticeLogs(1);

            expect(syncCount).toBe(1);
            expect(drizzleDb.insert).toHaveBeenCalled(); 
        });

        it('如果没有新日志应返回 0', async () => {
            (drizzleDb as any).then.mockImplementation((resolve: any) => resolve([]));
            const syncCount = await srsService.syncFromPracticeLogs(1);
            expect(syncCount).toBe(0);
        });
    });
});
