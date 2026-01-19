// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
const { mockDb, mockMasteryService } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
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

// We check the real implementation of import.ts, so we don't mock parsing logic unless we want to isolate it.
// Given strict unit test requirement, let's mock the complex parser to focus on the Action logic (DB interactions).
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
            if (sql.includes('INSERT')) {
                return { run: mockRun };
            }
            if (sql.includes('SELECT') && sql.includes('FROM questions')) {
                return { get: mockGet };
            }
            if (sql.includes('UPDATE')) {
                return { run: mockRun };
            }
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

        // Setup DB Mocks (No existing question)
        const { mockRun } = setupDbMocks(undefined);

        const result = await importFenbiDataAction('{}', '{}');

        expect(result.success).toBe(true);
        expect(result.importedCount).toBe(1);
        expect(result.newQuestionsCount).toBe(1);

        // Verify Questions Inserted
        expect(mockRun).toHaveBeenCalledWith(
            'Question 1', // content
            expect.any(String), // options
            'A', // answer
            'Exp', // explanation
            expect.any(String), // tags
            'knowledge', // dimension
            'single', // type
            'ext-1', // external_id
            'fenbi', // source
            0.8, // correct_ratio
            'B', // most_wrong
            null, // material
            null // material_html
        );

        // Verify Logs Inserted
        expect(mockRun).toHaveBeenCalledWith(
            expect.stringContaining('fenbi_'), // session_id
            1, // user_id
            100, // question_id (from mock insert)
            'A', // user_answer
            1, // is_correct
            1000 // duration
        );

        // Verify Mastery Update
        expect(mockMasteryService.updateMastery).toHaveBeenCalledWith(
            1, 'Tag1', 'knowledge', true
        );
    });

    it('should update existing questions instead of creating duplicates', async () => {
        // Setup Parser Mocks
        vi.mocked(validateFenbiJson).mockReturnValue({ valid: true });
        vi.mocked(parseFenbiData).mockReturnValue({
            sessionName: 'Test Session',
            totalCount: 1,
            correctCount: 0,
            errorCount: 1,
            statsCount: 0,
            questions: [{
                externalId: 'ext-1',
                content: 'Updated Content',
                contentHtml: '<p>Updated Content</p>',
                type: 'single',
                options: ['A', 'B'],
                answer: 'A',
                explanation: 'Exp',
                explanationHtml: '<p>Exp</p>',
                tags: ['Tag1'],
                dimension: 'knowledge',
                source: 'fenbi'
            }],
            records: [] // No records for this test to focus on question update
        });

        // Setup DB Mocks (Existing question ID 999)
        const mockRun = vi.fn();
        const mockGet = vi.fn().mockReturnValue({ id: 999 });

        mockDb.prepare.mockImplementation((sql: string) => {
            if (sql.includes('SELECT') && sql.includes('external_id')) return { get: mockGet };
            if (sql.includes('UPDATE questions')) return { run: mockRun };
            return { run: mockRun, get: mockGet };
        });

        const result = await importFenbiDataAction('{}', '{}');

        expect(result.success).toBe(true);
        expect(result.skippedQuestionsCount).toBe(1);
        expect(result.newQuestionsCount).toBe(0);

        // Verify Update called
        expect(mockRun).toHaveBeenCalledWith(
            null, null, // materials
            'Updated Content',
            'Exp',
            'single',
            'A',
            expect.any(String),
            999 // WHERE id = ?
        );
    });

    it('should return error validation fails', async () => {
        vi.mocked(validateFenbiJson).mockReturnValue({ valid: false, error: 'Invalid JSON' });

        const result = await importFenbiDataAction('invalid', 'invalid');

        expect(result.success).toBe(false);
        expect(result.message).toBe('Invalid JSON');
    });
});
