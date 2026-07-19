import { drizzleDb } from "@/lib/db";
import { textbooks, textbook_chapters } from "@/lib/db/drizzle-schema";
import { eq, desc, asc } from "drizzle-orm";
import { ragService } from "@/lib/ai/rag";
import { splitText } from "@/lib/utils/text-splitter";
import fs from "fs";
import path from "path";
import { cache } from "react";

export interface Textbook {
  id: number;
  title: string;
  author?: string | null;
  description?: string | null;
  cover_url?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TextbookChapter {
  id: number;
  textbook_id: number;
  title: string;
  content: string;
  order_index: number | null;
  parent_id?: number | null;
  level: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export const textbookService = {
  /**
   * Create a new textbook
   */
  createTextbook: async (data: Partial<Textbook>): Promise<number> => {
    const result = await drizzleDb
      .insert(textbooks)
      .values({
        title: data.title!,
        author: data.author || "",
        description: data.description || "",
        cover_url: data.cover_url || "",
      })
      .returning({ id: textbooks.id });

    return result[0].id;
  },

  /**
   * Get all textbooks (Cached per request)
   */
  getAllTextbooks: cache(async (): Promise<Textbook[]> => {
    return (await drizzleDb
      .select()
      .from(textbooks)
      .orderBy(desc(textbooks.created_at))
      .all()) as Textbook[];
  }),

  /**
   * Get a textbook by ID (Cached per request)
   */
  getTextbook: cache(async (id: number): Promise<Textbook | undefined> => {
    return (await drizzleDb
      .select()
      .from(textbooks)
      .where(eq(textbooks.id, id))
      .get()) as Textbook | undefined;
  }),

  /**
   * Delete a textbook
   * This will also cascade delete chapters (due to FK) and should manually cleanup RAG chunks
   */
  deleteTextbook: async (id: number): Promise<void> => {
    // Clean up RAG chunks first
    const chapters = await drizzleDb
      .select({ id: textbook_chapters.id })
      .from(textbook_chapters)
      .where(eq(textbook_chapters.textbook_id, id))
      .all();

    for (const chapter of chapters) {
      await ragService.deleteChunksBySource("textbook_chapter", chapter.id);
    }

    await drizzleDb.delete(textbooks).where(eq(textbooks.id, id));

    // Clean up file system (images)
    const bookDir = path.join(process.cwd(), "public", "books", id.toString());
    try {
      if (fs.existsSync(bookDir)) {
        fs.rmSync(bookDir, { recursive: true, force: true });
        console.log(`[TextbookService] Deleted directory: ${bookDir}`);
      }
    } catch (error) {
      console.error(
        `[TextbookService] Failed to delete directory ${bookDir}:`,
        error,
      );
    }
  },

  /**
   * Add a chapter to a textbook
   * Automatically indexes content to RAG
   */
  addChapter: async (
    data: Omit<TextbookChapter, "id" | "created_at" | "updated_at">,
  ): Promise<number> => {
    const result = await drizzleDb
      .insert(textbook_chapters)
      .values({
        textbook_id: data.textbook_id,
        title: data.title,
        content: data.content,
        order_index: data.order_index,
        parent_id: data.parent_id || null,
        level: data.level,
      })
      .returning({ id: textbook_chapters.id });

    const chapterId = result[0].id;

    // Index to RAG with semantic chunking
    if (data.content && data.content.trim().length > 0) {
      const chunks = await splitText(data.content);
      console.log(
        `[RAG] Split chapter "${data.title}" into ${chunks.length} chunks.`,
      );

      for (let i = 0; i < chunks.length; i++) {
        await ragService.addChunk(chunks[i], {
          source_type: "textbook_chapter",
          source_id: chapterId,
          textbook_id: data.textbook_id,
          title: data.title,
          chunk_index: i,
          total_chunks: chunks.length,
        });
      }
    }

    return chapterId;
  },

  /**
   * Get chapters for a textbook (ordered) (Cached per request)
   */
  getChapters: cache(async (textbookId: number): Promise<TextbookChapter[]> => {
    return (await drizzleDb
      .select()
      .from(textbook_chapters)
      .where(eq(textbook_chapters.textbook_id, textbookId))
      .orderBy(asc(textbook_chapters.order_index), asc(textbook_chapters.id))
      .all()) as TextbookChapter[];
  }),

  /**
   * Get single chapter (Cached per request)
   */
  getChapter: cache(
    async (id: number): Promise<TextbookChapter | undefined> => {
      return (await drizzleDb
        .select()
        .from(textbook_chapters)
        .where(eq(textbook_chapters.id, id))
        .get()) as TextbookChapter | undefined;
    },
  ),

  /**
   * Update chapter content
   */
  updateChapter: async (id: number, content: string): Promise<void> => {
    await drizzleDb
      .update(textbook_chapters)
      .set({ content, updated_at: new Date().toISOString() })
      .where(eq(textbook_chapters.id, id));

    // Re-index RAG
    const chapter = await textbookService.getChapter(id);
    if (chapter) {
      await ragService.deleteChunksBySource("textbook_chapter", id);

      if (content && content.trim().length > 0) {
        const chunks = await splitText(content);
        console.log(
          `[RAG] Re-split chapter "${chapter.title}" into ${chunks.length} chunks.`,
        );

        for (let i = 0; i < chunks.length; i++) {
          await ragService.addChunk(chunks[i], {
            source_type: "textbook_chapter",
            source_id: id,
            textbook_id: chapter.textbook_id,
            title: chapter.title,
            chunk_index: i,
            total_chunks: chunks.length,
          });
        }
      }
    }
  },

  /**
   * Update textbook cover
   */
  updateTextbookCover: async (id: number, coverUrl: string): Promise<void> => {
    await drizzleDb
      .update(textbooks)
      .set({ cover_url: coverUrl, updated_at: new Date().toISOString() })
      .where(eq(textbooks.id, id));
  },
};
