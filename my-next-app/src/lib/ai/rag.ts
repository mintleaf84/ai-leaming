import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { getErrorMessage } from '@/lib/utils/error';
import { getAiConfig } from './client';
import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, sql, desc, and, like, or } from 'drizzle-orm';
import { env } from '@/env';

export interface RagResult {
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export const ragService = {
  /**
   * 获取文本向量 (使用标准 SDK)
   */
  getEmbedding: async (text: string): Promise<number[]> => {
    if (env.E2E_TEST === 'true') {
      const { embeddingDimensions } = await getAiConfig();
      return new Array(embeddingDimensions || 1024).fill(0).map((_, i) => Math.sin(i));
    }

    const { apiKey, baseURL, modelName } = await getAiConfig('embedding');

    try {
      const openai = createOpenAI({ apiKey, baseURL });
      const { embedding } = await embed({
        model: openai.embedding(modelName || 'text-embedding-3-small'),
        value: text,
      });
      return embedding;
    } catch (error: unknown) {
      console.warn('[RAG] Embedding 失败，原因:', getErrorMessage(error));
      const { embeddingDimensions } = await getAiConfig();
      return new Array(embeddingDimensions || 1024).fill(0).map((_, i) => {
        let hash = 0;
        for (let charIndex = 0; charIndex < text.length; charIndex++) {
          hash = (hash << 5) - hash + text.charCodeAt(charIndex);
          hash |= 0;
        }
        return Math.sin(hash + i);
      });
    }
  },

  /**
   * 初始化 RAG 表
   */
  initRagTable: async () => {
    const { embeddingDimensions } = await getAiConfig();
    const dim = embeddingDimensions || 1024;

    // 使用 drizzleDb.run 执行 DDL
    const tableExists = await drizzleDb.select({ count: sql<number>`count(*)` })
      .from(sql`sqlite_master`)
      .where(sql`type='table' AND name='content_chunks'`)
      .get();

    if (!tableExists || Number(tableExists.count) === 0) {
      await drizzleDb.run(sql`
        CREATE TABLE IF NOT EXISTS content_chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT NOT NULL,
          metadata TEXT
        );
        CREATE VIRTUAL TABLE content_vec USING vec0(
          embedding float[${dim}]
        );
      `);
      console.log(`[RAG] Initialized tables with dimensions: ${dim}`);
    }
  },

  /**
   * 添加知识块
   */
  addChunk: async (content: string, metadata: Record<string, unknown> = {}) => {
    const embedding = await ragService.getEmbedding(content);
    
    // 向量表 insert
    const infoVec = await drizzleDb.run(sql`INSERT INTO content_vec(embedding) VALUES (${JSON.stringify(embedding)})`);
    const vecRowid = (infoVec as any).lastInsertRowid;
    
    // 基础表 insert
    await drizzleDb.run(sql`INSERT INTO content_chunks (id, content, metadata) VALUES (${Number(vecRowid)}, ${content}, ${JSON.stringify(metadata)})`);
  },

  /**
   * 删除指定来源的知识块
   */
  deleteChunksBySource: async (sourceType: string, sourceId: number) => {
    try {
      // 找到匹配的 ID
      const chunks = await drizzleDb.all<any>(sql`
        SELECT id FROM content_chunks 
        WHERE json_extract(metadata, '$.source_type') = ${sourceType} 
        AND json_extract(metadata, '$.source_id') = ${sourceId}
      `);

      if (chunks.length > 0) {
        const ids = chunks.map(c => c.id);
        
        // 删除基础表和向量表 (向量表 rowid 与基础表 id 对应)
        await drizzleDb.run(sql`DELETE FROM content_chunks WHERE id IN (${sql.join(ids, sql`, `)})`);
        await drizzleDb.run(sql`DELETE FROM content_vec WHERE rowid IN (${sql.join(ids, sql`, `)})`);

        console.log(`[RAG] Deleted ${chunks.length} chunks for ${sourceType}:${sourceId}`);
      }
    } catch (error) {
      console.error('[RAG] Delete chunks failed:', error);
    }
  },

  /**
   * 向量检索
   */
  search: async (query: string, limit: number = 3, sourceType?: string): Promise<RagResult[]> => {
    try {
      const queryEmbedding = await ragService.getEmbedding(query);

      // 检查 vec0 模块
      try {
        await drizzleDb.run(sql`SELECT vec_version()`);
      } catch (_e) {
        console.error('[RAGService] sqlite-vec 扩展未加载，无法进行向量检索');
        return [];
      }

      const fetchLimit = sourceType ? limit * 3 : limit;

      const results = await drizzleDb.all<any>(sql`
        SELECT 
          c.content,
          v.distance,
          c.metadata
        FROM content_vec v
        JOIN content_chunks c ON c.id = v.rowid
        WHERE v.embedding MATCH ${JSON.stringify(queryEmbedding)}
          AND k = ${fetchLimit}
      `);

      let filtered = results;
      if (sourceType) {
        filtered = results.filter(r => {
          try {
            const meta = JSON.parse(r.metadata || '{}');
            return meta.source_type === sourceType;
          } catch { return false; }
        });
      }

      return filtered.slice(0, limit).map(r => ({
        content: r.content,
        score: 1 - r.distance,
        metadata: JSON.parse(r.metadata || '{}')
      }));
    } catch (e) {
      console.error('[RAG] Vector Search Error:', e);
      return [];
    }
  },

  /**
   * 重排序 (Rerank)
   */
  rerank: async (query: string, results: RagResult[]): Promise<RagResult[]> => {
    if (process.env.E2E_TEST === 'true') return results;

    const { apiKey, baseURL, modelName } = await getAiConfig('rerank');
    if (!modelName || results.length <= 1) return results;

    try {
      const response = await fetch(`${baseURL}/rerank`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          query: query,
          documents: results.map(r => r.content),
          top_n: results.length
        })
      });

      if (!response.ok) throw new Error(`Rerank API error: ${response.status}`);
      const data = await response.json();

      if (data.results && Array.isArray(data.results)) {
        const reranked = data.results.map((item: any) => ({
          ...results[item.index],
          score: item.relevance_score
        }));
        return reranked.sort((a: any, b: any) => b.score - a.score);
      }
      return results;
    } catch (error: unknown) {
      console.warn('[RAG] Rerank 失败，原因:', getErrorMessage(error));
      return results;
    }
  }
};

/**
 * 辅助函数：搜索与题库相关的内容 (用于聊天功能的 RAG 检索)
 */
export async function searchSimilarContent(query: string, limit: number = 3) {
  try {
    const results = await drizzleDb.select({
      id: drizzleSchema.questions.id,
      content: drizzleSchema.questions.content,
      explanation: drizzleSchema.questions.explanation,
      tags: drizzleSchema.questions.tags,
      dimension: drizzleSchema.questions.dimension
    })
    .from(drizzleSchema.questions)
    .where(or(
      like(drizzleSchema.questions.content, `%${query}%`),
      like(drizzleSchema.questions.explanation, `%${query}%`),
      like(drizzleSchema.questions.tags, `%${query}%`)
    ))
    .limit(limit)
    .all();

    return results;
  } catch (error) {
    console.error('[RAG] searchSimilarContent 失败:', error);
    return [];
  }
}