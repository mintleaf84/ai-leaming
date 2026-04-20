// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createKnowledgeCard, updateKnowledgeCard, deleteKnowledgeCard } from '../knowledge';

// Mock dependencies
const { mockDb, mockRagService } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
        },
        mockRagService: {
            addChunk: vi.fn(),
            deleteChunksBySource: vi.fn(),
        }
    };
});

vi.mock('@/lib/db', () => ({
    default: mockDb
}));

vi.mock('@/lib/ai/rag', () => ({
    ragService: mockRagService
}));

describe('Knowledge Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockCard = {
        title: 'Title',
        category: 'Cat',
        tags: ['Tag'],
        front: 'Front',
        back: 'Back',
        key_points: []
    };

    describe('createKnowledgeCard', () => {
        it('should insert into DB and sync to RAG', async () => {
            const mockRun = vi.fn().mockReturnValue({ lastInsertRowid: 100 });
            mockDb.prepare.mockReturnValue({ run: mockRun });

            const id = await createKnowledgeCard(mockCard);

            expect(id).toBe(100);
            expect(mockRun).toHaveBeenCalledWith(
                null, 'Title', 'Cat', '["Tag"]', 'Front', 'Back', '[]', ''
            );

            // Verify RAG Sync
            expect(mockRagService.addChunk).toHaveBeenCalledWith(
                expect.stringContaining('Front\n\nBack'),
                expect.objectContaining({ source_id: 100, source_type: 'card' })
            );
        });

        it('should handle RAG failure gracefully', async () => {
            const mockRun = vi.fn().mockReturnValue({ lastInsertRowid: 100 });
            mockDb.prepare.mockReturnValue({ run: mockRun });
            mockRagService.addChunk.mockRejectedValue(new Error('RAG Error'));

            const id = await createKnowledgeCard(mockCard);

            expect(id).toBe(100); // Should still return ID
            // Should verify console.error (optional, but ensuring it doesn't throw is enough)
        });
    });

    describe('updateKnowledgeCard', () => {
        it('should update DB and re-sync RAG', async () => {
            // Reset mock to success
            mockRagService.addChunk.mockResolvedValue(undefined);

            // Mock Update Run
            const mockRun = vi.fn().mockReturnValue({ changes: 1 });

            // Mock Get (for re-indexing)
            const mockGet = vi.fn().mockReturnValue({
                ...mockCard,
                id: 100,
                title: 'New Title', // Updated value simulated
                tags: '["Tag"]',
                key_points: '[]'
            });

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('UPDATE')) return { run: mockRun };
                if (sql.includes('SELECT')) return { get: mockGet };
                return { run: mockRun, get: mockGet };
            });

            const success = await updateKnowledgeCard(100, { title: 'New Title' });

            expect(success).toBe(true);

            // Verify Update SQL
            expect(mockRun).toHaveBeenCalled();

            // Verify RAG Sync (Delete old -> Add new)
            expect(mockRagService.deleteChunksBySource).toHaveBeenCalledWith('card', 100);
            expect(mockRagService.addChunk).toHaveBeenCalled();
        });
    });

    describe('deleteKnowledgeCard', () => {
        it('should delete from DB and RAG', async () => {
            const mockRun = vi.fn().mockReturnValue({ changes: 1 });
            mockDb.prepare.mockReturnValue({ run: mockRun });

            const success = await deleteKnowledgeCard(100);

            expect(success).toBe(true);
            expect(mockRun).toHaveBeenCalled();
            expect(mockRagService.deleteChunksBySource).toHaveBeenCalledWith('card', 100);
        });
    });
});
