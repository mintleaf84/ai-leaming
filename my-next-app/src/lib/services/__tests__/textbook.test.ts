// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { textbookService } from '../textbook';

// Mock DB & Schema & Utils
const { mockDrizzle, mockRag, mockFs } = vi.hoisted(() => {
    return {
        mockDrizzle: {
            insert: vi.fn(),
            select: vi.fn(),
            delete: vi.fn(),
            update: vi.fn(),
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

vi.mock('@/lib/db', () => ({ 
    drizzleDb: mockDrizzle,
    textbooks: { id: 'textbooks.id' },
    textbook_chapters: { id: 'textbook_chapters.id', textbook_id: 'textbook_chapters.textbook_id' }
}));

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

import { textbooks, textbook_chapters } from '@/lib/db/drizzle-schema';

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

            const selectMockChain = {
                from: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                all: vi.fn().mockResolvedValue(mockChapters)
            };
            mockDrizzle.select.mockReturnValue(selectMockChain);
            mockDrizzle.delete.mockReturnValue({ where: vi.fn().mockReturnThis() });
            mockFs.existsSync.mockReturnValue(true);

            await textbookService.deleteTextbook(1);

            // 验证是否针对每一个章节都调用了 RAG 删除
            expect(mockRag.deleteChunksBySource).toHaveBeenCalledTimes(2);
            expect(mockRag.deleteChunksBySource).toHaveBeenCalledWith('textbook_chapter', 101);
            expect(mockRag.deleteChunksBySource).toHaveBeenCalledWith('textbook_chapter', 102);
            
            // 验证数据库记录也被删除
            expect(mockDrizzle.delete).toHaveBeenCalledWith(textbooks);
        });
    });

    describe('addChapter', () => {
        it('should index chunk with correct metadata', async () => {
            const insertMockChain = {
                values: vi.fn().mockReturnThis(),
                returning: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ id: 201 }), // fallback if used
                    // Drizzle insert().returning() returns an array in LibSQL
                })
            };
            // 针对 LibSQL returning() 返回数组的处理
            (insertMockChain.returning() as any).then = (resolve: any) => resolve([{ id: 201 }]);

            mockDrizzle.insert.mockReturnValue(insertMockChain);

            await textbookService.addChapter({
                textbook_id: 1,
                title: 'Introduction',
                content: 'Welcome to this book',
                order_index: 0,
                level: 1
            });

            // 验证精准匹配 RAG 索引的元数据
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
