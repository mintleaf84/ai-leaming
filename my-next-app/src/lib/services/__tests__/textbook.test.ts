// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { textbookService } from '../textbook';

// Mock DB
const { mockDb, mockRag, mockFs } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
        },
        mockRag: {
            addChunk: vi.fn().mockResolvedValue(true),
            deleteChunksBySource: vi.fn(),
        },
        mockFs: {
            existsSync: vi.fn().mockReturnValue(false),
            rmSync: vi.fn(),
        }
    };
});

vi.mock('@/lib/db', () => ({ default: mockDb, db: mockDb, drizzleDb: {}, drizzleSchema: {} }));
vi.mock('@/lib/ai/rag', () => ({ ragService: mockRag }));
vi.mock('fs', () => ({ 
    default: {
        existsSync: mockFs.existsSync,
        rmSync: mockFs.rmSync,
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
    }
}));
vi.mock('@/lib/utils/text-splitter', () => ({ splitText: async (t: string) => [t] }));

describe('Textbook Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('deleteTextbook', () => {
        it('should cleanup RAG for EVERY chapter and remove files', async () => {
            // Mock multiple chapters for cascade deletion check
            const mockChapters = [
                { id: 101, title: 'C1' },
                { id: 102, title: 'C2' }
            ];

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT id FROM textbook_chapters')) {
                    return { all: vi.fn().mockReturnValue(mockChapters) };
                }
                return { run: vi.fn() };
            });
            mockFs.existsSync.mockReturnValue(true);

            await textbookService.deleteTextbook(1);

            // 核心演进：验证是否针对每一个章节都调用了 RAG 删除
            expect(mockRag.deleteChunksBySource).toHaveBeenCalledTimes(2);
            expect(mockRag.deleteChunksBySource).toHaveBeenCalledWith('textbook_chapter', 101);
            expect(mockRag.deleteChunksBySource).toHaveBeenCalledWith('textbook_chapter', 102);
            
            // 验证数据库记录也被删除
            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM textbooks WHERE id = ?'));
        });
    });

    describe('addChapter', () => {
        it('should index chunk with correct metadata', async () => {
            mockDb.prepare.mockReturnValue({
                run: vi.fn().mockReturnValue({ lastInsertRowid: 201 })
            });

            await textbookService.addChapter({
                textbook_id: 1,
                title: 'Introduction',
                content: 'Welcome to this book',
                order_index: 0,
                level: 1
            });

            // 核心演进：精准匹配 RAG 索引的元数据
            expect(mockRag.addChunk).toHaveBeenCalledWith(
                'Welcome to this book',
                expect.objectContaining({
                    source_type: 'textbook_chapter',
                    source_id: 201,
                    title: 'Introduction',
                    textbook_id: 1,
                    chunk_index: 0,
                    total_chunks: 1
                })
            );
        });
    });
});
