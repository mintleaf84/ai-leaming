// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as schema from '@/lib/db/drizzle-schema';
import { setupVitestMemoryDb } from '@/lib/__tests__/db-mock-utils';

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

const { mockGenerateText, mockCheckAndConsumeQuota } = vi.hoisted(() => ({
    mockGenerateText: vi.fn(),
    mockCheckAndConsumeQuota: vi.fn(),
}));

vi.mock('@/lib/billing/subscription-service', () => ({
    checkAndConsumeQuota: mockCheckAndConsumeQuota
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock('@/lib/ai/client', () => ({
    generateTextWrapper: mockGenerateText,
}));

vi.mock('@/lib/logger', () => ({
    default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}));

import { generateMnemonicAction } from '../ai-mnemonic';

describe('AI Mnemonic Action (Real DB)', () => {
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

    it('如果题目不存在应返回错误', async () => {
        const result = await generateMnemonicAction('999');
        expect(result.success).toBe(false);
        expect(result.message).toContain('不存在');
    });

    it('如果已有助记应直接返回缓存', async () => {
        const db = dbHelper.db;
        await db.insert(schema.questions).values({
            id: 1,
            content: 'Test Question',
            options: '[]',
            answer: 'A',
            explanation: 'Expl',
            tags: '[]',
            ai_mnemonic: 'Cached Mnemonic'
        });

        const result = await generateMnemonicAction('1');
        expect(result.success).toBe(true);
        expect(result.content).toBe('Cached Mnemonic');
        expect(result.cached).toBe(true);
        expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('如果无缓存应调用 AI 生成并保存', async () => {
        const db = dbHelper.db;
        await db.insert(schema.questions).values({
            id: 1,
            content: 'Test Question',
            options: '[]',
            answer: 'A',
            explanation: 'Expl',
            tags: '[]',
            ai_mnemonic: null
        });

        mockGenerateText.mockResolvedValue({ text: 'AI Generated Content' });

        const result = await generateMnemonicAction('1');

        expect(result.success).toBe(true);
        expect(result.content).toBe('AI Generated Content');
        expect(mockGenerateText).toHaveBeenCalledWith(expect.stringContaining('Test Question'), 'premium');
        
        // 验证数据库已更新
        const updated = await db.select().from(schema.questions).where(require('drizzle-orm').eq(schema.questions.id, 1)).get();
        expect(updated.ai_mnemonic).toBe('AI Generated Content');
    });

    it('如果配额不足应返回错误', async () => {
        const db = dbHelper.db;
        await db.insert(schema.questions).values({
            id: 1,
            content: 'Test Question',
            options: '[]',
            answer: 'A',
            explanation: 'Expl',
            tags: '[]',
            ai_mnemonic: null
        });
        
        mockCheckAndConsumeQuota.mockReturnValue({ allowed: false, message: '配额不足' });

        const result = await generateMnemonicAction('1');

        expect(result.success).toBe(false);
        expect(result.message).toBe('配额不足');
        expect(mockGenerateText).not.toHaveBeenCalled();
    });
});
