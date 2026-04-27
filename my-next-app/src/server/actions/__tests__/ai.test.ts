// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drizzleDb } from '@/lib/db';
import { resetDrizzleMock } from '@/lib/db/__mocks__';
import { generateCorrectionQuizAction, generateFirstPrinciplesAction } from '../ai';

vi.setConfig({ testTimeout: 15000 });

// 只需要这两行，Vitest 自动加载 __mocks__
vi.mock('@/lib/db');
vi.mock('@/lib/db/drizzle-schema');

// Mock AI Client & Prompts
const { mockGenerateStructuredData, mockGenerateTextWrapper, mockGetPromptFromDb, mockCheckAndConsumeQuota } = vi.hoisted(() => ({
    mockGenerateStructuredData: vi.fn(),
    mockGenerateTextWrapper: vi.fn(),
    mockGetPromptFromDb: vi.fn(),
    mockCheckAndConsumeQuota: vi.fn().mockReturnValue({ allowed: true }),
}));

vi.mock('@/lib/ai/client', () => ({
    generateStructuredData: mockGenerateStructuredData,
    generateTextWrapper: mockGenerateTextWrapper
}));

vi.mock('@/lib/ai/prompts', () => ({
    getPromptFromDb: mockGetPromptFromDb,
    buildPrompt: vi.fn((template, _vars) => template),
    DEFAULT_CORRECTION_PROMPT: 'default correction prompt',
    DEFAULT_REGRESSION_PROMPT: 'default regression prompt'
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1, role: 'user' }),
}));

vi.mock('@/lib/billing/subscription-service', () => ({
    checkAndConsumeQuota: mockCheckAndConsumeQuota,
}));

vi.mock('@/lib/services/question', () => ({
    questionService: {
        searchSimilarQuestions: vi.fn()
    }
}));

vi.mock('@/lib/logger', () => ({
    default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}));

// 辅助函数：复用源码中的哈希逻辑
function generateHash(content: string): string {
  const normalized = content.trim().slice(0, 100) + content.length;
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

describe('AI Actions (使用全局 Manual Mock)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetDrizzleMock();
        mockCheckAndConsumeQuota.mockReturnValue({ allowed: true });
    });

    describe('generateCorrectionQuizAction', () => {
        it('应该返回 AI 生成的测试题并保存到缓存', async () => {
            const mockQuiz = {
                analysis: 'Analysis',
                distinctionPoint: 'Point',
                quiz: { content: 'Q', options: ['A', 'B'], answer: 'A', explanation: 'E' }
            };
            mockGenerateStructuredData.mockResolvedValue(mockQuiz);
            (drizzleDb as any).then.mockImplementationOnce((resolve: any) => resolve([]));

            const result = await generateCorrectionQuizAction('Question', 'Wrong', 'Correct');

            expect(result).toEqual(mockQuiz);
            expect(drizzleDb.insert).toHaveBeenCalled();
            expect(drizzleDb.values).toHaveBeenCalledWith(expect.objectContaining({
                hash: generateHash('Question' + 'Wrong' + 'Correct')
            }));
        });

        it('如果缓存命中，应该直接返回缓存结果', async () => {
            const cachedData = { analysis: 'Cached' };
            (drizzleDb as any).then.mockImplementationOnce((resolve: any) => resolve([{ 
                data: JSON.stringify(cachedData) 
            }]));

            const result = await generateCorrectionQuizAction('Q', 'W', 'C');

            expect(result).toEqual(cachedData);
            expect(mockGenerateStructuredData).not.toHaveBeenCalled();
        });
    });

    describe('generateFirstPrinciplesAction', () => {
        it('应该检查配额并保存到缓存', async () => {
            mockGenerateTextWrapper.mockResolvedValue({ text: 'Deep Logic' });
            (drizzleDb as any).then.mockImplementationOnce((resolve: any) => resolve([]));

            const result = await generateFirstPrinciplesAction('Q', 'Exp', 'A', 'W');

            expect(result.analysis).toBe('Deep Logic');
            expect(drizzleDb.insert).toHaveBeenCalled();
        });
    });
});
