// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
const { mockDb } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
        }
    };
});

// Mock AI client
const { mockGenerateText, mockCheckAndConsumeQuota } = vi.hoisted(() => ({
    mockGenerateText: vi.fn(),
    mockCheckAndConsumeQuota: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mockDb, db: mockDb, drizzleDb: {}, drizzleSchema: {} }));

vi.mock('@/lib/billing/subscription-service', () => ({
    checkAndConsumeQuota: mockCheckAndConsumeQuota
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock('@/lib/ai/client', () => ({
    generateTextWrapper: mockGenerateText,
}));

describe('AI Mnemonic Action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default allow quota
        mockCheckAndConsumeQuota.mockReturnValue({ allowed: true });
    });

    it('如果题目不存在应返回错误', async () => {
        mockDb.prepare.mockReturnValue({ get: () => null });

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        const result = await generateMnemonicAction('999');

        expect(result.success).toBe(false);
        expect(result.message).toContain('不存在');
    });

    it('如果已有助记应直接返回缓存', async () => {
        mockDb.prepare.mockReturnValue({
            get: () => ({ id: 1, ai_mnemonic: 'Cached Mnemonic' })
        });

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        const result = await generateMnemonicAction('1');

        expect(result.success).toBe(true);
        expect(result.content).toBe('Cached Mnemonic');
        expect(result.cached).toBe(true);
        expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('如果无缓存应调用 AI 生成并保存', async () => {
        const mockRun = vi.fn();
        mockDb.prepare.mockImplementation((sql: string) => {
            if (sql.includes('SELECT')) {
                return { get: () => ({ id: 1, content: 'Test Question', ai_mnemonic: null }) };
            }
            if (sql.includes('UPDATE')) {
                return { run: mockRun };
            }
            return { get: () => null };
        });

        mockGenerateText.mockResolvedValue({ text: 'AI Generated Content' });

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        const result = await generateMnemonicAction('1');

        expect(result.success).toBe(true);
        expect(result.content).toBe('AI Generated Content');
        expect(result.cached).toBe(false);

        // 验证 AI 调用
        expect(mockGenerateText).toHaveBeenCalledWith(expect.stringContaining('Test Question'), 'premium');

        // 验证保存
        expect(mockRun).toHaveBeenCalled();
    });

    it('如果 forceRegenerate 为 true 应强制重新生成', async () => {
        const mockRun = vi.fn();
        mockDb.prepare.mockImplementation((sql: string) => {
            if (sql.includes('SELECT')) {
                return { get: () => ({ id: 1, content: 'Test Question', ai_mnemonic: 'Old Mnemonic' }) };
            }
            if (sql.includes('UPDATE')) {
                return { run: mockRun };
            }
            return { get: () => null };
        });

        mockGenerateText.mockResolvedValue({ text: 'New Mnemonic' });

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        // 传入 true
        const result = await generateMnemonicAction('1', true);

        expect(result.success).toBe(true);
        expect(result.content).toBe('New Mnemonic');
        expect(result.cached).toBe(false);

        // 验证 AI 调用
        expect(mockGenerateText).toHaveBeenCalled();
        expect(mockRun).toHaveBeenCalledWith('New Mnemonic', '1');
    });

    it('AI 调用失败应妥善处理', async () => {
        mockDb.prepare.mockReturnValue({
            get: () => ({ id: 1, content: 'Test Question' })
        });

        mockGenerateText.mockRejectedValue(new Error('AI API Error'));

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        const result = await generateMnemonicAction('1');

        expect(result.success).toBe(false);
        expect(result.message).toContain('生成失败');
    });

    it('如果配额不足应返回错误', async () => {
        mockDb.prepare.mockReturnValue({
            get: () => ({ id: 1, content: 'Test Question', ai_mnemonic: null })
        });

        mockCheckAndConsumeQuota.mockReturnValue({ allowed: false, message: '配额不足' });

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        const result = await generateMnemonicAction('1');

        expect(result.success).toBe(false);
        expect(result.message).toBe('配额不足');
        expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('命中缓存时不应消耗配额', async () => {
        mockDb.prepare.mockReturnValue({
            get: () => ({ id: 1, content: 'Test Question', ai_mnemonic: 'Cached' })
        });

        const { generateMnemonicAction } = await import('../ai-mnemonic');
        await generateMnemonicAction('1');

        expect(mockCheckAndConsumeQuota).not.toHaveBeenCalled();
    });
});
