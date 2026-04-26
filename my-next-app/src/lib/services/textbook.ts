import { db } from '@/lib/db';
import { ragService } from '@/lib/ai/rag';
import { splitText } from '@/lib/utils/text-splitter';
import fs from 'fs';
import path from 'path';
import { cache } from 'react';

export interface Textbook {
    id: number;
    title: string;
    author?: string;
    description?: string;
    cover_url?: string;
    created_at: string;
    updated_at: string;
}

export interface TextbookChapter {
    id: number;
    textbook_id: number;
    title: string;
    content: string;
    order_index: number;
    parent_id?: number;
    level: number;
    created_at: string;
    updated_at: string;
}

export const textbookService = {
    /**
     * Create a new textbook
     */
    createTextbook: async (data: Partial<Textbook>): Promise<number> => {
        const result = db.prepare(`
      INSERT INTO textbooks (title, author, description, cover_url)
      VALUES (?, ?, ?, ?)
    `).run(data.title, data.author || '', data.description || '', data.cover_url || '');

        return result.lastInsertRowid as number;
    },

    /**
     * Get all textbooks (Cached per request)
     */
    getAllTextbooks: cache((): Textbook[] => {
        return db.prepare('SELECT * FROM textbooks ORDER BY created_at DESC').all() as Textbook[];
    }),

    /**
     * Get a textbook by ID (Cached per request)
     */
    getTextbook: cache((id: number): Textbook | undefined => {
        return db.prepare('SELECT * FROM textbooks WHERE id = ?').get(id) as Textbook | undefined;
    }),

    /**
     * Delete a textbook
     * This will also cascade delete chapters (due to FK) and should manually cleanup RAG chunks
     */
    deleteTextbook: async (id: number): Promise<void> => {
        // Clean up RAG chunks first
        const chapters = db.prepare('SELECT id FROM textbook_chapters WHERE textbook_id = ?').all(id) as { id: number }[];

        // Deleting by source_type 'textbook' and source_id as textbook_id might be cleaner if we use textbook_id as grouping
        // But in rag.ts we might have stored it by chapter_id?
        // Let's decide convention: source_type='textbook_chapter', source_id={chapter_id}
        // OR source_type='textbook', source_id={textbook_id} but metadata has chapter_id

        // In addChapter implementation below, I used source_type='textbook_chapter'
        for (const chapter of chapters) {
            ragService.deleteChunksBySource('textbook_chapter', chapter.id);
        }

        db.prepare('DELETE FROM textbooks WHERE id = ?').run(id);

        // Clean up file system (images)
        // Path: public/books/[id]
        const bookDir = path.join(process.cwd(), 'public', 'books', id.toString());
        try {
            if (fs.existsSync(bookDir)) {
                fs.rmSync(bookDir, { recursive: true, force: true });
                console.log(`[TextbookService] Deleted directory: ${bookDir}`);
            }
        } catch (error) {
            console.error(`[TextbookService] Failed to delete directory ${bookDir}:`, error);
        }
    },

    /**
     * Add a chapter to a textbook
     * Automatically indexes content to RAG
     */
    addChapter: async (data: Omit<TextbookChapter, 'id' | 'created_at' | 'updated_at'>): Promise<number> => {
        const result = db.prepare(`
      INSERT INTO textbook_chapters (textbook_id, title, content, order_index, parent_id, level)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
            data.textbook_id,
            data.title,
            data.content,
            data.order_index,
            data.parent_id || null,
            data.level
        );

        const chapterId = result.lastInsertRowid as number;

        // Index to RAG with semantic chunking
        if (data.content && data.content.trim().length > 0) {
            const chunks = await splitText(data.content);
            console.log(`[RAG] Split chapter "${data.title}" into ${chunks.length} chunks.`);

            for (let i = 0; i < chunks.length; i++) {
                await ragService.addChunk(chunks[i], {
                    source_type: 'textbook_chapter',
                    source_id: chapterId,
                    textbook_id: data.textbook_id,
                    title: data.title,
                    chunk_index: i,
                    total_chunks: chunks.length
                });
            }
        }

        return chapterId;
    },

    /**
     * Get chapters for a textbook (ordered) (Cached per request)
     */
    getChapters: cache((textbookId: number): TextbookChapter[] => {
        return db.prepare(`
      SELECT * FROM textbook_chapters 
      WHERE textbook_id = ? 
      ORDER BY order_index, id
    `).all(textbookId) as TextbookChapter[];
    }),

    /**
     * Get single chapter (Cached per request)
     */
    getChapter: cache((id: number): TextbookChapter | undefined => {
        return db.prepare('SELECT * FROM textbook_chapters WHERE id = ?').get(id) as TextbookChapter | undefined;
    }),

    /**
     * Update chapter content
     */
    updateChapter: async (id: number, content: string): Promise<void> => {
        db.prepare('UPDATE textbook_chapters SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(content, id);

        // Re-index RAG
        const chapter = textbookService.getChapter(id);
        if (chapter) {
            ragService.deleteChunksBySource('textbook_chapter', id);

            if (content && content.trim().length > 0) {
                const chunks = await splitText(content);
                console.log(`[RAG] Re-split chapter "${chapter.title}" into ${chunks.length} chunks.`);

                for (let i = 0; i < chunks.length; i++) {
                    await ragService.addChunk(chunks[i], {
                        source_type: 'textbook_chapter',
                        source_id: id,
                        textbook_id: chapter.textbook_id,
                        title: chapter.title,
                        chunk_index: i,
                        total_chunks: chunks.length
                    });
                }
            }
        }
    },

    /**
     * Update textbook cover
     */
    updateTextbookCover: async (id: number, coverUrl: string): Promise<void> => {
        db.prepare('UPDATE textbooks SET cover_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(coverUrl, id);
    }
};
