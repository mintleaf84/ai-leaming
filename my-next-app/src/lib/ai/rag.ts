import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getErrorMessage } from "@/lib/utils/error";
import { getAiConfig } from "./client";
import { drizzleDb, drizzleSchema, getLegacyDb } from "@/lib/db";
import { eq, sql, desc, and, like, or } from "drizzle-orm";
import { env } from "@/env";

// 内存 LRU 缓存（进程级，避免同进程重复查询 DB）
const EMBED_CACHE_MAX = 2000;
const embeddingMemCache = new Map<string, number[]>();

function cacheKey(text: string): string {
  // 简单 hash，避免存整段文本作 key
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return `e_${h}_${text.length}`;
}

function memCacheGet(text: string): number[] | undefined {
  return embeddingMemCache.get(cacheKey(text));
}

function memCacheSet(text: string, vec: number[]) {
  if (embeddingMemCache.size >= EMBED_CACHE_MAX) {
    const first = embeddingMemCache.keys().next().value;
    if (first) embeddingMemCache.delete(first);
  }
  embeddingMemCache.set(cacheKey(text), vec);
}

/**
 * 从 SQLite embedding_cache 表读取缓存
 */
async function dbCacheGet(textHash: string): Promise<number[] | null> {
  try {
    const row = await drizzleDb.get<{ embedding: string }>(
      sql`SELECT embedding FROM embedding_cache WHERE text_hash = ${textHash}`,
    );
    if (row?.embedding) {
      return JSON.parse(row.embedding) as number[];
    }
  } catch {
    /* table may not exist yet */
  }
  return null;
}

/**
 * 写入 SQLite embedding_cache 表
 */
async function dbCacheSet(
  textHash: string,
  text: string,
  vec: number[],
): Promise<void> {
  try {
    await drizzleDb.run(
      sql`INSERT OR REPLACE INTO embedding_cache (text_hash, text_preview, embedding, created_at)
          VALUES (${textHash}, ${text.slice(0, 200)}, ${JSON.stringify(vec)}, CURRENT_TIMESTAMP)`,
    );
  } catch {
    /* table may not exist yet */
  }
}

