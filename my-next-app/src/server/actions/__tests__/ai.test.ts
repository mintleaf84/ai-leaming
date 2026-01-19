// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateCorrectionQuizAction, generateRegressionChallengeAction } from '../ai';

// Mock dependencies
const { mockGenerateStructuredData, mockGenerateTextWrapper, mockQuestionService, mockGetPromptFromDbSync } = vi.hoisted(() => {
    return {
        mockGenerateStructuredData: vi.fn(),
        mockGenerateTextWrapper: vi.fn(),
        mockQuestionService: {
            searchSimilarQuestions: vi.fn()
        },
        mockGetPromptFromDbSync: vi.fn()
    };
});

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

describe('AI Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('generateCorrectionQuizAction', () => {
        it('should return AI-generated quiz on success', async () => {
            const mockQuiz = {
                analysis: 'Analysis',
                distinctionPoint: 'Point',
                quiz: { content: 'Q', options: ['A', 'B'], answer: 'A', explanation: 'E' }
            };
            mockGenerateStructuredData.mockResolvedValue(mockQuiz);

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

            const result = await generateRegressionChallengeAction('Q', ['Tag']);

            expect(result).toEqual(mockChallenge);
        });

        it('should fallback to RAG when validation fails', async () => {
            mockGenerateStructuredData.mockResolvedValue({ logicType: 'test', challenges: [] });
            mockGenerateTextWrapper.mockResolvedValue({ text: 'NO' }); // Validation fails
            mockQuestionService.searchSimilarQuestions.mockResolvedValue([
                { content: 'Q1', options: '["A"]', answer: 'A', explanation: 'E1' },
                { content: 'Q2', options: '["B"]', answer: 'B', explanation: 'E2' },
                { content: 'Q3', options: '["C"]', answer: 'C', explanation: 'E3' }
            ]);

            const result = await generateRegressionChallengeAction('Q', ['Tag']);

            expect(result.logicType).toBe('complement');
            expect(result.challenges).toHaveLength(3);
            expect(mockQuestionService.searchSimilarQuestions).toHaveBeenCalled();
        });
    });
});
