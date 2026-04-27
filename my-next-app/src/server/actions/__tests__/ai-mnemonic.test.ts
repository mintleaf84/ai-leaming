// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drizzleDb } from '@/lib/db';
import { resetDrizzleMock } from '@/lib/db/__mocks__';
import { generateMnemonicAction } from '../ai-mnemonic';

vi.mock('@/lib/db');
vi.mock('@/lib/db/drizzle-schema');

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

describe('AI Mnemonic Action (使用全局 Manual Mock)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetDrizzleMock();
        mockCheckAndConsumeQuota.mockReturnValue({ allowed: true });
    });

    it('如果题目不存在应返回错误', async () => {
        (drizzleDb as any).then.mockImplementationOnce((resolve: any) => resolve([]));
        const result = await generateMnemonicAction('999');
        expect(result.success).toBe(false);
        expect(result.message).toContain('不存在');
    });

    it('如果已有助记应直接返回缓存', async () => {
        (drizzleDb as any).then.mockImplementationOnce((resolve: any) => resolve([
            { id: 1, ai_mnemonic: 'Cached Mnemonic' }
        ]));
        const result = await generateMnemonicAction('1');
        expect(result.success).toBe(true);
        expect(result.content).toBe('Cached Mnemonic');
        expect(result.cached).toBe(true);
        expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('如果无缓存应调用 AI 生成并保存', async () => {
        (drizzleDb as any).then
            .mockImplementationOnce((resolve: any) => resolve([{ id: 1, content: 'Test Question', ai_mnemonic: null }]))
            .mockImplementationOnce((resolve: any) => resolve([]));

        mockGenerateText.mockResolvedValue({ text: 'AI Generated Content' });

        const result = await generateMnemonicAction('1');

        expect(result.success).toBe(true);
        expect(result.content).toBe('AI Generated Content');
        expect(mockGenerateText).toHaveBeenCalledWith(expect.stringContaining('Test Question'), 'premium');
        expect(drizzleDb.update).toHaveBeenCalled();
    });

    it('如果配额不足应返回错误', async () => {
        (drizzleDb as any).then.mockImplementationOnce((resolve: any) => resolve([
            { id: 1, content: 'Test Question', ai_mnemonic: null }
        ]));
        mockCheckAndConsumeQuota.mockReturnValue({ allowed: false, message: '配额不足' });

        const result = await generateMnemonicAction('1');

        expect(result.success).toBe(false);
        expect(result.message).toBe('配额不足');
        expect(mockGenerateText).not.toHaveBeenCalled();
    });
});
