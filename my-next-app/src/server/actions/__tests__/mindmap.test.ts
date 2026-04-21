import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateMindmapAction } from '../mindmap';
import { generateTextWrapper } from '@/lib/ai/client';
import { requireUser } from '@/lib/auth/auth';

// Mock 外部依赖
vi.mock('@/lib/ai/client', () => ({
    generateTextWrapper: vi.fn(),
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn(),
}));

describe('generateMindmapAction', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('应该成功生成并清理 Markdown 文本', async () => {
        // Mock 用户已登录
        vi.mocked(requireUser).mockResolvedValue({ id: 'user-1' } as any);
        
        // Mock AI 返回带代码块的 Markdown
        vi.mocked(generateTextWrapper).mockResolvedValue({
            text: '```markdown\n# 核心主题\n- 点 1\n```',
        } as any);

        const result = await generateMindmapAction('原始 OCR 文本');

        expect(result.success).toBe(true);
        expect(result.data).toBe('# 核心主题\n- 点 1');
        expect(requireUser).toHaveBeenCalled();
        expect(generateTextWrapper).toHaveBeenCalledWith(
            expect.stringContaining('原始 OCR 文本'),
            'economy',
            undefined,
            undefined,
            expect.any(Object)
        );
    });

    it('如果未登录应该返回错误', async () => {
        vi.mocked(requireUser).mockRejectedValue(new Error('未登录'));

        const result = await generateMindmapAction('文本');

        expect(result.success).toBe(false);
        expect(result.error).toBe('未登录');
    });

    it('如果 AI 调用失败应该返回错误', async () => {
        vi.mocked(requireUser).mockResolvedValue({ id: 'user-1' } as any);
        vi.mocked(generateTextWrapper).mockRejectedValue(new Error('AI 调用超时'));

        const result = await generateMindmapAction('文本');

        expect(result.success).toBe(false);
        expect(result.error).toBe('AI 调用超时');
    });
});
