// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const { mockPerformPaddleOCR, mockParseOcrTextToQuestions, mockAddQuestions, mockInsertReturning, mockUpdateQuestionSrs } = vi.hoisted(() => ({
    mockPerformPaddleOCR: vi.fn(),
    mockParseOcrTextToQuestions: vi.fn(),
    mockAddQuestions: vi.fn().mockResolvedValue(3),
    mockInsertReturning: vi.fn().mockResolvedValue([{ id: 1 }]),
    mockUpdateQuestionSrs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/ai/paddle-ocr', () => ({
    performPaddleOCR: mockPerformPaddleOCR,
}));

vi.mock('@/lib/import/pdf-question-parser', () => ({
    parseOcrTextToQuestions: mockParseOcrTextToQuestions,
}));

vi.mock('../question-folder', () => ({
    questionFolderService: {
        addQuestions: mockAddQuestions,
        getFolders: vi.fn().mockResolvedValue([]),
    },
}));

// Mock drizzle DB
const makeChain = () => {
    const chain: any = {
        then: vi.fn((resolve: any) => resolve([])),
    };
    const methods = ['insert', 'values', 'update', 'set', 'delete', 'select', 'from', 'where', 'limit', 'offset', 'orderBy', 'all', 'returning'];
    methods.forEach((m) => { chain[m] = vi.fn(() => chain); });
    chain.returning = vi.fn().mockResolvedValue([{ id: 1 }]);
    return chain;
};

const chain = makeChain();

vi.mock('@/lib/db', () => ({
    drizzleDb: {
        insert: vi.fn(() => chain),
        select: vi.fn(() => chain),
        delete: vi.fn(() => chain),
    },
}));

vi.mock('@/lib/db/drizzle-schema', () => ({
    questions: { id: 'questions.id', content: 'questions.content', options: 'questions.options' },
    practice_logs: { id: 'practice_logs.id', question_id: 'practice_logs.question_id', user_id: 'practice_logs.user_id' },
}));

vi.mock('@/lib/services/srs', () => ({
    srsService: {
        updateQuestionSrs: mockUpdateQuestionSrs,
    },
}));

import { pdfImportService } from '../pdf-import';

const sampleQuestion = {
    content: '教育学研究的基本方法是',
    options: ['观察法', '实验法', '调查法', '文献法'],
    type: 'single' as const,
    answer: 'B',
    explanation: '实验法是教育学研究的基本方法',
    confidence: 85,
    tags: ['教育学'],
};

