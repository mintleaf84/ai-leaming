// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as schema from '@/lib/db/drizzle-schema';
import { setupVitestMemoryDb } from '@/lib/__tests__/db-mock-utils';
import { eq } from 'drizzle-orm';

// 1. 设置数据库 Mock 持有者
const { actualSchema, mockDbHolder } = await vi.hoisted(async () => {
    const modSchema = await import('@/lib/db/drizzle-schema');
    return { 
        actualSchema: modSchema,
        mockDbHolder: { db: null as any }
    };
});

// 2. Mock 数据库模块
vi.mock('@/lib/db', () => ({
    drizzleDb: new Proxy({}, {
        get: (_, prop) => {
            if (!mockDbHolder.db) {
                throw new Error('测试数据库尚未初始化');
            }
            return mockDbHolder.db[prop];
        }
    }),
    drizzleSchema: actualSchema
}));

vi.setConfig({ testTimeout: 15000 });

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

import { generateCorrectionQuizAction, generateFirstPrinciplesAction } from '../ai';

describe('AI Actions (Real DB)', () => {
    let dbHelper: any;

    beforeEach(async () => {
        dbHelper = await setupVitestMemoryDb();
        mockDbHolder.db = dbHelper.db;
        vi.clearAllMocks();
        mockCheckAndConsumeQuota.mockReturnValue({ allowed: true });
    });

    afterEach(async () => {
        if (dbHelper) {
            await dbHelper.close();
        }
        mockDbHolder.db = null;
    });

    describe('generateCorrectionQuizAction', () => {
        it('应该返回 AI 生成的测试题并保存到缓存', async () => {
            const mockQuiz = {
                analysis: 'Analysis',
                distinctionPoint: 'Point',
                quiz: { content: 'Q', options: ['A', 'B'], answer: 'A', explanation: 'E' }
            };
            mockGenerateStructuredData.mockResolvedValue(mockQuiz);

            const result = await generateCorrectionQuizAction('Question', 'Wrong', 'Correct');

            expect(result).toEqual(mockQuiz);
            
            // 验证缓存是否存在
            const db = dbHelper.db;
            const hash = generateHash('Question' + 'Wrong' + 'Correct');
            const cached = await db.select().from(actualSchema.ai_quiz_cache).where(eq(actualSchema.ai_quiz_cache.hash, hash)).get();
            expect(cached).toBeDefined();
            expect(JSON.parse(cached.data)).toEqual(mockQuiz);
        });

        it('如果缓存命中，应该直接返回缓存结果', async () => {
            const db = dbHelper.db;
            const cachedData = { analysis: 'Cached' };
            const hash = generateHash('Q' + 'W' + 'C');
            
            await db.insert(actualSchema.ai_quiz_cache).values({
                hash,
                data: JSON.stringify(cachedData)
            });

            const result = await generateCorrectionQuizAction('Q', 'W', 'C');

            expect(result).toEqual(cachedData);
            expect(mockGenerateStructuredData).not.toHaveBeenCalled();
        });
    });

    describe('generateFirstPrinciplesAction', () => {
        it('应该检查配额并保存到缓存', async () => {
            mockGenerateTextWrapper.mockResolvedValue({ text: 'Deep Logic' });

            const result = await generateFirstPrinciplesAction('Q', 'Exp', 'A', 'W');

            expect(result.analysis).toBe('Deep Logic');
            
            // 验证缓存
            const db = dbHelper.db;
            const hash = generateHash('Q' + 'A' + 'W');
            const cached = await db.select().from(actualSchema.first_principles_cache).where(eq(actualSchema.first_principles_cache.question_hash, hash)).get();
            expect(cached).toBeDefined();
            expect(cached.analysis).toBe('Deep Logic');
        });
    });
});
