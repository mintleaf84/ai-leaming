// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { textbookService } from '../textbook';
import fs from 'fs';

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

vi.mock('@/lib/db', () => ({ default: mockDb }));
vi.mock('@/lib/ai/rag', () => ({ ragService: mockRag }));
vi.mock('fs', () => ({ default: mockFs }));
vi.mock('@/lib/utils/text-splitter', () => ({ splitText: (t: string) => [t] }));

describe('Textbook Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createTextbook', () => {
        it('should insert and return new id', async () => {
            mockDb.prepare.mockReturnValue({
                run: vi.fn().mockReturnValue({ lastInsertRowid: 1 })
            });

            const id = await textbookService.createTextbook({ title: 'Test' });
            expect(id).toBe(1);
        });
    });

    describe('deleteTextbook', () => {
        it('should cleanup RAG and files', async () => {
            mockDb.prepare.mockReturnValue({
                all: vi.fn().mockReturnValue([{ id: 101 }]), // chapters
                run: vi.fn(),
            });
            mockFs.existsSync.mockReturnValue(true);

            await textbookService.deleteTextbook(1);

            expect(mockRag.deleteChunksBySource).toHaveBeenCalledWith('textbook_chapter', 101);
            expect(mockFs.rmSync).toHaveBeenCalled();
        });
    });

    describe('addChapter', () => {
        it('should insert and index to RAG', async () => {
            mockDb.prepare.mockReturnValue({
                run: vi.fn().mockReturnValue({ lastInsertRowid: 201 })
            });

            const id = await textbookService.addChapter({
                textbook_id: 1,
                title: 'Chapter 1',
                content: 'Test content',
                order_index: 0,
                level: 1
            });

            expect(id).toBe(201);
            expect(mockRag.addChunk).toHaveBeenCalled();
        });
    });
});
