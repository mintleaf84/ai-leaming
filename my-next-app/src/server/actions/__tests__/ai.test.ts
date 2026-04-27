// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.setConfig({ testTimeout: 15000 });

// 辅助函数：复用源码中的哈希逻辑以验证 Key
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

// 1. 使用 hoisted 定义 Drizzle Mock 链
const { mockDrizzleDb } = vi.hoisted(() => {
    const makeChain = () => {
        const chain: any = {
            then: vi.fn((resolve) => resolve([])),
        };
        const methods = [
            'insert', 'values', 'update', 'set', 'delete', 'select', 'from', 
            'where', 'limit', 'onConflictDoUpdate', 'returning'
        ];
        methods.forEach((m) => {
            chain[m] = vi.fn(() => chain);
        });
        return chain;
    };
    return { mockDrizzleDb: makeChain() };
});

// 2. 注册 Mock
vi.mock('@/lib/db', () => ({ 
    drizzleDb: mockDrizzleDb,
}));

vi.mock('@/lib/db/drizzle-schema', () => ({
    ai_quiz_cache: { hash: 'ai_quiz_cache.hash', data: 'ai_quiz_cache.data' },
    ai_challenge_cache: { hash: 'ai_challenge_cache.hash', data: 'ai_challenge_cache.data' },
    first_principles_cache: { question_hash: 'first_principles_cache.question_hash', analysis: 'first_principles_cache.analysis' },
}));

// Mock AI Client & Prompts
const { mockGenerateStructuredData, mockGenerateTextWrapper, mockGetPromptFromDb, mockCheckAndConsumeQuota } = vi.hoisted(() => {
    return {
        mockGenerateStructuredData: vi.fn(),
        mockGenerateTextWrapper: vi.fn(),
        mockGetPromptFromDb: vi.fn(),
        mockCheckAndConsumeQuota: vi.fn().mockReturnValue({ allowed: true }),
    };
});

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

describe('AI Actions (Drizzle 重构版)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckAndConsumeQuota.mockReturnValue({ allowed: true });
        
        // 重置 Drizzle 链式行为
        const chain = mockDrizzleDb as any;
        [
            'insert', 'values', 'update', 'set', 'delete', 'select', 'from', 
            'where', 'limit', 'onConflictDoUpdate', 'returning'
        ].forEach(m => chain[m].mockReturnValue(chain));
        chain.then.mockImplementation((resolve: any) => resolve([]));
    });

    describe('generateCorrectionQuizAction', () => {
        it('应该返回 AI 生成的测试题并保存到缓存', async () => {
            const mockQuiz = {
                analysis: 'Analysis',
                distinctionPoint: 'Point',
                quiz: { content: 'Q', options: ['A', 'B'], answer: 'A', explanation: 'E' }
            };
            mockGenerateStructuredData.mockResolvedValue(mockQuiz);
            
            const chain = mockDrizzleDb as any;
            // 缓存未命中（返回空数组）
            chain.then.mockImplementationOnce((resolve: any) => resolve([]));

            const { generateCorrectionQuizAction } = await import('../ai');
            const result = await generateCorrectionQuizAction('Question', 'Wrong', 'Correct');

            expect(result).toEqual(mockQuiz);
            expect(mockCheckAndConsumeQuota).toHaveBeenCalledWith(1, 'review');
            expect(chain.insert).toHaveBeenCalled();
            expect(chain.values).toHaveBeenCalledWith(expect.objectContaining({
                hash: generateHash('Question' + 'Wrong' + 'Correct')
            }));
        });

        it('如果缓存命中，应该直接返回缓存结果', async () => {
            const cachedData = { analysis: 'Cached' };
            const chain = mockDrizzleDb as any;
            // 模拟缓存命中
            chain.then.mockImplementationOnce((resolve: any) => resolve([{ 
                data: JSON.stringify(cachedData) 
            }]));

            const { generateCorrectionQuizAction } = await import('../ai');
            const result = await generateCorrectionQuizAction('Q', 'W', 'C');

            expect(result).toEqual(cachedData);
            expect(mockGenerateStructuredData).not.toHaveBeenCalled();
        });
    });

    describe('generateFirstPrinciplesAction', () => {
        it('应该检查配额并保存到缓存', async () => {
            mockGenerateTextWrapper.mockResolvedValue({ text: 'Deep Logic' });
            
            const chain = mockDrizzleDb as any;
            // 缓存未命中
            chain.then.mockImplementationOnce((resolve: any) => resolve([]));

            const { generateFirstPrinciplesAction } = await import('../ai');
            const result = await generateFirstPrinciplesAction('Q', 'Exp', 'A', 'W');

            expect(result.analysis).toBe('Deep Logic');
            expect(mockCheckAndConsumeQuota).toHaveBeenCalledWith(1, 'first_principles');
            expect(chain.insert).toHaveBeenCalled();
        });
    });
});