describe('pdfImportService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        chain.returning.mockResolvedValue([{ id: 1 }]);
        // Reset chain methods (excluding returning — it returns a promise, not chain)
        const methods = ['insert', 'values', 'from', 'where'];
        methods.forEach((m) => { (chain as any)[m].mockReturnValue(chain); });
        (chain as any).then.mockImplementation((resolve: any) => resolve([]));
    });

    describe('parseAndPreview', () => {
        it('should call OCR then AI parser and return preview', async () => {
            mockPerformPaddleOCR.mockResolvedValue('1. 教育学研究的基本方法是\nA.观察法\nB.实验法');
            mockParseOcrTextToQuestions.mockResolvedValue({
                questions: [sampleQuestion],
                parseWarnings: [],
            });

            const result = await pdfImportService.parseAndPreview(
                Buffer.from('fake-pdf'),
                'test.pdf',
                'application/pdf',
            );

            expect(mockPerformPaddleOCR).toHaveBeenCalledWith(
                expect.any(Buffer), 'test.pdf', 'application/pdf',
            );
            expect(mockParseOcrTextToQuestions).toHaveBeenCalled();
            expect(result.totalCount).toBe(1);
            expect(result.questions).toHaveLength(1);
            expect(result.questions[0].content).toBe('教育学研究的基本方法是');
        });

        it('should return warning when OCR result is empty', async () => {
            mockPerformPaddleOCR.mockResolvedValue('');

            const result = await pdfImportService.parseAndPreview(
                Buffer.from('fake-pdf'),
                'test.pdf',
                'application/pdf',
            );

            expect(result.totalCount).toBe(0);
            expect(result.questions).toHaveLength(0);
            expect(result.parseWarnings).toContain('OCR 识别结果为空，请检查 PDF 文件');
            expect(mockParseOcrTextToQuestions).not.toHaveBeenCalled();
        });

        it('should return warning when OCR result is whitespace only', async () => {
            mockPerformPaddleOCR.mockResolvedValue('   ');

            const result = await pdfImportService.parseAndPreview(
                Buffer.from('fake-pdf'),
                'test.pdf',
                'application/pdf',
            );

            expect(result.totalCount).toBe(0);
            expect(result.parseWarnings).toContain('OCR 识别结果为空，请检查 PDF 文件');
        });

        it('should forward parser warnings', async () => {
            mockPerformPaddleOCR.mockResolvedValue('some ocr text with enough content');
            mockParseOcrTextToQuestions.mockResolvedValue({
                questions: [],
                parseWarnings: ['AI 解析超时'],
            });

            const result = await pdfImportService.parseAndPreview(
                Buffer.from('fake-pdf'),
                'test.pdf',
                'application/pdf',
            );

            expect(result.parseWarnings).toContain('AI 解析超时');
        });

        it('should call onProgress callback', async () => {
            mockPerformPaddleOCR.mockResolvedValue('ocr text content for progress test');
            mockParseOcrTextToQuestions.mockResolvedValue({
                questions: [sampleQuestion],
                parseWarnings: [],
            });

            const onProgress = vi.fn();
            await pdfImportService.parseAndPreview(
                Buffer.from('fake-pdf'),
                'test.pdf',
                'application/pdf',
                onProgress,
            );

            expect(onProgress).toHaveBeenCalledWith('ocr', '正在 OCR 识别...');
            expect(onProgress).toHaveBeenCalledWith('ai_parse', '正在 AI 解析...');
        });
    });

    describe('confirmImport', () => {
        it('should insert questions and return success', async () => {
            const result = await pdfImportService.confirmImport(1, [sampleQuestion]);

            expect(result.success).toBe(true);
            expect(result.importedCount).toBe(1);
            expect(result.message).toContain('成功导入 1 道题目');
        });

        it('should insert multiple questions', async () => {
            chain.returning
                .mockResolvedValueOnce([{ id: 1 }])
                .mockResolvedValueOnce([{ id: 2 }])
                .mockResolvedValueOnce([{ id: 3 }]);

            const questions = [sampleQuestion, sampleQuestion, sampleQuestion];
            const result = await pdfImportService.confirmImport(1, questions);

            expect(result.success).toBe(true);
            expect(result.importedCount).toBe(3);
        });

        it('should add questions to folder when folderId provided', async () => {
            chain.returning.mockResolvedValue([{ id: 42 }]);

            await pdfImportService.confirmImport(1, [sampleQuestion], 10);

            expect(mockAddQuestions).toHaveBeenCalledWith(1, 10, [42]);
        });

        it('should not call addQuestions when no folderId', async () => {
            await pdfImportService.confirmImport(1, [sampleQuestion]);

            expect(mockAddQuestions).not.toHaveBeenCalled();
        });

        it('should return failure for empty questions array', async () => {
            const result = await pdfImportService.confirmImport(1, []);

            expect(result.success).toBe(false);
            expect(result.importedCount).toBe(0);
            expect(result.message).toBe('没有要导入的题目');
        });

        it('should serialize options and tags as JSON', async () => {
            await pdfImportService.confirmImport(1, [sampleQuestion]);

            // chain.values receives the insert payload; options/tags should be JSON strings
            const valuesArg = chain.values.mock.calls[0]?.[0];
            expect(valuesArg).toBeDefined();
            expect(typeof valuesArg.options).toBe('string');
            expect(JSON.parse(valuesArg.options)).toEqual(['观察法', '实验法', '调查法', '文献法']);
            expect(typeof valuesArg.tags).toBe('string');
            expect(JSON.parse(valuesArg.tags)).toEqual(['教育学']);
        });

        it('should handle database error gracefully', async () => {
            chain.returning.mockRejectedValue(new Error('DB write failed'));

            const result = await pdfImportService.confirmImport(1, [sampleQuestion]);

            expect(result.success).toBe(false);
            expect(result.importedCount).toBe(0);
            expect(result.message).toContain('导入失败');
            expect(result.message).toContain('DB write failed');
        });

        it('should set source as pdf_import', async () => {
            await pdfImportService.confirmImport(1, [sampleQuestion]);

            // The insert values should include source: 'pdf_import'
            const valuesCall = chain.values.mock.calls[0];
            expect(valuesCall).toBeDefined();
        });

        it('should not add to folder when insert returns empty', async () => {
            chain.returning.mockResolvedValue([]);

            const result = await pdfImportService.confirmImport(1, [sampleQuestion], 10);

            // importedCount should be 0 since no IDs returned
            expect(result.importedCount).toBe(0);
            expect(mockAddQuestions).not.toHaveBeenCalled();
        });
    });
});
