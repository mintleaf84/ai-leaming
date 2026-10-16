import { drizzleDb, drizzleSchema } from "@/lib/db";
import { eq, and, sql, desc } from "drizzle-orm";
import type { WrongQuestionItem } from "./wrong-question";

export interface QuestionFolder {
  id: number;
  userId: number;
  name: string;
  parentId: number | null;
  color: string;
  sortOrder: number;
  createdAt: string | null;
  questionCount: number;
}

export const questionFolderService = {
  async getFolders(userId: number): Promise<QuestionFolder[]> {
    try {
      const rows = await drizzleDb.all<{
        id: number;
        user_id: number;
        name: string;
        parent_id: number | null;
        color: string;
        sort_order: number;
        created_at: string | null;
        question_count: number;
      }>(sql`
        SELECT f.*, COUNT(fi.question_id) as question_count
        FROM question_folders f
        LEFT JOIN question_folder_items fi ON fi.folder_id = f.id
        WHERE f.user_id = ${userId}
        GROUP BY f.id
        ORDER BY f.sort_order, f.created_at
      `);

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        name: r.name,
        parentId: r.parent_id,
        color: r.color || "#6b7280",
        sortOrder: r.sort_order || 0,
        createdAt: r.created_at,
        questionCount: r.question_count || 0,
      }));
    } catch (error) {
      console.error("[Folder] getFolders failed:", error);
      return [];
    }
  },

  async createFolder(
    userId: number,
    name: string,
    color?: string,
  ): Promise<QuestionFolder | null> {
    try {
      const result = await drizzleDb.run(
        sql`INSERT INTO question_folders (user_id, name, color)
            VALUES (${userId}, ${name}, ${color || "#6b7280"})`,
      );
      const id = Number(result.lastInsertRowid);
      const rows = await drizzleDb.all<{
        id: number;
        user_id: number;
        name: string;
        parent_id: number | null;
        color: string;
        sort_order: number;
        created_at: string | null;
      }>(sql`SELECT * FROM question_folders WHERE id = ${id}`);
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        parentId: row.parent_id,
        color: row.color || "#6b7280",
        sortOrder: row.sort_order || 0,
        createdAt: row.created_at,
        questionCount: 0,
      };
    } catch (error) {
      console.error("[Folder] createFolder failed:", error);
      return null;
    }
  },

  async renameFolder(
    userId: number,
    folderId: number,
    name: string,
  ): Promise<boolean> {
    try {
      await drizzleDb.run(
        sql`UPDATE question_folders SET name = ${name} WHERE id = ${folderId} AND user_id = ${userId}`,
      );
      return true;
    } catch (error) {
      console.error("[Folder] renameFolder failed:", error);
      return false;
    }
  },

  async deleteFolder(userId: number, folderId: number): Promise<boolean> {
    try {
      await drizzleDb.run(
        sql`DELETE FROM question_folders WHERE id = ${folderId} AND user_id = ${userId}`,
      );
      return true;
    } catch (error) {
      console.error("[Folder] deleteFolder failed:", error);
      return false;
    }
  },

  async addQuestions(
    userId: number,
    folderId: number,
    questionIds: number[],
  ): Promise<number> {
    try {
      // Verify folder belongs to user
      const folder = await drizzleDb.all<{ id: number }>(
        sql`SELECT id FROM question_folders WHERE id = ${folderId} AND user_id = ${userId}`,
      );
      if (folder.length === 0) return 0;

      let added = 0;
      for (const qId of questionIds) {
        try {
          await drizzleDb.run(
            sql`INSERT OR IGNORE INTO question_folder_items (folder_id, question_id) VALUES (${folderId}, ${qId})`,
          );
          added++;
        } catch {
          /* duplicate, skip */
        }
      }
      return added;
    } catch (error) {
      console.error("[Folder] addQuestions failed:", error);
      return 0;
    }
  },

  async removeQuestion(
    userId: number,
    folderId: number,
    questionId: number,
  ): Promise<boolean> {
    try {
      await drizzleDb.run(
        sql`DELETE FROM question_folder_items
            WHERE folder_id = ${folderId} AND question_id = ${questionId}
            AND EXISTS (SELECT 1 FROM question_folders WHERE id = ${folderId} AND user_id = ${userId})`,
      );
      return true;
    } catch (error) {
      console.error("[Folder] removeQuestion failed:", error);
      return false;
    }
  },

  async getQuestions(
    userId: number,
    folderId: number,
  ): Promise<WrongQuestionItem[]> {
    try {
      // Verify folder belongs to user
      const folder = await drizzleDb.all<{ id: number }>(
        sql`SELECT id FROM question_folders WHERE id = ${folderId} AND user_id = ${userId}`,
      );
      if (folder.length === 0) return [];

      const rows = await drizzleDb.all<{
        question_id: number;
        content: string;
        answer: string;
        explanation: string;
        tags: string;
        dimension: string;
      }>(sql`
        SELECT q.id as question_id, q.content, q.answer, q.explanation, q.tags, q.dimension
        FROM question_folder_items fi
        JOIN questions q ON q.id = fi.question_id
        WHERE fi.folder_id = ${folderId}
        ORDER BY fi.added_at DESC
      `);

      return rows.map((r) => ({
        questionId: r.question_id,
        questionContent: r.content,
        tags: r.tags ? (JSON.parse(r.tags) as string[]) : [],
        wrongCount: 0,
        lastWrongAt: "",
        correctAnswer: r.answer || "",
        userLastAnswer: "",
      }));
    } catch (error) {
      console.error("[Folder] getQuestions failed:", error);
      return [];
    }
  },

  async getFolderIdsForQuestion(
    userId: number,
    questionId: number,
  ): Promise<number[]> {
    try {
      const rows = await drizzleDb.all<{ folder_id: number }>(
        sql`SELECT fi.folder_id FROM question_folder_items fi
            JOIN question_folders f ON f.id = fi.folder_id
            WHERE fi.question_id = ${questionId} AND f.user_id = ${userId}`,
      );
      return rows.map((r) => r.folder_id);
    } catch (error) {
      console.error("[Folder] getFolderIdsForQuestion failed:", error);
      return [];
    }
  },
};
