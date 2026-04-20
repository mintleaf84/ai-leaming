import db from '@/lib/db';
import { ragService } from '@/lib/ai/rag';
import { Question } from '@/types';
import { safeGet, safeAll } from '@/lib/db/safe-query';
import { QuestionRowSchema } from '@/lib/schemas';

export interface QuestionFilter {
  limit?: number;
  offset?: number;
  tags?: string[];
  type?: string[];
  search?: string;
}

export const questionService = {
  /**
   * Search for similar questions in the database as fallback
   */
  searchSimilarQuestions: async (content: string, limit: number = 3) => {
    try {
      const embedding = await ragService.getEmbedding(content);

      try {
        db.prepare('SELECT vec_version()').get();
      } catch (_e) {
        console.error('[QuestionService] sqlite-vec 扩展未加载，无法进行向量检索');
        return [];
      }

      const results = db.prepare(`
        SELECT 
          q.*,
          v.distance
        FROM questions_vec v
        JOIN questions q ON q.id = v.rowid
        WHERE v.embedding MATCH ?
          AND k = ?
        ORDER BY v.distance
      `).all(JSON.stringify(embedding), limit) as unknown[];

      return results;
    } catch (error) {
      console.error('[QuestionService] 相似题目检索失败:', error);
      return [];
    }
  },

  /**
   * Get a question by ID
   */
  getById: async (id: number): Promise<Question | null> => {
    return safeGet(
      db.prepare('SELECT * FROM questions WHERE id = ?'),
      [id],
      QuestionRowSchema
    );
  },

  /**
   * List questions with filtering
   */
  list: async (filter: QuestionFilter = {}): Promise<{ items: Question[]; total: number }> => {
    let query = 'SELECT * FROM questions WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as count FROM questions WHERE 1=1';
    const params: unknown[] = [];

    if (filter.search) {
      const searchCondition = ' AND content LIKE ?';
      query += searchCondition;
      countQuery += searchCondition;
      params.push(`%${filter.search}%`);
    }

    if (filter.type && filter.type.length > 0) {
      const placeholders = filter.type.map(() => '?').join(',');
      const typeCondition = ` AND type IN (${placeholders})`;
      query += typeCondition;
      countQuery += typeCondition;
      params.push(...filter.type);
    }

    // Note: Tag filtering in SQLite JSON text is complex, handled naively here
    // Optimally use FTS5 or separate tables
    if (filter.tags && filter.tags.length > 0) {
      // Very simple partial match for now
      for (const tag of filter.tags) {
        query += ' AND tags LIKE ?';
        countQuery += ' AND tags LIKE ?';
        params.push(`%${tag}%`);
      }
    }

    // Clone params for count query before adding limit/offset
    const countParams = [...params];

    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(filter.limit || 20, filter.offset || 0);

    const items = safeAll(
      db.prepare(query),
      params,
      QuestionRowSchema
    );

    const totalResult = db.prepare(countQuery).get(...countParams) as { count: number };

    return {
      items,
      total: totalResult.count
    };
  }
};