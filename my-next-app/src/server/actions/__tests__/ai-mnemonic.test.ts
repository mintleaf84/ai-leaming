// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

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
    questions: { 
        id: 'questions.id', 
        content: 'questions.content',
        options: 'questions.options',
        answer: 'questions.answer',
        explanation: 'questions.explanation',
        tags: 'questions.tags',
        ai_mnemonic: 'questions.ai_mnemonic'
    },
}));

// Mock AI 客户端与配额服务
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

describe('AI Mnemonic Action (Drizzle 重构版)', () => {
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

    it('如果题目不存在应返回错误', async () => {
        const chain = mockDrizzleDb as any;
        chain.then.mockImplementationOnce((resolve: any) => resolve([]));

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        const result = await generateMnemonicAction('999');

        expect(result.success).toBe(false);
        expect(result.message).toContain('不存在');
    });

    it('如果已有助记应直接返回缓存', async () => {
        const chain = mockDrizzleDb as any;
        chain.then.mockImplementationOnce((resolve: any) => resolve([
            { id: 1, ai_mnemonic: 'Cached Mnemonic' }
        ]));

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        const result = await generateMnemonicAction('1');

        expect(result.success).toBe(true);
        expect(result.content).toBe('Cached Mnemonic');
        expect(result.cached).toBe(true);
        expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('如果无缓存应调用 AI 生成并保存', async () => {
        const chain = mockDrizzleDb as any;
        // 第一次查询：获取题目
        chain.then.mockImplementationOnce((resolve: any) => resolve([
            { id: 1, content: 'Test Question', ai_mnemonic: null }
        ]));
        // 第二次更新：保存助记词
        chain.then.mockImplementationOnce((resolve: any) => resolve([]));

        mockGenerateText.mockResolvedValue({ text: 'AI Generated Content' });

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        const result = await generateMnemonicAction('1');

        expect(result.success).toBe(true);
        expect(result.content).toBe('AI Generated Content');
        expect(result.cached).toBe(false);

        expect(mockGenerateText).toHaveBeenCalledWith(expect.stringContaining('Test Question'), 'premium');
        expect(chain.update).toHaveBeenCalled();
    });

    it('如果 forceRegenerate 为 true 应强制重新生成', async () => {
        const chain = mockDrizzleDb as any;
        chain.then.mockImplementationOnce((resolve: any) => resolve([
            { id: 1, content: 'Test Question', ai_mnemonic: 'Old Mnemonic' }
        ]));
        chain.then.mockImplementationOnce((resolve: any) => resolve([]));

        mockGenerateText.mockResolvedValue({ text: 'New Mnemonic' });

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        const result = await generateMnemonicAction('1', true);

        expect(result.success).toBe(true);
        expect(result.content).toBe('New Mnemonic');
        expect(result.cached).toBe(false);

        expect(mockGenerateText).toHaveBeenCalled();
        expect(chain.update).toHaveBeenCalled();
    });

    it('AI 调用失败应妥善处理', async () => {
        const chain = mockDrizzleDb as any;
        chain.then.mockImplementationOnce((resolve: any) => resolve([
            { id: 1, content: 'Test Question' }
        ]));

        mockGenerateText.mockRejectedValue(new Error('AI API Error'));

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        const result = await generateMnemonicAction('1');

        expect(result.success).toBe(false);
        expect(result.message).toContain('生成失败');
    });

    it('如果配额不足应返回错误', async () => {
        const chain = mockDrizzleDb as any;
        chain.then.mockImplementationOnce((resolve: any) => resolve([
            { id: 1, content: 'Test Question', ai_mnemonic: null }
        ]));

        mockCheckAndConsumeQuota.mockReturnValue({ allowed: false, message: '配额不足' });

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        const result = await generateMnemonicAction('1');

        expect(result.success).toBe(false);
        expect(result.message).toBe('配额不足');
        expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('命中缓存时不应消耗配额', async () => {
        const chain = mockDrizzleDb as any;
        chain.then.mockImplementationOnce((resolve: any) => resolve([
            { id: 1, content: 'Test Question', ai_mnemonic: 'Cached' }
        ]));

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        await generateMnemonicAction('1');

        expect(mockCheckAndConsumeQuota).not.toHaveBeenCalled();
    });
});
