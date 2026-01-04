import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { getAiConfig } from './client';
import db from '@/lib/db';

export interface RagResult {
  content: string;
  score: number;
  metadata?: any;
}

export const ragService = {
  /**
   * 获取文本向量 (使用标准 SDK)
   */
  getEmbedding: async (text: string): Promise<number[]> => {
    const { apiKey, baseURL, modelName } = getAiConfig('embedding');

    try {
      const openai = createOpenAI({
        apiKey,
        baseURL,
      });

      const { embedding } = await embed({
        model: openai.embedding(modelName || 'text-embedding-3-small'),
        value: text,
      });

      return embedding;
    } catch (error: any) {
      console.warn('[RAG] Embedding 失败，原因:', error.message);
      // 保持原有的模拟逻辑，但需要适配维度
      const { embeddingDimensions } = getAiConfig();
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
  initRagTable: () => {
    const { embeddingDimensions } = getAiConfig();
    const dim = embeddingDimensions || 1024;

    const tableExists = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='content_chunks'").get() as { count: number };

    if (!tableExists.count) {
      db.exec(`
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
    } else {
      // 检查维度是否匹配
      try {
        const schema = db.prepare("SELECT sql FROM sqlite_master WHERE name='content_vec'").get() as { sql: string };
        if (schema && !schema.sql.includes(`float[${dim}]`)) {
          console.error(`[RAG] 维度不匹配！配置要求 ${dim} 维，但数据库现存模型不一致。建议清空 content_vec 表重构。`);
        }
      } catch (e) {
        console.warn('[RAG] 无法验证向量维度状态');
      }
    }
  },

  /**
   * 添加知识块
   */
  addChunk: async (content: string, metadata: any = {}) => {
    const embedding = await ragService.getEmbedding(content);
    const infoVec = db.prepare('INSERT INTO content_vec(embedding) VALUES (?)').run(JSON.stringify(embedding));
    const vecRowid = infoVec.lastInsertRowid;
    db.prepare('INSERT INTO content_chunks (id, content, metadata) VALUES (?, ?, ?)').run(Number(vecRowid), content, JSON.stringify(metadata));
  },

  /**
   * 删除指定来源的知识块
   */
  deleteChunksBySource: (sourceType: string, sourceId: number) => {
    try {
      const chunks = db.prepare(`
        SELECT id FROM content_chunks 
        WHERE json_extract(metadata, '$.source_type') = ? 
        AND json_extract(metadata, '$.source_id') = ?
      `).all(sourceType, sourceId) as { id: number }[];

      if (chunks.length > 0) {
        const ids = chunks.map(c => c.id);
        const placeholders = ids.map(() => '?').join(',');

        // 删除 content_chunks
        db.prepare(`DELETE FROM content_chunks WHERE id IN (${placeholders})`).run(...ids);

        // 删除 content_vec (使用 rowid)
        db.prepare(`DELETE FROM content_vec WHERE rowid IN (${placeholders})`).run(...ids);

        console.log(`[RAG] Deleted ${chunks.length} chunks for ${sourceType}:${sourceId}`);
      }
    } catch (error) {
      console.error('[RAG] Delete chunks failed:', error);
    }
  },

  /**
   * 检索
   */
  search: async (query: string, limit: number = 3, sourceType?: string): Promise<RagResult[]> => {
    try {
      const queryEmbedding = await ragService.getEmbedding(query);

      // 检查 vec0 模块是否可用
      try {
        db.prepare('SELECT vec_version()').get();
      } catch (e) {
        console.error('[RAGService] sqlite-vec 扩展未加载，无法进行向量检索');
        return [];
      }

      let sql = `
        SELECT 
          c.content,
          v.distance,
          c.metadata
        FROM content_vec v
        JOIN content_chunks c ON c.id = v.rowid
        WHERE v.embedding MATCH ?
          AND k = ?
      `;

      // 暂不直接在 SQL 中过滤 metadata 字段，而是先取出再过滤，或者依赖 SQLite 的 JSON 查询
      // 如果数据量大，建议在 content_chunks 表相关 JSON 字段建索引，或将 source_type 提为独立列
      // 为简化实现，此处先获取稍多结果，再在内存过滤

      const fetchLimit = sourceType ? limit * 3 : limit;

      const results = db.prepare(sql).all(JSON.stringify(queryEmbedding), fetchLimit) as { content: string, distance: number, metadata: string }[];

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
   * 提升检索结果的准确度
   */
  rerank: async (query: string, results: RagResult[]): Promise<RagResult[]> => {
    const { apiKey, baseURL, modelName } = getAiConfig('rerank');

    // 如果未配置重排序模型，直接返回原结果
    if (!modelName || results.length <= 1) {
      return results;
    }

    try {
      console.log(`[RAG] 正在使用 ${modelName} 进行重排序...`);
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

      if (!response.ok) {
        throw new Error(`Rerank API error: ${response.status}`);
      }

      const data = await response.json();

      // 适配标准的 rerank API 返回格式 (如 Jina, SiliconFlow 等)
      // 通常格式为 { results: [{ index: 0, relevance_score: 0.9 }, ...] }
      if (data.results && Array.isArray(data.results)) {
        const reranked = data.results.map((item: any) => {
          const original = results[item.index];
          return {
            ...original,
            score: item.relevance_score // 使用重排序的分数
          };
        });

        // 按分数排序并返回
        return reranked.sort((a: any, b: any) => b.score - a.score);
      }

      return results;
    } catch (error: any) {
      console.warn('[RAG] Rerank 失败，原因:', error.message);
      return results;
    }
  }
};

/**
 * 辅助函数：搜索与题库相关的内容
 * 用于聊天功能的 RAG 检索
 */
export async function searchSimilarContent(query: string, limit: number = 3) {
  try {
    // 使用questions表直接搜索，而不依赖向量检索（避免向量表未初始化问题）
    const results = db.prepare(`
      SELECT id, content, explanation, tags, dimension
      FROM questions
      WHERE content LIKE ? OR explanation LIKE ? OR tags LIKE ?
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, `%${query}%`, limit) as any[];

    return results;
  } catch (error) {
    console.error('[RAG] searchSimilarContent 失败:', error);
    return [];
  }
}