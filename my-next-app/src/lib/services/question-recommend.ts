import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, sql, desc, and, or, lt } from 'drizzle-orm';
import { Document } from '@langchain/core/documents';
import { RagEmbeddings, SqliteVecVectorStore } from '@/lib/ai/langchain-store';
import { ragService, type RagResult } from '@/lib/ai/rag';

/**
 * 用户错题记录
 */
export interface WrongQuestion {
  questionId: number;
  content: string;
  wrongAnswer: string;
  correctAnswer: string;
  explanation: string;
  tags: string[];
  dimension: string;
  timestamp: string;
}

/**
 * 错题推荐服务
 * 基于用户的错题历史，使用 RAG 技术推荐相似题目
 */
export const wrongQuestionRecommend = {
  /**
   * 获取用户的错题列表
   */
  async getWrongQuestions(userId: number, limit: number = 20): Promise<WrongQuestion[]> {
    try {
      // 查询用户的错误练习记录
      const wrongLogs = await drizzleDb.select({
        id: drizzleSchema.practice_logs.id,
        questionId: drizzleSchema.practice_logs.question_id,
        userAnswer: drizzleSchema.practice_logs.user_answer,
        isCorrect: drizzleSchema.practice_logs.is_correct,
        timestamp: drizzleSchema.practice_logs.timestamp,
      })
        .from(drizzleSchema.practice_logs)
        .where(
          and(
            eq(drizzleSchema.practice_logs.user_id, userId),
            eq(drizzleSchema.practice_logs.is_correct, false)
          )
        )
        .orderBy(desc(drizzleSchema.practice_logs.timestamp))
        .limit(limit)
        .all();

      if (wrongLogs.length === 0) return [];

      // 获取题目详情
      const questionIds = wrongLogs.map((log) => log.questionId);
      const questions = await drizzleDb.select({
        id: drizzleSchema.questions.id,
        content: drizzleSchema.questions.content,
        answer: drizzleSchema.questions.answer,
        explanation: drizzleSchema.questions.explanation,
        tags: drizzleSchema.questions.tags,
        dimension: drizzleSchema.questions.dimension,
      })
        .from(drizzleSchema.questions)
        .where(
          sql`${drizzleSchema.questions.id} IN (${sql.join(
            questionIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
        .all();

      // 关联错误记录和题目详情
      const questionMap = new Map(questions.map((q) => [q.id, q]));
      return wrongLogs
        .filter((log) => questionMap.has(log.questionId))
        .map((log) => {
          const q = questionMap.get(log.questionId)!;
          return {
            questionId: log.questionId,
            content: q.content,
            wrongAnswer: log.userAnswer || '',
            correctAnswer: q.answer || '',
            explanation: q.explanation || '',
            tags: q.tags ? JSON.parse(q.tags) as string[] : [],
            dimension: q.dimension || '',
            timestamp: log.timestamp || '',
          };
        });
    } catch (error) {
      console.error('[WrongQuestion] getWrongQuestions failed:', error);
      return [];
    }
  },

  /**
   * 获取用户最薄弱的知识点
   */
  async getWeakestTags(userId: number, limit: number = 5): Promise<{ tag: string; score: number }[]> {
    try {
      const mastery = await drizzleDb.select({
        tagName: drizzleSchema.user_mastery.tag_name,
        score: drizzleSchema.user_mastery.score,
        totalCount: drizzleSchema.user_mastery.total_count,
      })
        .from(drizzleSchema.user_mastery)
        .where(eq(drizzleSchema.user_mastery.user_id, userId))
        .orderBy(drizzleSchema.user_mastery.score)
        .limit(limit)
        .all();

      return mastery
        .filter((m) => (m.totalCount || 0) >= 3) // 至少做过的题目
        .map((m) => ({ tag: m.tagName, score: m.score || 0 }));
    } catch (error) {
      console.error('[WrongQuestion] getWeakestTags failed:', error);
      return [];
    }
  },

  /**
   * 基于题目内容向量检索推荐相似题目
   * 用于错题详情页的"推荐相似题"功能
   * 支持实时写入：如果向量库为空，会自动初始化
   */
  async recommendByTags(
    currentQuestionId: number,
    tags: string[],
    limit: number = 5
  ): Promise<RagResult[]> {
    try {
      // 检查向量库是否有数据
      const hasVectorData = await this.ensureVectorData(currentQuestionId);
      if (!hasVectorData) {
        console.log('[Recommend] 向量库为空，暂无推荐');
        return [];
      }

      // 获取当前题目的内容
      const question = await drizzleDb.select({
        content: drizzleSchema.questions.content,
      })
        .from(drizzleSchema.questions)
        .where(eq(drizzleSchema.questions.id, currentQuestionId))
        .get();

      if (!question) return [];

      // 使用向量检索，基于题目内容找相似题
      const results = await ragService.search(question.content, limit * 3, 'question');

      // 过滤掉当前题目，并返回结果
      return results
        .filter(r => (r.metadata?.question_id as number) !== currentQuestionId)
        .slice(0, limit);
    } catch (error) {
      console.error('[WrongQuestion] recommendByTags (vector) failed:', error);
      return [];
    }
  },

  /**
   * 确保向量库有足够的题目数据
   * 如果没有，初始化所有题目到向量库
   */
  async ensureVectorData(questionId: number): Promise<boolean> {
    try {
      // 检查向量库中 question 类型的数量
      const countResult = await drizzleDb.all<{ count: number }>(sql`
        SELECT COUNT(*) as count FROM content_chunks
        WHERE json_extract(metadata, '$.source_type') = 'question'
      `);

      const existingCount = countResult[0]?.count || 0;

      // 如果已有 50+ 题，足够了
      if (existingCount >= 50) {
        return true;
      }

      console.log(`[Recommend] 向量库题量不足 (${existingCount})，开始初始化所有题目...`);

      // 获取所有题目
      const allQuestions = await drizzleDb.select({
        id: drizzleSchema.questions.id,
        content: drizzleSchema.questions.content,
        explanation: drizzleSchema.questions.explanation,
        tags: drizzleSchema.questions.tags,
        dimension: drizzleSchema.questions.dimension,
      })
        .from(drizzleSchema.questions)
        .where(sql`${drizzleSchema.questions.content} IS NOT NULL`)
        .all();

      console.log(`[Recommend] 共 ${allQuestions.length} 道题目待向量化`);

      // 批量写入所有题目
      let successCount = 0;
      for (const q of allQuestions) {
        try {
          await ragService.addChunk(q.content || '', {
            source_type: 'question',
            question_id: q.id,
            tags: q.tags ? JSON.parse(q.tags) : [],
            dimension: q.dimension,
            explanation: q.explanation,
          });
          successCount++;
        } catch { /* 忽略写入失败 */ }
      }

      console.log(`[Recommend] 向量库初始化完成，共 ${successCount} 道题目`);
      return successCount > 0;
    } catch (error) {
      console.error('[Recommend] ensureVectorData failed:', error);
      return false;
    }
  },

  /**
   * 基于错题历史推荐相似题目
   */
  async recommendSimilar(
    userId: number,
    limit: number = 5
  ): Promise<RagResult[]> {
    try {
      const wrongQuestions = await this.getWrongQuestions(userId, 10);
      if (wrongQuestions.length === 0) {
        return [];
      }

      const allTags = new Set<string>();
      wrongQuestions.forEach((q) => {
        q.tags.forEach((tag) => allTags.add(tag));
      });

      if (allTags.size === 0) {
        const sampleWrong = wrongQuestions[0];
        const vectorResults = await ragService.search(
          sampleWrong.content,
          limit * 2,
          'question'
        );
        return this.filterAlreadyDone(userId, vectorResults, limit);
      }

      const recommended: RagResult[] = [];
      const excludeIds = wrongQuestions.map((q) => q.questionId);

      const similarQuestions = await drizzleDb.select({
        id: drizzleSchema.questions.id,
        content: drizzleSchema.questions.content,
        explanation: drizzleSchema.questions.explanation,
        tags: drizzleSchema.questions.tags,
        dimension: drizzleSchema.questions.dimension,
        answer: drizzleSchema.questions.answer,
      })
        .from(drizzleSchema.questions)
        .where(
          and(
            sql`${drizzleSchema.questions.id} NOT IN (${sql.join(
              excludeIds.map((id) => sql`${id}`),
              sql`, `
            )})`,
            sql`${drizzleSchema.questions.tags} IS NOT NULL`
          )
        )
        .limit(limit * 3)
        .all();

      const tagArray = Array.from(allTags);
      for (const q of similarQuestions) {
        if (recommended.length >= limit) break;

        const qTags = q.tags ? JSON.parse(q.tags) : [];
        const hasMatchingTag = qTags.some((tag: string) =>
          tagArray.some((t) => tag.includes(t) || t.includes(tag))
        );

        if (hasMatchingTag) {
          recommended.push({
            content: q.content,
            score: 1,
            metadata: {
              question_id: q.id,
              explanation: q.explanation,
              tags: qTags,
              dimension: q.dimension,
              answer: q.answer,
              reason: 'similar_tag',
            },
          });
        }
      }

      return recommended;
    } catch (error) {
      console.error('[WrongQuestion] recommendSimilar failed:', error);
      return [];
    }
  },

  /**
   * 基于个人知识向量推荐
   */
  async recommendByVector(
    userId: number,
    limit: number = 5
  ): Promise<Document[]> {
    try {
      // 1. 获取用户最近的错题内容
      const wrongQuestions = await this.getWrongQuestions(userId, 5);
      if (wrongQuestions.length === 0) {
        return [];
      }

      // 2. 合并错题内容构建查询向量
      const combinedText = wrongQuestions
        .slice(0, 3)
        .map((q) => q.content)
        .join(' ');

      // 3. 使用向量检索相似题目
      const embeddings = new RagEmbeddings({});
      const vectorStore = await SqliteVecVectorStore.fromExistingIndex(
        embeddings,
        { sourceType: 'question' }
      );

      const results = await vectorStore.similaritySearch(combinedText, limit);

      // 4. 过滤掉用户做过的题目
      const doneIds = wrongQuestions.map((q) => q.questionId);
      return results.filter((doc) => !doneIds.includes(doc.metadata.question_id as number));
    } catch (error) {
      console.error('[WrongQuestion] recommendByVector failed:', error);
      return [];
    }
  },

  /**
   * 过滤掉用户已做过的题目
   */
  async filterAlreadyDone(
    userId: number,
    results: RagResult[],
    limit: number
  ): Promise<RagResult[]> {
    try {
      // 获取用户做过的题目 ID
      const doneQuestions = await drizzleDb.select({
        questionId: drizzleSchema.practice_logs.question_id,
      })
        .from(drizzleSchema.practice_logs)
        .where(eq(drizzleSchema.practice_logs.user_id, userId))
        .all();

      const doneIds = new Set(doneQuestions.map((q) => q.questionId));

      // 过滤
      const filtered = results.filter(
        (r) => !doneIds.has(r.metadata?.question_id as number)
      );

      return filtered.slice(0, limit);
    } catch (error) {
      console.error('[WrongQuestion] filterAlreadyDone failed:', error);
      return results.slice(0, limit);
    }
  },

  /**
   * 综合推荐：结合知识点和向量检索
   */
  async comprehensiveRecommend(
    userId: number,
    limit: number = 5
  ): Promise<RagResult[]> {
    try {
      // 1. 基于知识点标签推荐
      const tagBased = await this.recommendSimilar(userId, limit);

      // 2. 如果知识点推荐不足，用向量检索补充
      if (tagBased.length < limit) {
        const wrongQuestions = await this.getWrongQuestions(userId, 3);
        if (wrongQuestions.length > 0) {
          const sampleWrong = wrongQuestions[0];
          const vectorResults = await ragService.search(
            sampleWrong.content,
            limit * 2,
            'question'
          );

          // 合并去重
          const existingIds = new Set(tagBased.map((r) => r.metadata?.question_id));
          for (const r of vectorResults) {
            if (tagBased.length >= limit) break;
            if (!existingIds.has(r.metadata?.question_id)) {
              tagBased.push({ ...r, metadata: { ...r.metadata, reason: 'vector' } });
            }
          }
        }
      }

      return tagBased.slice(0, limit);
    } catch (error) {
      console.error('[WrongQuestion] comprehensiveRecommend failed:', error);
      return [];
    }
  },
};

/**
 * 获取用户的整体学习报告
 */
export async function getUserLearningReport(userId: number) {
  try {
    // 统计正确率
    const stats = await drizzleDb.select({
      total: sql<number>`count(*)`,
      correct: sql<number>`sum(case when ${drizzleSchema.practice_logs.is_correct} = 1 then 1 else 0 end)`,
    })
      .from(drizzleSchema.practice_logs)
      .where(eq(drizzleSchema.practice_logs.user_id, userId))
      .get();

    const totalQuestions = stats?.total || 0;
    const correctCount = stats?.correct || 0;
    const accuracy = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

    // 获取薄弱知识点
    const weakTags = await wrongQuestionRecommend.getWeakestTags(userId, 3);

    // 最近的错题
    const recentWrong = await wrongQuestionRecommend.getWrongQuestions(userId, 5);

    return {
      totalQuestions,
      correctCount,
      accuracy: accuracy.toFixed(1),
      weakTags,
      recentWrong,
    };
  } catch (error) {
    console.error('[LearningReport] getUserLearningReport failed:', error);
    return null;
  }
}