export interface RagResult {
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export const ragService = {
  /**
   * 获取文本向量 (使用标准 SDK，带多级缓存)
   */
  getEmbedding: async (text: string): Promise<number[]> => {
    if (env.E2E_TEST === "true") {
      const { embeddingDimensions } = await getAiConfig();
      return new Array(embeddingDimensions || 1024)
        .fill(0)
        .map((_, i) => Math.sin(i));
    }

    // 1. 内存缓存
    const memHit = memCacheGet(text);
    if (memHit) return memHit;

    // 2. SQLite 缓存
    const hash = cacheKey(text);
    const dbHit = await dbCacheGet(hash);
    if (dbHit) {
      memCacheSet(text, dbHit);
      return dbHit;
    }

    // 3. 调 API
    const { apiKey, baseURL, modelName } = await getAiConfig("embedding");

    try {
      const openai = createOpenAI({ apiKey, baseURL });
      const { embedding } = await embed({
        model: openai.embedding(modelName || "text-embedding-3-small"),
        value: text,
      });
      // 写入双级缓存
      memCacheSet(text, embedding);
      await dbCacheSet(hash, text, embedding);
      return embedding;
    } catch (error: unknown) {
      console.warn("[RAG] Embedding 失败，原因:", getErrorMessage(error));
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
   * 批量获取向量（带缓存，使用 embedMany 减少 API 调用）
   */
  getEmbeddings: async (texts: string[]): Promise<number[][]> => {
    if (env.E2E_TEST === "true") {
      const { embeddingDimensions } = await getAiConfig();
      return texts.map(() =>
        new Array(embeddingDimensions || 1024)
          .fill(0)
          .map((_, i) => Math.sin(i)),
      );
    }

    const results: number[][] = new Array(texts.length);
    const uncachedIndices: number[] = [];

    // 1. 检查缓存
    for (let i = 0; i < texts.length; i++) {
      const memHit = memCacheGet(texts[i]);
      if (memHit) {
        results[i] = memHit;
        continue;
      }
      const hash = cacheKey(texts[i]);
      const dbHit = await dbCacheGet(hash);
      if (dbHit) {
        memCacheSet(texts[i], dbHit);
        results[i] = dbHit;
        continue;
      }
      uncachedIndices.push(i);
    }

    // 2. 全部命中缓存
    if (uncachedIndices.length === 0) return results;

    // 3. 批量调 API
    const uncachedTexts = uncachedIndices.map((i) => texts[i]);
    const { apiKey, baseURL, modelName } = await getAiConfig("embedding");

    try {
      const openai = createOpenAI({ apiKey, baseURL });
      const { embeddings } = await embedMany({
        model: openai.embedding(modelName || "text-embedding-3-small"),
        values: uncachedTexts,
      });

      // 写入缓存
      for (let j = 0; j < uncachedIndices.length; j++) {
        const idx = uncachedIndices[j];
        const vec = embeddings[j];
        results[idx] = vec;
        memCacheSet(texts[idx], vec);
        await dbCacheSet(cacheKey(texts[idx]), texts[idx], vec);
      }
    } catch (error: unknown) {
      console.error("[RAG] embedMany 失败，逐条回退:", getErrorMessage(error));
      // 回退到逐条调用
      try {
        for (const idx of uncachedIndices) {
          results[idx] = await ragService.getEmbedding(texts[idx]);
        }
      } catch (fallbackErr) {
        console.error("[RAG] 逐条回退也失败:", fallbackErr);
      }
    }

    return results;
  },

  /**
   * 初始化 RAG 表（包括 embedding 缓存表）
   * 注意：向量表使用 better-sqlite3 实例（vec0 扩展仅在该连接上加载）
   */
  initRagTable: async () => {
    const { embeddingDimensions } = await getAiConfig();
    const dim = embeddingDimensions || 1024;

    // content_chunks 和 embedding_cache 使用 drizzleDb（普通表）
    await drizzleDb.run(sql`
      CREATE TABLE IF NOT EXISTS content_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        metadata TEXT
      );
    `);

    await drizzleDb.run(sql`
      CREATE TABLE IF NOT EXISTS embedding_cache (
        text_hash TEXT PRIMARY KEY,
        text_preview TEXT,
        embedding TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // content_vec 使用 better-sqlite3（vec0 扩展仅在该连接可用）
    const legacyDb = getLegacyDb();
    try {
      legacyDb.prepare("SELECT vec_version()").get();
    } catch {
      console.error("[RAG] sqlite-vec 扩展未加载，无法创建向量表");
      return;
    }

    const vecTable = legacyDb
      .prepare(
        "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='content_vec'",
      )
      .get() as { count: number };

    if (!vecTable.count) {
      legacyDb.exec(
        `CREATE VIRTUAL TABLE content_vec USING vec0(embedding float[${dim}])`,
      );
      console.log(`[RAG] Created content_vec table with dimensions: ${dim}`);
    }
  },

  /**
   * 添加知识块
   * 向量表操作使用 better-sqlite3（vec0 扩展仅在该连接上加载）
   */
  addChunk: async (content: string, metadata: Record<string, unknown> = {}) => {
    const embedding = await ragService.getEmbedding(content);
    const legacyDb = getLegacyDb();

    // 向量表 insert (使用 better-sqlite3)
    const infoVec = legacyDb
      .prepare("INSERT INTO content_vec(embedding) VALUES (?)")
      .run(JSON.stringify(embedding));
    const vecRowid = infoVec.lastInsertRowid;

    // 基础表 insert (使用 drizzleDb)
    await drizzleDb.run(
      sql`INSERT INTO content_chunks (id, content, metadata) VALUES (${Number(vecRowid)}, ${content}, ${JSON.stringify(metadata)})`,
    );
  },

  /**
   * 批量添加知识块（使用 embedMany，大幅减少 API 调用）
   */
  addChunksBatch: async (
    items: Array<{ content: string; metadata: Record<string, unknown> }>,
    batchSize: number = 50,
  ) => {
    const legacyDb = getLegacyDb();
    const vecInsert = legacyDb.prepare(
      "INSERT INTO content_vec(embedding) VALUES (?)",
    );
    let successCount = 0;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const texts = batch.map((item) => item.content || "");

      try {
        const embeddings = await ragService.getEmbeddings(texts);

        for (let j = 0; j < batch.length; j++) {
          const vec = embeddings[j];
          if (!vec) {
            if (j === 0)
              console.warn(
                `[RAG] Batch ${i / batchSize + 1}: embeddings[${j}] is falsy, type=${typeof vec}`,
              );
            continue;
          }
          try {
            const infoVec = vecInsert.run(JSON.stringify(vec));
            const vecRowid = infoVec.lastInsertRowid;
            await drizzleDb.run(
              sql`INSERT INTO content_chunks (id, content, metadata) VALUES (${Number(vecRowid)}, ${batch[j].content || ""}, ${JSON.stringify(batch[j].metadata)})`,
            );
            successCount++;
          } catch (itemErr) {
            if (successCount === 0 && j === 0)
              console.error("[RAG] addChunksBatch item error:", itemErr);
          }
        }
      } catch (err) {
        console.warn(
          `[RAG] Batch ${i / batchSize + 1} failed (getEmbeddings or INSERT), falling back to single:`,
          err,
        );
        for (const item of batch) {
          try {
            await ragService.addChunk(item.content || "", item.metadata);
            successCount++;
          } catch (singleErr) {
            if (successCount === 0)
              console.error("[RAG] Single addChunk also failed:", singleErr);
          }
        }
      }
    }
    return successCount;
  },

  /**
   * 删除指定来源的知识块
   */
  deleteChunksBySource: async (sourceType: string, sourceId: number) => {
    try {
      // 找到匹配的 ID
      const chunks = await drizzleDb.all<Record<string, unknown>>(sql`
        SELECT id FROM content_chunks
        WHERE json_extract(metadata, '$.source_type') = ${sourceType}
        AND json_extract(metadata, '$.source_id') = ${sourceId}
      `);

      if (chunks.length > 0) {
        const ids = chunks.map((c) => c.id as number);

        // 删除基础表 (drizzleDb)
        await drizzleDb.run(
          sql`DELETE FROM content_chunks WHERE id IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );
        // 删除向量表 (better-sqlite3，vec0 扩展)
        const legacyDb = getLegacyDb();
        const placeholders = ids.map(() => "?").join(",");
        legacyDb
          .prepare(`DELETE FROM content_vec WHERE rowid IN (${placeholders})`)
          .run(...ids);

        console.log(
          `[RAG] Deleted ${chunks.length} chunks for ${sourceType}:${sourceId}`,
        );
      }
    } catch (error) {
      console.error("[RAG] Delete chunks failed:", error);
    }
  },

  /**
   * 向量检索
   * 使用 better-sqlite3 实例（vec0 扩展仅在该连接上加载）
   */
  search: async (
    query: string,
    limit: number = 3,
    sourceType?: string,
  ): Promise<RagResult[]> => {
    try {
      const queryEmbedding = await ragService.getEmbedding(query);
      const legacyDb = getLegacyDb();

      // 检查 vec0 模块
      try {
        legacyDb.prepare("SELECT vec_version()").get();
      } catch (_e) {
        console.error("[RAGService] sqlite-vec 扩展未加载，无法进行向量检索");
        return [];
      }

      const fetchLimit = sourceType ? limit * 3 : limit;

      const results = legacyDb
        .prepare(
          `
        SELECT
          c.content,
          v.distance,
          c.metadata
        FROM content_vec v
        JOIN content_chunks c ON c.id = v.rowid
        WHERE v.embedding MATCH ?
          AND k = ?
      `,
        )
        .all(JSON.stringify(queryEmbedding), fetchLimit) as Record<
        string,
        unknown
      >[];

      let filtered = results;
      if (sourceType) {
        filtered = results.filter((r) => {
          try {
            const meta = JSON.parse((r.metadata as string) || "{}");
            return meta.source_type === sourceType;
          } catch {
            return false;
          }
        });
      }

      return filtered.slice(0, limit).map((r) => ({
        content: r.content as string,
        score: 1 - (r.distance as number),
        metadata: JSON.parse((r.metadata as string) || "{}"),
      }));
    } catch (e) {
      console.error("[RAG] Vector Search Error:", e);
      return [];
    }
  },

  /**
   * 重排序 (Rerank)
   */
  rerank: async (query: string, results: RagResult[]): Promise<RagResult[]> => {
    if (process.env.E2E_TEST === "true") return results;

    const { apiKey, baseURL, modelName } = await getAiConfig("rerank");
    if (!modelName || results.length <= 1) return results;

    try {
      const response = await fetch(`${baseURL}/rerank`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          query: query,
          documents: results.map((r) => r.content),
          top_n: results.length,
        }),
      });

