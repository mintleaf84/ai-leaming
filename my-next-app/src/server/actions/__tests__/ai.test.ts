// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
const { mockGenerateStructuredData, mockGenerateTextWrapper, mockQuestionService, mockGetPromptFromDbSync, mockDb } = vi.hoisted(() => {
    return {
        mockGenerateStructuredData: vi.fn(),
        mockGenerateTextWrapper: vi.fn(),
        mockQuestionService: {
            searchSimilarQuestions: vi.fn()
        },
        mockGetPromptFromDbSync: vi.fn(),
        mockDb: {
            prepare: vi.fn().mockReturnValue({
                get: vi.fn().mockReturnValue(undefined),
                run: vi.fn(),
            }),
            exec: vi.fn(),
        }
    };
});

vi.mock('@/lib/db', () => ({
    default: mockDb
}));

vi.mock('@/lib/ai/client', () => ({
    generateStructuredData: mockGenerateStructuredData,
    generateTextWrapper: mockGenerateTextWrapper
}));

vi.mock('@/lib/services/question', () => ({
    questionService: mockQuestionService
}));

vi.mock('@/lib/ai/prompts', () => ({
    getPromptFromDbSync: mockGetPromptFromDbSync,
    buildPrompt: vi.fn((template, vars) => template),
    DEFAULT_CORRECTION_PROMPT: 'default correction prompt',
    DEFAULT_REGRESSION_PROMPT: 'default regression prompt'
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1, role: 'user' }),
}));

vi.mock('@/lib/billing/subscription-service', () => ({
    checkAndConsumeQuota: vi.fn().mockReturnValue({ allowed: true }),
}));

describe('AI Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // 重置 db mock 的默认行为：缓存表创建和缓存查找
        mockDb.exec.mockImplementation(() => {});
        mockDb.prepare.mockReturnValue({
            get: vi.fn().mockReturnValue(undefined), // 缓存未命中
            run: vi.fn(),
        });
    });

    describe('generateCorrectionQuizAction', () => {
        it('should return AI-generated quiz on success', async () => {
            const mockQuiz = {
                analysis: 'Analysis',
                distinctionPoint: 'Point',
                quiz: { content: 'Q', options: ['A', 'B'], answer: 'A', explanation: 'E' }
            };
            mockGenerateStructuredData.mockResolvedValue(mockQuiz);

            const { generateCorrectionQuizAction } = await import('../ai');
            const result = await generateCorrectionQuizAction('Question', 'Wrong', 'Correct');

            expect(result).toEqual(mockQuiz);
            expect(mockGenerateStructuredData).toHaveBeenCalled();
        });

        it('should fallback to RAG when AI fails', async () => {
            mockGenerateStructuredData.mockRejectedValue(new Error('AI Error'));
            mockQuestionService.searchSimilarQuestions.mockResolvedValue([{
                content: 'Similar Q',
                options: '["A","B"]',
                answer: 'A',
                explanation: 'Exp'
            }]);

            const { generateCorrectionQuizAction } = await import('../ai');
            const result = await generateCorrectionQuizAction('Question', 'Wrong', 'Correct');

            expect(result.analysis).toContain('AI 生成暂时不可用');
            expect(result.quiz.content).toBe('Similar Q');
            expect(mockQuestionService.searchSimilarQuestions).toHaveBeenCalled();
        });
    });

    describe('generateRegressionChallengeAction', () => {
        it('should return AI-generated challenge when validation passes', async () => {
            const mockChallenge = {
                logicType: 'complement',
                challenges: [{ content: 'C1' }, { content: 'C2' }, { content: 'C3' }]
            };
            mockGenerateStructuredData.mockResolvedValue(mockChallenge);
            mockGenerateTextWrapper.mockResolvedValue({ text: 'YES' });

            const { generateRegressionChallengeAction } = await import('../ai');
            const result = await generateRegressionChallengeAction('Q', ['Tag']);

            expect(result).toEqual(mockChallenge);
        });

        it('should fallback to RAG when validation fails', async () => {
            mockGenerateStructuredData.mockResolvedValue({ logicType: 'test', challenges: [] });
            mockGenerateTextWrapper.mockResolvedValue({ text: 'NO' }); // 验证失败
            mockQuestionService.searchSimilarQuestions.mockResolvedValue([
                { content: 'Q1', options: '["A"]', answer: 'A', explanation: 'E1' },
                { content: 'Q2', options: '["B"]', answer: 'B', explanation: 'E2' },
                { content: 'Q3', options: '["C"]', answer: 'C', explanation: 'E3' }
            ]);

            const { generateRegressionChallengeAction } = await import('../ai');
            const result = await generateRegressionChallengeAction('Q', ['Tag']);

            expect(result.logicType).toBe('complement');
            expect(result.challenges).toHaveLength(3);
            expect(mockQuestionService.searchSimilarQuestions).toHaveBeenCalled();
        });
    });
});
