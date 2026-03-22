// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
const { mockDb, mockMasteryService } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
            transaction: vi.fn((cb) => cb()), // Mock transaction by executing callback immediately
        },
        mockMasteryService: {
            updateMastery: vi.fn(),
        }
    };
});

vi.mock('@/lib/db', () => ({
    default: mockDb
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock('@/lib/services/mastery', () => ({
    masteryService: mockMasteryService
}));

vi.mock('@/lib/import/fenbi-parser', () => ({
    validateFenbiJson: vi.fn(),
    parseFenbiData: vi.fn(),
}));

import { validateFenbiJson, parseFenbiData } from '@/lib/import/fenbi-parser';
import { importFenbiDataAction } from '../import';

describe('Import Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Helper to setup DB mocks
    const setupDbMocks = (existingQuestionId?: number) => {
        const mockRun = vi.fn().mockReturnValue({ lastInsertRowid: 100 });
        const mockGet = vi.fn().mockReturnValue(existingQuestionId ? { id: existingQuestionId } : undefined);

        mockDb.prepare.mockImplementation((sql: string) => {
            if (sql.includes('INSERT')) return { run: mockRun };
            if (sql.includes('SELECT') && sql.includes('FROM questions')) return { get: mockGet };
            if (sql.includes('UPDATE')) return { run: mockRun };
            return { run: mockRun, get: mockGet };
        });

        return { mockRun, mockGet };
    };

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
                externalId: 'ext-1',
                content: 'Question 1',
                contentHtml: '<p>Question 1</p>',
                type: 'single',
                options: ['A', 'B'],
                answer: 'A',
                explanation: 'Exp',
                explanationHtml: '<p>Exp</p>',
                tags: ['Tag1'],
                dimension: 'knowledge',
                source: 'fenbi',
                stats: { correctRatio: 0.8, mostWrongAnswer: 'B', totalAnswers: 100 }
            }],
            records: [{
                externalId: 'ext-1',
                userAnswer: 'A',
                isCorrect: true,
                durationMs: 1000
            }]
        });

        const { mockRun } = setupDbMocks(undefined);

        const result = await importFenbiDataAction('{}', '{}');

        expect(result.success).toBe(true);
        expect(mockDb.transaction).toHaveBeenCalled();
        
        // 验证插入练习会话
        expect(mockRun).toHaveBeenCalledWith(
            expect.stringContaining('fenbi_'), // sessionId
            1, // user_id
            'Test Session',
            1, // total
            1, // correct
            'import',
            expect.any(String) // questions_json
        );

        // 验证插入题目
        expect(mockRun).toHaveBeenCalledWith(
            'Question 1', 
            JSON.stringify(['A', 'B']), 
            'A', 
            'Exp', 
            JSON.stringify(['Tag1']), 
            'knowledge', 
            'single', 
            'ext-1', 
            'fenbi', 
            0.8, 
            'B', 
            null, 
            null
        );

        // 验证插入日志
        expect(mockRun).toHaveBeenCalledWith(
            expect.stringContaining('fenbi_'),
            1,
            100, // question_id
            'A',
            1,
            1000
        );
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

        const { mockRun } = setupDbMocks(999);

        const result = await importFenbiDataAction('{}', '{}');

        expect(result.success).toBe(true);
        expect(mockDb.transaction).toHaveBeenCalled();
        
        // 第 1 次调用是 INSERT INTO practice_sessions
        // 第 2 次调用是 UPDATE questions
        expect(mockRun).toHaveBeenNthCalledWith(2,
            null, null, 'Updated', 'Fixed Exp', 'single', 'A', '[]', 999
        );
    });

    it('should return error if database transaction fails', async () => {
        vi.mocked(validateFenbiJson).mockReturnValue({ valid: true });
        vi.mocked(parseFenbiData).mockReturnValue({
            sessionName: 'Fail', questions: [{ externalId: '1' } as any], records: [], totalCount: 1, correctCount: 0, errorCount: 1, statsCount: 0
        });

        mockDb.transaction.mockImplementationOnce(() => {
            throw new Error('DB Write Error');
        });

        const result = await importFenbiDataAction('{}', '{}');

        expect(result.success).toBe(false);
        expect(result.message).toContain('DB Write Error');
    });

    it('should return error if validation fails', async () => {
        vi.mocked(validateFenbiJson).mockReturnValue({ valid: false, error: 'Invalid JSON' });
        const result = await importFenbiDataAction('invalid', 'invalid');
        expect(result.success).toBe(false);
        expect(result.message).toBe('Invalid JSON');
    });
});
