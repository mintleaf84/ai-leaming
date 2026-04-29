// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. 设置 Mock
const { actualSchema, mockDb } = await vi.hoisted(async () => {
    const modSchema = await import('@/lib/db/drizzle-schema');
    const modUtils = await import('@/lib/__tests__/db-mock-utils');
    const mock = modUtils.createTableAwareDrizzleMock();
    return { 
        actualSchema: modSchema,
        mockDb: mock
    };
});

vi.mock('@/lib/db', () => ({
    drizzleDb: mockDb,
    drizzleSchema: actualSchema
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock('@/lib/ai/client', () => ({
    generateTextWrapper: vi.fn().mockResolvedValue({ text: 'AI Analysis Report' })
}));

import { getSessionReportAction, generateDeepAnalysisAction } from '../report';
import { resetDrizzleMock } from '@/lib/__tests__/db-mock-utils';

describe('Report Actions', () => {
    beforeEach(() => {
        resetDrizzleMock(mockDb);
        mockDb.resetTableData?.();
        vi.clearAllMocks();
    });

    describe('getSessionReportAction', () => {
        it('should calculate basic stats and dimensions correctly', async () => {
            // 模拟数据库返回
            mockDb.get
                .mockResolvedValueOnce({ total: 10, correct: 6, avgDuration: 5000 }); // statsRes

            mockDb.all
                .mockResolvedValueOnce([{ tag: 'Tag1' }, { tag: 'Tag2' }]) // errorTagsRows
                .mockResolvedValueOnce([
                    { dimension: 'knowledge', total: 5, correct: 4 },
                    { dimension: 'understanding', total: 5, correct: 2 }
                ]); // dimensionRows

            const result = await getSessionReportAction('session-1');

            expect(result.data?.success).toBe(true);
            if (!result.data || !result.data.success) return;

            expect(result.data.totalQuestions).toBe(10);
            expect(result.data.correctCount).toBe(6);
            expect(result.data.accuracy).toBe(60); // 6/10 * 100
            expect(result.data.avgDuration).toBe(5000);
            expect(result.data.errorTags).toEqual(['Tag1', 'Tag2']);

            // Verify Dimensions
            const knowledge = result.data.dimensionStats?.find((d: any) => d.axis === '识记');
            const understanding = result.data.dimensionStats?.find((d: any) => d.axis === '理解');
            const application = result.data.dimensionStats?.find((d: any) => d.axis === '应用');

            expect(knowledge?.value).toBe(80); // 4/5 * 100
            expect(understanding?.value).toBe(40); // 2/5 * 100
            expect(application?.value).toBe(0); // Default to 0 if missing
        });

        it('should return null if no stats found', async () => {
            mockDb.get.mockResolvedValueOnce(null);

            const result = await getSessionReportAction('session-1');
            expect(result.data?.success).toBe(false);
        });
    });

    describe('generateDeepAnalysisAction', () => {
        it('should identify repeated error patterns and generate report', async () => {
            // 模拟 getDeepAnalysisData 的数据
            mockDb.get.mockResolvedValueOnce({ total: 10, correct: 6, avgDuration: 5000 }); // stats

            mockDb.all
                .mockResolvedValueOnce([
                    { tag: 'Tag1', total: 5, correct: 2 }, // 3 errors
                    { tag: 'Tag2', total: 3, correct: 3 }, // 0 errors
                    { tag: 'Tag3', total: 2, correct: 1 }  // 1 error
                ]) // tagStatsRows
                .mockResolvedValueOnce([
                    { dimension: 'knowledge', total: 5, correct: 4 }
                ]); // dimensionRows

            const result = await generateDeepAnalysisAction({ sessionId: 'session-1', forceRegenerate: true });

            expect(result.data?.success).toBe(true);
            expect(result.data?.report).toBe('AI Analysis Report');
            expect(mockDb.update).toHaveBeenCalled();
        });
    });
});