      if (!response.ok) throw new Error(`Rerank API error: ${response.status}`);
      const data = await response.json();

      if (data.results && Array.isArray(data.results)) {
        const reranked = data.results.map(
          (item: { index: number; relevance_score: number }) => ({
            ...results[item.index],
            score: item.relevance_score,
          }),
        );
        return reranked.sort((a: RagResult, b: RagResult) => b.score - a.score);
      }
      return results;
    } catch (error: unknown) {
      console.warn("[RAG] Rerank 失败，原因:", getErrorMessage(error));
      return results;
    }
  },
};

/**
 * 辅助函数：搜索与题库相关的内容 (用于聊天功能的 RAG 检索)
 */
export async function searchSimilarContent(query: string, limit: number = 3) {
  try {
    const results = await drizzleDb
      .select({
        id: drizzleSchema.questions.id,
        content: drizzleSchema.questions.content,
        explanation: drizzleSchema.questions.explanation,
        tags: drizzleSchema.questions.tags,
        dimension: drizzleSchema.questions.dimension,
      })
      .from(drizzleSchema.questions)
      .where(
        or(
          like(drizzleSchema.questions.content, `%${query}%`),
          like(drizzleSchema.questions.explanation, `%${query}%`),
          like(drizzleSchema.questions.tags, `%${query}%`),
        ),
      )
      .limit(limit)
      .all();

    return results;
  } catch (error) {
    console.error("[RAG] searchSimilarContent 失败:", error);
    return [];
  }
}
