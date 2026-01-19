import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB
const mockDb = {
    prepare: vi.fn(),
    transaction: vi.fn((cb) => cb()),
};

vi.mock('@/lib/db', () => ({
    default: mockDb,
}));

// Mock Auth
vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1, name: 'Test User' }),
}));

// Mock revalidatePath
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

describe('Note Server Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('createNoteAction 应成功创建笔记', async () => {
        mockDb.prepare.mockReturnValue({
            run: vi.fn().mockReturnValue({ lastInsertRowid: 100 })
        });

        const { createNoteAction } = await import('../note');
        const result = await createNoteAction({ title: 'New Note', content: '{}' });

        expect(result.success).toBe(true);
        expect(result.noteId).toBe(100);
        expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notes'));
    });

    it('updateNoteAction 应检查权限并更新', async () => {
        // Mock get existing note (permission check)
        mockDb.prepare.mockImplementation((sql: string) => {
            if (sql.includes('SELECT id FROM notes')) {
                return { get: vi.fn().mockReturnValue({ id: 100 }) };
            }
            if (sql.includes('UPDATE notes')) {
                return { run: vi.fn() };
            }
            return { run: vi.fn(), get: vi.fn() };
        });

        const { updateNoteAction } = await import('../note');
        const result = await updateNoteAction({ id: 100, title: 'Updated' });

        expect(result.success).toBe(true);
        // Verify SELECT was called with user.id
        expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT id FROM notes'));
    });

    it('updateNoteAction 如果没有权限应失败', async () => {
        mockDb.prepare.mockReturnValue({
            get: vi.fn().mockReturnValue(undefined) // Note not found for user
        });

        const { updateNoteAction } = await import('../note');
        const result = await updateNoteAction({ id: 999, title: 'Hacked' });

        expect(result.success).toBe(false);
        expect(result.message).toContain('无权限');
    });

    it('deleteNoteAction 应成功删除自己的笔记', async () => {
        mockDb.prepare.mockReturnValue({
            run: vi.fn().mockReturnValue({ changes: 1 })
        });

        const { deleteNoteAction } = await import('../note');
        const result = await deleteNoteAction(100);

        expect(result.success).toBe(true);
    });

    it('getNotesAction 应只返回当前用户的笔记', async () => {
        const mockNotes = [{ id: 1, title: 'My Note' }];
        mockDb.prepare.mockReturnValue({
            all: vi.fn().mockReturnValue(mockNotes)
        });

        const { getNotesAction } = await import('../note');
        const result = await getNotesAction();

        expect(result.success).toBe(true);
        expect(result.notes).toEqual(mockNotes);
        expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = ?'));
    });
});
