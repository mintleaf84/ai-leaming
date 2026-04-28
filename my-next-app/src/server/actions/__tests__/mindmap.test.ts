// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. 设置 Mock
const { actualSchema, mockDb } = await vi.hoisted(async () => {
    const modSchema = await import('@/lib/db/drizzle-schema');
    const modUtils = await import('@/lib/__tests__/db-mock-utils');
    const mock = modUtils.createTableAwareDrizzleMock();
    return { 
        actualSchema: modSchema,
        mockDb: mock
    };
});

vi.mock('@/lib/db', () => ({
    drizzleDb: mockDb,
    drizzleSchema: actualSchema
}));

const { mockGenerateText, mockRequireUser } = vi.hoisted(() => ({
    mockGenerateText: vi.fn(),
    mockRequireUser: vi.fn()
}));

vi.mock('@/lib/ai/client', () => ({
    generateTextWrapper: mockGenerateText,
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: mockRequireUser,
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

import { generateMindmapAction } from '../mindmap';

describe('generateMindmapAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('应该成功生成并清理 Markdown 文本', async () => {
        // Mock 用户已登录
        mockRequireUser.mockResolvedValue({ id: 'user-1' });
        
        // Mock AI 返回带代码块的 Markdown
        mockGenerateText.mockResolvedValue({
            text: '```markdown\n# 核心主题\n- 点 1\n```',
        });

        const result = await generateMindmapAction('原始 OCR 文本');

        expect(result.success).toBe(true);
        expect(result.data).toBe('# 核心主题\n- 点 1');
        expect(mockRequireUser).toHaveBeenCalled();
        expect(mockGenerateText).toHaveBeenCalledWith(
            expect.stringContaining('原始 OCR 文本'),
            'economy',
            undefined,
            undefined,
            expect.any(Object)
        );
    });

    it('如果未登录应该返回错误', async () => {
        mockRequireUser.mockRejectedValue(new Error('未登录'));

        const result = await generateMindmapAction('文本');

        expect(result.success).toBe(false);
        expect(result.error).toBe('未登录');
    });

    it('如果 AI 调用失败应该返回错误', async () => {
        mockRequireUser.mockResolvedValue({ id: 'user-1' });
        mockGenerateText.mockRejectedValue(new Error('AI 调用超时'));

        const result = await generateMindmapAction('文本');

        expect(result.success).toBe(false);
        expect(result.error).toBe('AI 调用超时');
    });
});
