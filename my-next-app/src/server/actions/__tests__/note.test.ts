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

vi.mock('@/lib/db/drizzle-schema', () => actualSchema);

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1, name: 'Test User' }),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    default: { error: vi.fn(), info: vi.fn() }
}));

import { createNoteAction, updateNoteAction, getNotesAction, deleteNoteAction } from '../note';
import { resetDrizzleMock } from '@/lib/__tests__/db-mock-utils';

describe('Note Server Actions', () => {
    beforeEach(() => {
        resetDrizzleMock(mockDb);
        mockDb.resetTableData?.();
        vi.clearAllMocks();
    });

    it('createNoteAction 应成功创建笔记', async () => {
        // 模拟返回插入的 ID
        mockDb.then.mockImplementationOnce((resolve: any) => resolve([{ id: 100 }]));

        const result = await createNoteAction({ title: 'New Note', content: 'Content' });

        expect(result.success).toBe(true);
        expect(result.noteId).toBe(100);
        expect(mockDb.insert).toHaveBeenCalled();
    });

    it('updateNoteAction 应检查权限并更新', async () => {
        // 第一次 await (检查权限) 返回已有笔记，第二次返回成功
        mockDb.then
            .mockImplementationOnce((resolve: any) => resolve([{ id: 100 }]))
            .mockImplementationOnce((resolve: any) => resolve([]));

        const result = await updateNoteAction({ id: 100, title: 'Updated' });

        expect(result.success).toBe(true);
        expect(mockDb.update).toHaveBeenCalled();
    });

    it('updateNoteAction 如果没有权限应失败', async () => {
        mockDb.then.mockImplementationOnce((resolve: any) => resolve([]));

        const result = await updateNoteAction({ id: 999, title: 'Hacked' });

        expect(result.success).toBe(false);
        expect(result.message).toContain('无权限');
    });

    it('deleteNoteAction 应成功删除自己的笔记', async () => {
        const result = await deleteNoteAction(100);
        expect(result.success).toBe(true);
        expect(mockDb.delete).toHaveBeenCalled();
    });

    it('getNotesAction 应返回当前用户的笔记列表', async () => {
        const mockNotes = [{ id: 1, title: 'My Note', updated_at: '2024-04-27', preview: 'Preview' }];
        mockDb.then.mockImplementationOnce((resolve: any) => resolve(mockNotes));

        const result = await getNotesAction();

        expect(result.success).toBe(true);
        expect(result.notes).toEqual(mockNotes);
        expect(mockDb.select).toHaveBeenCalled();
    });
});
