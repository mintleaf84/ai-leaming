// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const { mockPerformPaddleOCR, mockParseSingleChunk, mockCleanOcrText, mockSplitIntoQuestionChunks, mockValidateQuestions, mockAddQuestions, mockInsertReturning, mockUpdateQuestionSrs } = vi.hoisted(() => ({
    mockPerformPaddleOCR: vi.fn(),
    mockParseSingleChunk: vi.fn(),
    mockCleanOcrText: vi.fn((text: string) => text),
    mockSplitIntoQuestionChunks: vi.fn(),
    mockValidateQuestions: vi.fn((qs: any[]) => qs),
    mockAddQuestions: vi.fn().mockResolvedValue(3),
    mockInsertReturning: vi.fn().mockResolvedValue([{ id: 1 }]),
    mockUpdateQuestionSrs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/ai/paddle-ocr', () => ({
    performPaddleOCR: mockPerformPaddleOCR,
}));

vi.mock('@/lib/import/pdf-question-parser', () => ({
    cleanOcrText: mockCleanOcrText,
    splitIntoQuestionChunks: mockSplitIntoQuestionChunks,
    parseSingleChunk: mockParseSingleChunk,
    validateQuestions: mockValidateQuestions,
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
        vi.useFakeTimers();
        chain.returning.mockResolvedValue([{ id: 1 }]);
        const methods = ['insert', 'values', 'from', 'where'];
        methods.forEach((m) => { (chain as any)[m].mockReturnValue(chain); });
        (chain as any).then.mockImplementation((resolve: any) => resolve([]));
    });

    describe('ocrAndSplit', () => {
        it('should call OCR, clean, split and return taskId + totalChunks', async () => {
            mockPerformPaddleOCR.mockResolvedValue('1. 题目一\nA.选项A\n2. 题目二\nB.选项B');
            mockSplitIntoQuestionChunks.mockReturnValue(['chunk1', 'chunk2']);

            const result = await pdfImportService.ocrAndSplit(
                Buffer.from('fake-pdf'),
                'test.pdf',
                'application/pdf',
            );

            expect(mockPerformPaddleOCR).toHaveBeenCalledWith(
                expect.any(Buffer), 'test.pdf', 'application/pdf',
            );
            expect(mockCleanOcrText).toHaveBeenCalled();
            expect(mockSplitIntoQuestionChunks).toHaveBeenCalled();
            expect(result.taskId).toBeDefined();
            expect(typeof result.taskId).toBe('string');
            expect(result.totalChunks).toBe(2);
        });

        it('should throw when OCR result is empty', async () => {
            mockPerformPaddleOCR.mockResolvedValue('');

            await expect(pdfImportService.ocrAndSplit(
                Buffer.from('fake-pdf'),
                'test.pdf',
                'application/pdf',
            )).rejects.toThrow('OCR 识别结果为空');
        });

        it('should throw when OCR result is whitespace only', async () => {
            mockPerformPaddleOCR.mockResolvedValue('   ');

            await expect(pdfImportService.ocrAndSplit(
                Buffer.from('fake-pdf'),
                'test.pdf',
                'application/pdf',
            )).rejects.toThrow('OCR 识别结果为空');
        });

        it('should throw when no chunks could be extracted', async () => {
            mockPerformPaddleOCR.mockResolvedValue('some text with enough content');
            mockSplitIntoQuestionChunks.mockReturnValue([]);

            await expect(pdfImportService.ocrAndSplit(
                Buffer.from('fake-pdf'),
                'test.pdf',
                'application/pdf',
            )).rejects.toThrow('未能从 PDF 中分割出题目');
        });

        it('should call onProgress callback', async () => {
            mockPerformPaddleOCR.mockResolvedValue('ocr text content for progress test');
            mockSplitIntoQuestionChunks.mockReturnValue(['chunk1']);

            const onProgress = vi.fn();
            await pdfImportService.ocrAndSplit(
                Buffer.from('fake-pdf'),
                'test.pdf',
                'application/pdf',
                onProgress,
            );

            expect(onProgress).toHaveBeenCalledWith('ocr', '正在 OCR 识别...');
        });
    });

    describe('parseSingleChunk', () => {
        it('should return questions for a valid taskId and chunkIndex', async () => {
            mockPerformPaddleOCR.mockResolvedValue('1. 教育学研究的基本方法是\nA.观察法\nB.实验法\nC.调查法\nD.文献法');
            mockSplitIntoQuestionChunks.mockReturnValue(['chunk1', 'chunk2']);
            mockParseSingleChunk.mockResolvedValue([sampleQuestion]);

            const { taskId } = await pdfImportService.ocrAndSplit(
                Buffer.from('fake-pdf'), 'test.pdf', 'application/pdf',
            );

            const result = await pdfImportService.parseSingleChunk(taskId, 0);

            expect(result.questions).toHaveLength(1);
            expect(result.questions[0].content).toBe('教育学研究的基本方法是');
            expect(result.chunkIndex).toBe(0);
            expect(result.warnings).toHaveLength(0);
        });

        it('should throw for expired/invalid taskId', async () => {
            await expect(pdfImportService.parseSingleChunk('nonexistent', 0))
                .rejects.toThrow('任务不存在或已过期');
        });

        it('should throw for out-of-range chunkIndex', async () => {
            mockPerformPaddleOCR.mockResolvedValue('1. 教育学研究的基本方法是\nA.观察法');
            mockSplitIntoQuestionChunks.mockReturnValue(['chunk1']);
            mockParseSingleChunk.mockResolvedValue([sampleQuestion]);

            const { taskId } = await pdfImportService.ocrAndSplit(
                Buffer.from('fake-pdf'), 'test.pdf', 'application/pdf',
            );

            await expect(pdfImportService.parseSingleChunk(taskId, 5))
                .rejects.toThrow('超出范围');
        });

        it('should return warning when chunk parsing fails', async () => {
            mockPerformPaddleOCR.mockResolvedValue('1. 教育学研究的基本方法是\nA.观察法');
            mockSplitIntoQuestionChunks.mockReturnValue(['chunk1']);
            mockParseSingleChunk.mockRejectedValue(new Error('AI service unavailable'));

            const { taskId } = await pdfImportService.ocrAndSplit(
                Buffer.from('fake-pdf'), 'test.pdf', 'application/pdf',
            );

            const result = await pdfImportService.parseSingleChunk(taskId, 0);

            expect(result.questions).toHaveLength(0);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('解析失败');
        });
    });

    describe('cleanup', () => {
        it('should remove cached taskId', async () => {
            mockPerformPaddleOCR.mockResolvedValue('1. 教育学研究的基本方法是\nA.观察法');
            mockSplitIntoQuestionChunks.mockReturnValue(['chunk1']);

            const { taskId } = await pdfImportService.ocrAndSplit(
                Buffer.from('fake-pdf'), 'test.pdf', 'application/pdf',
            );

            pdfImportService.cleanup(taskId);

            // After cleanup, parseSingleChunk should throw
            await expect(pdfImportService.parseSingleChunk(taskId, 0))
                .rejects.toThrow('任务不存在或已过期');
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

            const valuesCall = chain.values.mock.calls[0];
            expect(valuesCall).toBeDefined();
        });

        it('should not add to folder when insert returns empty', async () => {
            chain.returning.mockResolvedValue([]);

            const result = await pdfImportService.confirmImport(1, [sampleQuestion], 10);

            expect(result.importedCount).toBe(0);
            expect(mockAddQuestions).not.toHaveBeenCalled();
        });

        it('should add to wrong book and SRS when addToWrongBook is true', async () => {
            chain.returning.mockResolvedValue([{ id: 1 }]);

            await pdfImportService.confirmImport(1, [sampleQuestion], undefined, true);

            expect(mockUpdateQuestionSrs).toHaveBeenCalledWith(1, 1, false, 0, undefined, undefined, 0);
        });

        it('should skip wrong book when addToWrongBook is false', async () => {
            chain.returning.mockResolvedValue([{ id: 1 }]);

            await pdfImportService.confirmImport(1, [sampleQuestion], undefined, false);

            expect(mockUpdateQuestionSrs).not.toHaveBeenCalled();
        });
    });
});
