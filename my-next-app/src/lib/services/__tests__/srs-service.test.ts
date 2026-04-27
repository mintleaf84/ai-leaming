// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drizzleDb } from '@/lib/db';
import { resetDrizzleMock } from '@/lib/db/__mocks__';
import { srsService, learnReadingSpeed } from '../srs';
import { Rating, State } from 'ts-fsrs';
import * as schema from '@/lib/db/__mocks__/drizzle-schema';

vi.mock('@/lib/db');
vi.mock('@/lib/db/drizzle-schema');

describe('SRS Service (Integrated)', () => {
    // 助手：根据表名返回模拟数据
    const mockDbResponse = (data: { questions?: any, question_srs?: any, system_settings?: any, practice_logs?: any }) => {
        (drizzleDb as any).then.mockImplementation((resolve: any) => {
            const fromTable = (drizzleDb as any).from.mock.calls.slice(-1)[0]?.[0];
            if (fromTable === schema.questions && data.questions) return resolve(Array.isArray(data.questions) ? data.questions : [data.questions]);
            if (fromTable === schema.question_srs && data.question_srs) return resolve(Array.isArray(data.question_srs) ? data.question_srs : [data.question_srs]);
            if (fromTable === schema.system_settings && data.system_settings) return resolve(Array.isArray(data.system_settings) ? data.system_settings : [data.system_settings]);
            if (fromTable === schema.practice_logs && data.practice_logs) return resolve(Array.isArray(data.practice_logs) ? data.practice_logs : [data.practice_logs]);
            
            // 默认返回空，但对于统计聚合查询，需要根据 select 字段返回
            const selectFields = (drizzleDb as any).select.mock.calls.slice(-1)[0]?.[0];
            if (selectFields?.state) return resolve([{ state: State.New, count: 10 }]);
            if (selectFields?.range) return resolve([{ range: 5, count: 5 }]);
            
            return resolve([]);
        });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        resetDrizzleMock();
    });

    describe('calculateRating (认知算法)', () => {
        it('极快答题应返回 Easy', () => {
            const rating = srsService.calculateRating('测试题干内容', '["A", "B"]', 3000, 7);
            expect(rating).toBe(Rating.Easy);
        });

        it('正常答题应返回 Good', () => {
            const rating = srsService.calculateRating('测试题干内容', '["A", "B"]', 7000, 7);
            expect(rating).toBe(Rating.Good);
        });
    });

    describe('learnReadingSpeed (学习算法)', () => {
        it('EMA 算法应正确平滑更新速度', async () => {
            mockDbResponse({ system_settings: { value: '7.0' } });
            await learnReadingSpeed(1, 'A'.repeat(100), '[]', 10000);
            expect(drizzleDb.values).toHaveBeenCalledWith(expect.objectContaining({ value: '7.30' }));
        });
    });

    describe('updateQuestionSrs (核心状态流转)', () => {
        const mockQuestion = { id: 1, content: 'Q', options: '[]', type: 'single' };
        const mockSrs = {
            stability: 1.0, difficulty: 5.0, state: State.New,
            reps: 0, lapses: 0, due_date: new Date().toISOString(), last_review: null
        };

        it('答错时应映射为 Again', async () => {
            mockDbResponse({ questions: mockQuestion, question_srs: [] }); // 模拟新题

            await srsService.updateQuestionSrs(1, 1, false, 5000);
            
            const valuesData = (drizzleDb.values as any).mock.calls[0][0];
            expect(valuesData.state).toBe(State.Learning);
            expect(valuesData.reps).toBe(1);
        });

        it('答对时应计算新稳定性', async () => {
            mockDbResponse({ questions: mockQuestion, question_srs: mockSrs });

            await srsService.updateQuestionSrs(1, 1, true, 2000); // Easy
            
            const valuesData = (drizzleDb.values as any).mock.calls[0][0];
            expect(valuesData.scheduled_days).toBeGreaterThan(0);
        });
    });

    describe('syncFromPracticeLogs (性能优化同步)', () => {
        it('应正确执行增量同步并使用缓存速度', async () => {
            mockDbResponse({ 
                practice_logs: { questionId: 101, isCorrect: 1, durationMs: 5000 },
                questions: { id: 101, type: 'single', content: 'Q1', options: '[]' }
            });

            const count = await srsService.syncFromPracticeLogs(1);
            expect(count).toBe(1);
            expect(drizzleDb.values).toHaveBeenCalled();
        });
    });

    describe('getGlobalStats (分析统计)', () => {
        it('应返回完整的统计对象', async () => {
            mockDbResponse({}); // 使用默认的聚合 Mock

            const stats = await srsService.getGlobalStats(1);
            expect(stats.totalCards).toBe(10);
            expect(stats.readingSpeed.base).toBe(7.0);
        });
    });
});
