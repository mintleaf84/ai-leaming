import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drizzleDb } from '@/lib/db';
import { resetDrizzleMock } from '@/lib/db/__mocks__';
import { createNoteAction, updateNoteAction, getNotesAction, deleteNoteAction } from '../note';

// 只需要一行！Vitest 会自动加载 __mocks__/index.ts 和 __mocks__/drizzle-schema.ts
vi.mock('@/lib/db');
vi.mock('@/lib/db/drizzle-schema');

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1, name: 'Test User' }),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    default: { error: vi.fn(), info: vi.fn() }
}));

describe('Note Server Actions (使用全局 Manual Mock)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetDrizzleMock();
    });

    it('createNoteAction 应成功创建笔记', async () => {
        // 模拟返回插入的 ID
        (drizzleDb as any).then.mockImplementation((resolve: any) => resolve([{ id: 100 }]));

        const result = await createNoteAction({ title: 'New Note', content: 'Content' });

        expect(result.success).toBe(true);
        expect(result.noteId).toBe(100);
        expect(drizzleDb.insert).toHaveBeenCalled();
    });

    it('updateNoteAction 应检查权限并更新', async () => {
        // 第一次 await (检查权限) 返回已有笔记，第二次返回成功
        (drizzleDb as any).then
            .mockImplementationOnce((resolve: any) => resolve([{ id: 100 }]))
            .mockImplementationOnce((resolve: any) => resolve([]));

        const result = await updateNoteAction({ id: 100, title: 'Updated' });

        expect(result.success).toBe(true);
        expect(drizzleDb.update).toHaveBeenCalled();
    });

    it('updateNoteAction 如果没有权限应失败', async () => {
        (drizzleDb as any).then.mockImplementationOnce((resolve: any) => resolve([]));

        const result = await updateNoteAction({ id: 999, title: 'Hacked' });

        expect(result.success).toBe(false);
        expect(result.message).toContain('无权限');
    });

    it('deleteNoteAction 应成功删除自己的笔记', async () => {
        const result = await deleteNoteAction(100);
        expect(result.success).toBe(true);
        expect(drizzleDb.delete).toHaveBeenCalled();
    });

    it('getNotesAction 应返回当前用户的笔记列表', async () => {
        const mockNotes = [{ id: 1, title: 'My Note', updated_at: '2024-04-27', preview: 'Preview' }];
        (drizzleDb as any).then.mockImplementation((resolve: any) => resolve(mockNotes));

        const result = await getNotesAction();

        expect(result.success).toBe(true);
        expect(result.notes).toEqual(mockNotes);
        expect(drizzleDb.select).toHaveBeenCalled();
    });
});
