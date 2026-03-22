// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
const { mockBetterDb } = vi.hoisted(() => {
    const { createBetterDbMock } = require('../../../lib/__tests__/db-mock-utils');
    return {
        mockBetterDb: createBetterDbMock()
    };
});

vi.mock('@/lib/db', () => ({
    default: mockBetterDb
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock('@/lib/services/mastery', () => ({
    masteryService: { updateMastery: vi.fn() }
}));

vi.mock('@/lib/import/fenbi-parser', () => ({
    validateFenbiJson: vi.fn(),
    parseFenbiData: vi.fn(),
}));

import { validateFenbiJson, parseFenbiData } from '@/lib/import/fenbi-parser';
import { importFenbiDataAction } from '../import';

describe('Import Actions', () => {
    beforeEach(() => {
        mockBetterDb.reset();
        vi.clearAllMocks();
    });

    it('should successfully import valid data with new questions', async () => {
        // Setup Parser Mocks
        vi.mocked(validateFenbiJson).mockReturnValue({ valid: true });
        vi.mocked(parseFenbiData).mockReturnValue({
            sessionName: 'Test Session',
            totalCount: 1,
            correctCount: 1,
            errorCount: 0,
            statsCount: 0,
            questions: [{
                externalId: 'ext-1', content: 'Q1', contentHtml: '<p>Q1</p>',
                type: 'single', options: ['A', 'B'], answer: 'A',
                explanation: 'Exp', explanationHtml: '<p>Exp</p>',
                tags: ['Tag1'], dimension: 'knowledge', source: 'fenbi',
                stats: { correctRatio: 0.8, mostWrongAnswer: 'B', totalAnswers: 100 }
            }],
            records: [{ externalId: 'ext-1', userAnswer: 'A', isCorrect: true, durationMs: 1000 }]
        });

        const result = await importFenbiDataAction('{}', '{}');

        expect(result.success).toBe(true);
        expect(mockBetterDb.transaction).toHaveBeenCalled();
        expect(mockBetterDb._state.wasCommitted).toBe(true);
        
        // 验证插入练习会话
        const calls = mockBetterDb._state.calls;
        const sessionCall = calls.find((c: any) => c.sql.includes('INSERT INTO practice_sessions'));
        expect(sessionCall).toBeDefined();
        expect(sessionCall?.args).toContain('Test Session');

        // 验证题目 JSON
        const questionsJson = sessionCall?.args[6];
        const parsedQuestions = JSON.parse(questionsJson);
        expect(parsedQuestions).toHaveLength(1);
        expect(parsedQuestions[0].externalId).toBe('ext-1');
    });

    it('should rollback transaction if middle step fails', async () => {
        vi.mocked(validateFenbiJson).mockReturnValue({ valid: true });
        vi.mocked(parseFenbiData).mockReturnValue({
            sessionName: 'Fail Session',
            totalCount: 1, correctCount: 0, errorCount: 0, statsCount: 0,
            questions: [{ externalId: 'err-1', content: 'Err' } as any],
            records: []
        });

        // 模拟在第二次 SQL 调用时抛出错误
        let callCount = 0;
        mockBetterDb._mockRun.mockImplementation(() => {
            callCount++;
            if (callCount === 2) throw new Error('Middle Step Failed');
            return { lastInsertRowid: 100 };
        });

        const result = await importFenbiDataAction('{}', '{}');

        expect(result.success).toBe(false);
        expect(mockBetterDb._state.wasRolledBack).toBe(true);
        expect(mockBetterDb._state.wasCommitted).toBe(false);
    });
    
    it('should update existing questions instead of creating duplicates', async () => {
        vi.mocked(validateFenbiJson).mockReturnValue({ valid: true });
        vi.mocked(parseFenbiData).mockReturnValue({
            sessionName: 'Test', totalCount: 1, correctCount: 0, errorCount: 0, statsCount: 0,
            questions: [{ 
                externalId: 'ext-1', content: 'Updated', contentHtml: '<p>Updated</p>',
                explanation: 'Fixed Exp', explanationHtml: '<p>Fixed Exp</p>',
                options: [], answer: 'A', type: 'single', tags: [], dimension: 'knowledge',
                source: 'fenbi'
            }],
            records: []
        });

        // 模拟数据库已存在该题目 (externalId: 'ext-1')
        mockBetterDb._mockGet.mockReturnValueOnce({ id: 999 });

        const result = await importFenbiDataAction('{}', '{}');

        expect(result.success).toBe(true);
        expect(mockBetterDb.transaction).toHaveBeenCalled();
        
        // 验证是否调用了 UPDATE 语句
        const calls = mockBetterDb._state.calls;
        const updateCall = calls.find((c: any) => c.sql.includes('UPDATE questions'));
        expect(updateCall).toBeDefined();
        expect(updateCall?.args).toContain(999); // 验证 ID 匹配
    });

    it('should return error if validation fails', async () => {
        vi.mocked(validateFenbiJson).mockReturnValue({ valid: false, error: 'Invalid JSON' });
        const result = await importFenbiDataAction('invalid', 'invalid');
        expect(result.success).toBe(false);
        expect(result.message).toBe('Invalid JSON');
    });
});
