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

import { 
    createMindmapAction,
    updateMindmapAction,
    deleteMindmapAction,
    getMindmapsAction,
    getMindmapDetailAction,
    generateMindmapAction 
} from '../mindmap';
import { resetDrizzleMock } from '@/lib/__tests__/db-mock-utils';

describe('Mindmap Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetDrizzleMock(mockDb);
    });

    describe('createMindmapAction', () => {
        it('应该成功创建思维导图并返回 ID', async () => {
            mockRequireUser.mockResolvedValue({ id: 1 });
            mockDb.insert.mockReturnValue({
                values: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([{ id: 123 }])
                })
            } as any);

            const result = await createMindmapAction({ title: '测试导图', content: '# 内容' });

            expect(result.success).toBe(true);
            expect(result.id).toBe(123);
        });

        it('应该使用默认标题和内容创建', async () => {
            mockRequireUser.mockResolvedValue({ id: 1 });
            mockDb.insert.mockReturnValue({
                values: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([{ id: 1 }])
                })
            } as any);

            const result = await createMindmapAction({});

            expect(result.success).toBe(true);
            expect(mockDb.insert).toHaveBeenCalled();
        });

        it('未登录时应该返回错误', async () => {
            mockRequireUser.mockRejectedValue(new Error('Unauthorized'));

            const result = await createMindmapAction({ title: '测试' });

            expect(result.success).toBe(false);
            expect(result.message).toBe('创建思维导图失败');
        });
    });

    describe('updateMindmapAction', () => {
        it('应该成功更新思维导图', async () => {
            mockRequireUser.mockResolvedValue({ id: 1 });
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([{ id: 1 }])
                    })
                })
            } as any);
            mockDb.update.mockReturnValue({
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue({ rowsAffected: 1 })
                })
            } as any);

            const result = await updateMindmapAction({ id: 1, title: '新标题', content: '新内容' });

            expect(result.success).toBe(true);
        });

        it('更新不存在的导图应该返回错误', async () => {
            mockRequireUser.mockResolvedValue({ id: 1 });
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([])
                    })
                })
            } as any);

            const result = await updateMindmapAction({ id: 999, title: '新标题' });

            expect(result.success).toBe(false);
            expect(result.message).toBe('脑图不存在或无权限修改');
        });

        it('未登录时应该返回错误', async () => {
            mockRequireUser.mockRejectedValue(new Error('Unauthorized'));

            const result = await updateMindmapAction({ id: 1, title: '测试' });

            expect(result.success).toBe(false);
        });
    });

    describe('deleteMindmapAction', () => {
        it('应该成功删除思维导图', async () => {
            mockRequireUser.mockResolvedValue({ id: 1 });
            mockDb.delete.mockReturnValue({
                where: vi.fn().mockResolvedValue({ rowsAffected: 1 })
            } as any);

            const result = await deleteMindmapAction(1);

            expect(result.success).toBe(true);
        });

        it('删除不存在的导图应返回成功', async () => {
            mockRequireUser.mockResolvedValue({ id: 1 });
            mockDb.delete.mockReturnValue({
                where: vi.fn().mockResolvedValue({ rowsAffected: 0 })
            } as any);

            const result = await deleteMindmapAction(999);

            expect(result.success).toBe(true);
        });
    });

    describe('getMindmapsAction', () => {
        it('应该返回用户的思维导图列表', async () => {
            mockRequireUser.mockResolvedValue({ id: 1 });
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        orderBy: vi.fn().mockResolvedValue([
                            { id: 1, title: '导图1', updated_at: '2024-01-01' },
                            { id: 2, title: '导图2', updated_at: '2024-01-02' }
                        ])
                    })
                })
            } as any);

            const result = await getMindmapsAction();

            expect(result.success).toBe(true);
            expect(result.records).toHaveLength(2);
        });

        it('未登录时应该返回错误', async () => {
            mockRequireUser.mockRejectedValue(new Error('Unauthorized'));

            const result = await getMindmapsAction();

            expect(result.success).toBe(false);
            expect(result.message).toBe('获取图谱列表失败');
        });
    });

    describe('getMindmapDetailAction', () => {
        it('应该返回思维导图详情', async () => {
            mockRequireUser.mockResolvedValue({ id: 1 });
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([{ id: 1, title: '导图', content: '# 内容' }])
                    })
                })
            } as any);

            const result = await getMindmapDetailAction(1);

            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
        });

        it('访问不存在的导图应该返回错误', async () => {
            mockRequireUser.mockResolvedValue({ id: 1 });
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([])
                    })
                })
            } as any);

            const result = await getMindmapDetailAction(999);

            expect(result.success).toBe(false);
            expect(result.message).toBe('导图不存在或无权限查看');
        });
    });

    describe('generateMindmapAction', () => {
        it('应该成功生成并清理 Markdown 文本', async () => {
            mockRequireUser.mockResolvedValue({ id: 'user-1' });
            
            mockGenerateText.mockResolvedValue({
                text: '```markdown\n# 核心主题\n- 点 1\n```',
            });

            const result = await generateMindmapAction('原始 OCR 文本');

            expect(result.success).toBe(true);
            expect(result.data).toBe('# 核心主题\n- 点 1');
        });

        it('应该正确处理不带代码块的 Markdown', async () => {
            mockRequireUser.mockResolvedValue({ id: 'user-1' });
            mockGenerateText.mockResolvedValue({
                text: '# 核心主题\n- 点 1\n- 点 2',
            });

            const result = await generateMindmapAction('OCR 文本');

            expect(result.success).toBe(true);
            expect(result.data).toBe('# 核心主题\n- 点 1\n- 点 2');
        });

        it('如果未登录应该返回错误', async () => {
            mockRequireUser.mockRejectedValue(new Error('未登录'));

            const result = await generateMindmapAction('文本');

            expect(result.success).toBe(false);
        });

        it('如果 AI 调用失败应该返回错误', async () => {
            mockRequireUser.mockResolvedValue({ id: 'user-1' });
            mockGenerateText.mockRejectedValue(new Error('AI 调用超时'));

            const result = await generateMindmapAction('文本');

            expect(result.success).toBe(false);
            expect(result.error).toBe('AI 调用超时');
        });

        it('应该处理 ``` 包裹的代码块', async () => {
            mockRequireUser.mockResolvedValue({ id: 'user-1' });
            mockGenerateText.mockResolvedValue({
                text: '```\n# 主题\n- 要点\n```',
            });

            const result = await generateMindmapAction('test');

            expect(result.success).toBe(true);
            expect(result.data).toBe('# 主题\n- 要点');
        });
    });
});
