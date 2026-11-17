import { drizzleDb } from "./index";
import { sql } from "drizzle-orm";
import { log } from "@/lib/logger";

/**
 * 向量表的维度必须与**应用实际使用的 embedding 维度**一致，否则写入会被
 * vec0 以 `Dimension mismatch` 拒绝。这里不写死常量（原先写死 1536，而
 * `getAiConfig()` 默认 1024，两边对不上），改为在初始化时问配置要。
 *
 * 用**动态 import** 而不是顶层 import：`ai/config` 依赖 `@/lib/db`，顶层引入会
 * 与 `db/index → vector-setup` 形成静态环；动态 import 在初始化后调用，安全。
 */
const FALLBACK_EMBEDDING_DIM = 1024;

async function resolveEmbeddingDimensions(): Promise<number> {
  try {
    const { getAiConfig } = await import("@/lib/ai/config");
    const { embeddingDimensions } = await getAiConfig("embedding");
    return embeddingDimensions > 0
      ? embeddingDimensions
      : FALLBACK_EMBEDDING_DIM;
  } catch (error) {
    // audit-allow: 读不到配置不该阻止建表，退回默认维度并在日志里留痕
    log.warn(
      "[DB] 读取 embedding 维度失败，回退到默认值:",
      error instanceof Error ? error.message : String(error),
    );
    return FALLBACK_EMBEDDING_DIM;
  }
}

/**
 * 初始化 sqlite-vec 向量扩展和向量表 (Drizzle 版本)
 * 优雅降级：如果向量扩展不可用，跳过创建向量表，不阻止应用启动
 */
export async function setupVectorExtension(): Promise<boolean> {
  try {
    // 测试向量扩展是否可用
    await drizzleDb.run(sql`SELECT vec_version()`);
  } catch {
    // 向量扩展不可用，跳过向量表创建
    log.warn(
      "[DB] sqlite-vec extension not available, skipping vector table creation",
    );
    return false;
  }

  try {
    const embeddingDim = await resolveEmbeddingDimensions();
    const vecTableResult = await drizzleDb.all<Record<string, unknown>>(sql`
            SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='questions_vec'
        `);
    const vecTableExists = vecTableResult[0]?.count as number;

    if (!vecTableExists) {
      log.info("[DB] Creating questions_vec vector table...");
      await drizzleDb.run(sql`
          CREATE VIRTUAL TABLE questions_vec USING vec0(
            question_id INTEGER PRIMARY KEY,
            embedding float[${embeddingDim}]
          );
        `);
    }

    const ragVecTableResult = await drizzleDb.all<Record<string, unknown>>(sql`
            SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='rag_chunks_vec'
        `);
    const ragVecTableExists = ragVecTableResult[0]?.count as number;

    if (!ragVecTableExists) {
      log.info("[DB] Creating rag_chunks_vec vector table...");
      await drizzleDb.run(sql`
          CREATE VIRTUAL TABLE rag_chunks_vec USING vec0(
            chunk_id INTEGER PRIMARY KEY,
            embedding float[${embeddingDim}]
          );
        `);
    }
    return true;
  } catch (e) {
    log.warn("[DB] Failed to create vector tables:", e);
    return false;
  }
}
