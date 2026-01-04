import db from './db';
import { ragService } from './rag-service';

export const questionService = {
  /**
   * Search for similar questions in the database as fallback
   */
  searchSimilarQuestions: async (content: string, limit: number = 3) => {
    try {
      const embedding = await ragService.getEmbedding(content);
      
      // 检查 vec0 模块是否可用
      try {
        db.prepare('SELECT vec_version()').get();
      } catch (e) {
        console.error('[QuestionService] sqlite-vec 扩展未加载，无法进行向量检索');
        return [];
      }

      // Using sqlite-vec v0.1.x syntax
      const results = db.prepare(`
        SELECT 
          q.*,
          v.distance
        FROM questions_vec v
        JOIN questions q ON q.id = v.rowid
        WHERE v.embedding MATCH ?
          AND k = ?
        ORDER BY v.distance
      `).all(JSON.stringify(embedding), limit) as any[];

      return results;
    } catch (error) {
      console.error('[QuestionService] 相似题目检索失败:', error);
      return [];
    }
  }
};