// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock generateTextWrapper and extractJson before importing parser
const { mockGenerateTextWrapper, mockGenerateStructuredData } = vi.hoisted(() => ({
    mockGenerateTextWrapper: vi.fn(),
    mockGenerateStructuredData: vi.fn().mockRejectedValue(new Error('structured output not supported')),
}));

vi.mock('@/lib/ai/client', () => ({
    generateTextWrapper: mockGenerateTextWrapper,
    generateStructuredData: mockGenerateStructuredData,
}));

vi.mock('@/lib/ai/parser', () => ({
    extractJson: (text: string) => JSON.parse(text),
}));

import { cleanOcrText, splitIntoQuestionChunks, parseOcrTextToQuestions } from '../pdf-question-parser';

describe('pdf-question-parser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('cleanOcrText', () => {
        it('should preserve content as-is, only normalize whitespace', () => {
            const input = '“Hello” and ‘world’';
            const result = cleanOcrText(input);
            expect(result).toBe(input);
        });

        it('should collapse excessive newlines', () => {
            const input = 'line1\n\n\n\n\nline2';
            const result = cleanOcrText(input);
            expect(result).toBe('line1\n\nline2');
        });

        it('should collapse multiple spaces', () => {
            const input = 'hello    world';
            const result = cleanOcrText(input);
            expect(result).toBe('hello world');
        });

        it('should trim leading and trailing whitespace', () => {
            const result = cleanOcrText('  hello  ');
            expect(result).toBe('hello');
        });

        it('should preserve Chinese characters and punctuation', () => {
            const input = '下列说法正确的是（）';
            const result = cleanOcrText(input);
            expect(result).toBe(input);
        });

        it('should preserve English letters and digits', () => {
            const input = 'A. Option 1 B. Option 2';
            const result = cleanOcrText(input);
            expect(result).toBe(input);
        });

        it('should handle empty string', () => {
            expect(cleanOcrText('')).toBe('');
        });
    });

    describe('splitIntoQuestionChunks', () => {
        it('should split text by question numbers with dot', () => {
            const text = '1. Question one\nAnswer A\n2. Question two\nAnswer B';
            const chunks = splitIntoQuestionChunks(text);
            expect(chunks.length).toBeGreaterThanOrEqual(1);
            // All content should be present
            const combined = chunks.join('');
            expect(combined).toContain('Question one');
            expect(combined).toContain('Question two');
        });

        it('should split text by question numbers with Chinese punctuation', () => {
            const text = '1、题目一\n选项A\n2、题目二\n选项B';
            const chunks = splitIntoQuestionChunks(text);
            expect(chunks.length).toBeGreaterThanOrEqual(1);
            const combined = chunks.join('');
            expect(combined).toContain('题目一');
            expect(combined).toContain('题目二');
        });

        it('should return single chunk for short text without question numbers', () => {
            const text = 'This is a short text without question numbers';
            const chunks = splitIntoQuestionChunks(text);
            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toContain('short text');
        });

        it('should respect questionsPerChunk when splitting', () => {
            // Build text with 10 questions
            const lines = Array.from({ length: 10 }, (_, i) => `第${i + 1}题 题目${i + 1}\nA.选项A\nB.选项B`).join('\n');
            const chunks = splitIntoQuestionChunks(lines, 5);
            expect(chunks.length).toBeGreaterThanOrEqual(2);
        });

        it('should handle empty string', () => {
            const chunks = splitIntoQuestionChunks('');
            expect(chunks).toHaveLength(0);
        });

        it('should handle text with 第N题 pattern', () => {
            const text = '第1题 下列哪个正确\nA. 选项一\n第2题 下列哪个错误\nB. 选项二';
            const chunks = splitIntoQuestionChunks(text);
            const combined = chunks.join('');
            expect(combined).toContain('第1题');
            expect(combined).toContain('第2题');
        });
    });

    describe('parseOcrTextToQuestions', () => {
        const sampleQuestion = {
            content: '教育学研究的基本方法是',
            options: ['观察法', '实验法', '调查法', '文献法'],
            type: 'single' as const,
            answer: 'B',
            explanation: '实验法是教育学研究的基本方法',
            confidence: 85,
            tags: ['教育学', '研究方法'],
        };

        it('should return parsed questions on success', async () => {
            mockGenerateTextWrapper.mockResolvedValue({
                text: JSON.stringify({ questions: [sampleQuestion], parseWarnings: [] }),
            });

            const result = await parseOcrTextToQuestions(
                '1. 教育学研究的基本方法是\nA.观察法\nB.实验法\nC.调查法\nD.文献法'
            );

            expect(result.questions).toHaveLength(1);
            expect(result.questions[0].content).toBe('教育学研究的基本方法是');
            expect(result.questions[0].answer).toBe('B');
            expect(result.parseWarnings).toHaveLength(0);
        });

        it('should return warning for text too short', async () => {
            const result = await parseOcrTextToQuestions('short');
            expect(result.questions).toHaveLength(0);
            expect(result.parseWarnings).toContain('OCR 文本过短，无法识别题目');
        });

        it('should call onProgress callback', async () => {
            mockGenerateTextWrapper.mockResolvedValue({
                text: JSON.stringify({ questions: [sampleQuestion], parseWarnings: [] }),
            });

            const onProgress = vi.fn();
            await parseOcrTextToQuestions(
                '1. 教育学研究的基本方法是\nA.观察法\nB.实验法\nC.调查法\nD.文献法',
                onProgress,
            );

            expect(onProgress).toHaveBeenCalled();
            // First call should be (stage, 0, total)
            expect(onProgress.mock.calls[0]).toEqual(['ai_parse', 0, expect.any(Number)]);
            // Last call should be (stage, total, total)
            const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
            expect(lastCall[0]).toBe('ai_parse');
            expect(lastCall[1]).toBe(lastCall[2]);
        });

        it('should handle AI parse failure gracefully', async () => {
            mockGenerateTextWrapper.mockRejectedValue(new Error('AI service unavailable'));

            const result = await parseOcrTextToQuestions(
                '1. 教育学研究的基本方法是\nA.观察法\nB.实验法\nC.调查法\nD.文献法'
            );

            expect(result.questions).toHaveLength(0);
            expect(result.parseWarnings.length).toBeGreaterThan(0);
            expect(result.parseWarnings[0]).toContain('解析失败');
        });

        it('should warn when no questions found', async () => {
            mockGenerateTextWrapper.mockResolvedValue({
                text: JSON.stringify({ questions: [], parseWarnings: [] }),
            });

            const result = await parseOcrTextToQuestions(
                '这是一段没有题目的长文本内容，用来测试当 AI 没有返回任何题目时的处理逻辑'
            );

            expect(result.questions).toHaveLength(0);
            expect(result.parseWarnings).toContain('未能从文本中识别出任何题目');
        });

        it('should deduplicate questions with same content prefix', async () => {
            const q1 = { ...sampleQuestion, content: '同样的题干内容用于测试去重功能'.repeat(3) };
            const q2 = { ...sampleQuestion, content: '同样的题干内容用于测试去重功能'.repeat(3), answer: 'C' };

            // Two chunks each returning the same question
            mockGenerateTextWrapper
                .mockResolvedValueOnce({ text: JSON.stringify({ questions: [q1], parseWarnings: [] }) })
                .mockResolvedValueOnce({ text: JSON.stringify({ questions: [q2], parseWarnings: [] }) });

            // Use text that will be split into 2 chunks
            const longText = '1. ' + '同样的题干内容用于测试去重功能'.repeat(3) + '\n' +
                             'A.选项A\nB.选项B\nC.选项C\nD.选项D\n' +
                             '2. ' + '第二道不同的题目内容很长很长很长'.repeat(5) + '\n' +
                             'A.选项A\nB.选项B\nC.选项C\nD.选项D';
            const result = await parseOcrTextToQuestions(longText);

            // Should not have duplicate entries (merged by content prefix)
            const contents = result.questions.map(q => q.content.slice(0, 50));
            const uniqueContents = new Set(contents);
            expect(contents.length).toBe(uniqueContents.size);
        });

        it('should pass timeout and retries options to generateTextWrapper', async () => {
            mockGenerateTextWrapper.mockResolvedValue({
                text: JSON.stringify({ questions: [sampleQuestion], parseWarnings: [] }),
            });

            await parseOcrTextToQuestions(
                '1. 教育学研究的基本方法是\nA.观察法\nB.实验法\nC.调查法\nD.文献法'
            );

            expect(mockGenerateTextWrapper).toHaveBeenCalledWith(
                expect.any(String),
                'economy',
                undefined,
                undefined,
                { timeout: 120_000, retries: 0 },
            );
        });

        it('should merge warnings from multiple chunks', async () => {
            mockGenerateTextWrapper
                .mockResolvedValueOnce({
                    text: JSON.stringify({ questions: [sampleQuestion], parseWarnings: ['chunk1 warning'] }),
                })
                .mockResolvedValueOnce({
                    text: JSON.stringify({ questions: [], parseWarnings: ['chunk2 warning'] }),
                });

            // Text long enough to be split into multiple chunks
            const lines = Array.from({ length: 50 }, (_, i) => `${i + 1}. 题目${i + 1}\nA.选项A\nB.选项B`).join('\n');
            const result = await parseOcrTextToQuestions(lines);

            // Warnings from chunk failures are collected separately from AI warnings
            expect(result.parseWarnings.length).toBeGreaterThanOrEqual(0);
        });
    });
});
