import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. 使用 hoisted 定义 Mock 链
const { mockDrizzleDb } = vi.hoisted(() => {
    const makeChain = () => {
        const chain: any = {
            // 支持直接 await 链
            then: vi.fn((resolve) => resolve([])),
        };
        // Drizzle 常用方法
        const methods = [
            'insert', 'values', 'returning', 'update', 'set', 'delete', 
            'select', 'from', 'where', 'limit', 'offset', 'orderBy'
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

// Mock 数据库 Schema
vi.mock('@/lib/db/drizzle-schema', () => ({
    notes: {
        id: 'notes.id',
        user_id: 'notes.user_id',
        title: 'notes.title',
        content: 'notes.content',
        updated_at: 'notes.updated_at',
        $inferInsert: {} // 用于类型推断
    }
}));

// Mock 认证
vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1, name: 'Test User' }),
}));

// Mock Next.js 缓存
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

// Mock 日志
vi.mock('@/lib/logger', () => ({
    default: { error: vi.fn(), info: vi.fn() }
}));

describe('Note Server Actions (Drizzle 重构版)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // 恢复链式调用默认行为
        const chain = mockDrizzleDb as any;
        [
            'insert', 'values', 'returning', 'update', 'set', 'delete', 
            'select', 'from', 'where', 'limit', 'offset', 'orderBy'
        ].forEach(m => chain[m].mockReturnValue(chain));
        chain.then.mockImplementation((resolve: any) => resolve([]));
    });

    it('createNoteAction 应成功创建笔记', async () => {
        const chain = mockDrizzleDb as any;
        // 模拟返回插入的 ID
        chain.then.mockImplementation((resolve: any) => resolve([{ id: 100 }]));

        const { createNoteAction } = await import('../note');
        const result = await createNoteAction({ title: 'New Note', content: 'Content' });

        expect(result.success).toBe(true);
        expect(result.noteId).toBe(100);
        expect(chain.insert).toHaveBeenCalled();
    });

    it('updateNoteAction 应检查权限并更新', async () => {
        const chain = mockDrizzleDb as any;
        // 第一次 await (检查权限) 返回已有笔记
        // 第二次 await (执行更新) 返回成功
        chain.then
            .mockImplementationOnce((resolve: any) => resolve([{ id: 100 }]))
            .mockImplementationOnce((resolve: any) => resolve([]));

        const { updateNoteAction } = await import('../note');
        const result = await updateNoteAction({ id: 100, title: 'Updated' });

        expect(result.success).toBe(true);
        expect(chain.update).toHaveBeenCalled();
    });

    it('updateNoteAction 如果没有权限应失败', async () => {
        const chain = mockDrizzleDb as any;
        // 检查权限时返回空（笔记不存在或不属于该用户）
        chain.then.mockImplementationOnce((resolve: any) => resolve([]));

        const { updateNoteAction } = await import('../note');
        const result = await updateNoteAction({ id: 999, title: 'Hacked' });

        expect(result.success).toBe(false);
        expect(result.message).toContain('无权限');
    });

    it('deleteNoteAction 应成功删除自己的笔记', async () => {
        const chain = mockDrizzleDb as any;
        chain.then.mockImplementation((resolve: any) => resolve([]));

        const { deleteNoteAction } = await import('../note');
        const result = await deleteNoteAction(100);

        expect(result.success).toBe(true);
        expect(chain.delete).toHaveBeenCalled();
    });

    it('getNotesAction 应返回当前用户的笔记列表', async () => {
        const mockNotes = [{ id: 1, title: 'My Note', updated_at: '2024-04-27', preview: 'Preview' }];
        const chain = mockDrizzleDb as any;
        chain.then.mockImplementation((resolve: any) => resolve(mockNotes));

        const { getNotesAction } = await import('../note');
        const result = await getNotesAction();

        expect(result.success).toBe(true);
        expect(result.notes).toEqual(mockNotes);
        expect(chain.select).toHaveBeenCalled();
    });
});
