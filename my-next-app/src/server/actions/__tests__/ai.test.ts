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

// 1. Mock dependencies - 使用 vi.hoisted 内联创建，避免 require() 路径问题
const { mockBetterDb } = vi.hoisted(() => {
    const calls: { sql: string; args: unknown[] }[] = [];

    const mockRun = vi.fn().mockImplementation(() => ({ lastInsertRowid: 100, changes: 1 }));
    const mockGet = vi.fn();
    const mockAll = vi.fn();

    const prepare = vi.fn().mockImplementation((sql: string) => ({
        run: vi.fn().mockImplementation((...args: unknown[]) => {
            calls.push({ sql, args });
            return mockRun(...args);
        }),
        get: vi.fn().mockImplementation((...args: unknown[]) => {
            calls.push({ sql, args });
            return mockGet(...args);
        }),
        all: vi.fn().mockImplementation((...args: unknown[]) => {
            calls.push({ sql, args });
            return mockAll(...args);
        }),
    }));

    // better-sqlite3 的 transaction() 返回一个函数，调用该函数时才执行事务
    const transaction = vi.fn().mockImplementation((cb: (...args: unknown[]) => unknown) => {
        return vi.fn().mockImplementation((...args: unknown[]) => cb(...args));
    });

    return {
        mockBetterDb: {
            prepare,
            transaction,
            exec: vi.fn(),
            _mockRun: mockRun,
            _mockGet: mockGet,
            _mockAll: mockAll,
            _state: { get calls() { return calls; } },
            reset: () => {
                calls.length = 0;
                mockRun.mockReset();
                mockRun.mockImplementation(() => ({ lastInsertRowid: 100, changes: 1 }));
                mockGet.mockReset();
                mockAll.mockReset();
                prepare.mockClear();
                transaction.mockClear();
            },
        }
    };
});

// Mock dependencies (other)
const { mockGenerateStructuredData, mockGenerateTextWrapper, mockQuestionService, mockGetPromptFromDbSync, mockCheckAndConsumeQuota } = vi.hoisted(() => {
    return {
        mockGenerateStructuredData: vi.fn(),
        mockGenerateTextWrapper: vi.fn(),
        mockQuestionService: {
            searchSimilarQuestions: vi.fn()
        },
        mockGetPromptFromDbSync: vi.fn(),
        mockCheckAndConsumeQuota: vi.fn().mockReturnValue({ allowed: true }),
    };
});

vi.mock('@/lib/db', () => ({
    default: mockBetterDb
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

describe('AI Actions', () => {
    beforeEach(() => {
        mockBetterDb.reset();
        vi.clearAllMocks();
    });

    describe('generateCorrectionQuizAction', () => {
        it('should return AI-generated quiz on success and save to cache with correct key', async () => {
            const mockQuiz = {
                analysis: 'Analysis',
                distinctionPoint: 'Point',
                quiz: { content: 'Q', options: ['A', 'B'], answer: 'A', explanation: 'E' }
            };
            mockGenerateStructuredData.mockResolvedValue(mockQuiz);

            const { generateCorrectionQuizAction } = await import('../ai');
            const result = await generateCorrectionQuizAction('Question', 'Wrong', 'Correct');

            const expectedKey = generateHash('Question' + 'Wrong' + 'Correct');
            
            expect(result).toEqual(mockQuiz);
            
            // 验证缓存写入使用了正确的 Key
            const calls = mockBetterDb._state.calls;
            const insertCall = calls.find((c: any) => c.sql.includes('INSERT OR REPLACE INTO ai_quiz_cache'));
            expect(insertCall?.args[0]).toBe(expectedKey);
            expect(insertCall?.args[1]).toBe(JSON.stringify(mockQuiz));
        });
    });

    describe('generateFirstPrinciplesAction', () => {
        it('should check quota for CORRECT user and save cache', async () => {
            mockGenerateTextWrapper.mockResolvedValue({ text: 'Deep Logic' });

            const { generateFirstPrinciplesAction } = await import('../ai');
            const result = await generateFirstPrinciplesAction('Q', 'Exp', 'A', 'W');

            const expectedKey = generateHash('Q' + 'A' + 'W');
            
            expect(result.analysis).toBe('Deep Logic');
            // 验证配额消费的目标用户 ID（应该是 1）
            expect(mockCheckAndConsumeQuota).toHaveBeenCalledWith(1, 'first_principles');
            
            // 验证缓存写入
            const calls = mockBetterDb._state.calls;
            const insertCall = calls.find((c: any) => c.sql.includes('INSERT OR REPLACE INTO first_principles_cache'));
            expect(insertCall?.args[0]).toBe(expectedKey);
        });
    });
});
