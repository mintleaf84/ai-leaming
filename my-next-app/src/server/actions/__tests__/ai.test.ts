// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

// 1. Mock Drizzle & Better-SQLite3
const { mockDrizzleDb, mockDrizzleSchema, mockBetterDb } = vi.hoisted(() => {
    // Drizzle Chain Mock
    const makeChain = () => {
        const chain: Record<string, any> = {};
        const methods = ['insert', 'values', 'update', 'set', 'delete', 'select', 'from', 'where', 'limit', 'onConflictDoUpdate'];
        methods.forEach((m) => {
            chain[m] = vi.fn(() => chain);
        });
        return chain;
    };

    const chain = makeChain();
    const mockDrizzleDb = {
        ...chain,
        query: {
            ai_quiz_cache: { findFirst: vi.fn() },
            ai_challenge_cache: { findFirst: vi.fn() },
            first_principles_cache: { findFirst: vi.fn() },
        },
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        select: vi.fn(() => chain),
    };

    const mockDrizzleSchema = {
        ai_quiz_cache: { hash: 'hash', data: 'data' },
        ai_challenge_cache: { hash: 'hash', data: 'data' },
        first_principles_cache: { question_hash: 'question_hash', analysis: 'analysis' },
    };

    // Legacy DB mock (if needed)
    const mockBetterDb = {
        prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn(), all: vi.fn() })),
        transaction: vi.fn((cb) => cb),
    };

    return { mockDrizzleDb, mockDrizzleSchema, mockBetterDb };
});

vi.mock('@/lib/db', () => ({
    default: mockBetterDb,
    drizzleDb: mockDrizzleDb,
    drizzleSchema: mockDrizzleSchema,
}));

// 2. Mock AI Client & Prompts
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

// Mock question service
vi.mock('@/lib/services/question', () => ({
    questionService: {
        searchSimilarQuestions: vi.fn()
    }
}));

describe('AI Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckAndConsumeQuota.mockReturnValue({ allowed: true });
        
        // Reset Drizzle Chain
        const chainMethods = ['values', 'set', 'where', 'limit', 'onConflictDoUpdate'];
        chainMethods.forEach(m => (mockDrizzleDb as any)[m].mockReturnValue(mockDrizzleDb));
        mockDrizzleDb.insert.mockReturnValue(mockDrizzleDb);
    });

    describe('generateCorrectionQuizAction', () => {
        it('should return AI-generated quiz and save to cache', async () => {
            const mockQuiz = {
                analysis: 'Analysis',
                distinctionPoint: 'Point',
                quiz: { content: 'Q', options: ['A', 'B'], answer: 'A', explanation: 'E' }
            };
            mockGenerateStructuredData.mockResolvedValue(mockQuiz);
            mockDrizzleDb.query.ai_quiz_cache.findFirst.mockResolvedValue(null);

            const { generateCorrectionQuizAction } = await import('../ai');
            const result = await generateCorrectionQuizAction('Question', 'Wrong', 'Correct');

            expect(result).toEqual(mockQuiz);
            expect(mockCheckAndConsumeQuota).toHaveBeenCalledWith(1, 'review');
            expect(mockDrizzleDb.insert).toHaveBeenCalled();
            expect(mockDrizzleDb.values).toHaveBeenCalledWith(expect.objectContaining({
                hash: generateHash('Question' + 'Wrong' + 'Correct')
            }));
        });

        it('should return cached result if exists', async () => {
            const cachedData = { analysis: 'Cached' };
            mockDrizzleDb.query.ai_quiz_cache.findFirst.mockResolvedValue({ 
                data: JSON.stringify(cachedData) 
            });

            const { generateCorrectionQuizAction } = await import('../ai');
            const result = await generateCorrectionQuizAction('Q', 'W', 'C');

            expect(result).toEqual(cachedData);
            expect(mockGenerateStructuredData).not.toHaveBeenCalled();
        });
    });

    describe('generateFirstPrinciplesAction', () => {
        it('should check quota and save cache', async () => {
            mockGenerateTextWrapper.mockResolvedValue({ text: 'Deep Logic' });
            mockDrizzleDb.query.first_principles_cache.findFirst.mockResolvedValue(null);

            const { generateFirstPrinciplesAction } = await import('../ai');
            const result = await generateFirstPrinciplesAction('Q', 'Exp', 'A', 'W');

            expect(result.analysis).toBe('Deep Logic');
            expect(mockCheckAndConsumeQuota).toHaveBeenCalledWith(1, 'first_principles');
            expect(mockDrizzleDb.insert).toHaveBeenCalled();
        });
    });
});
