import { drizzleDb } from './index';
import { sql } from 'drizzle-orm';

const EMBEDDING_DIM = 1536; // OpenAI text-embedding-3-small dimension

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
        console.warn('[DB] sqlite-vec extension not available, skipping vector table creation');
        return false;
    }

    try {
        const vecTableResult = await drizzleDb.all<Record<string, unknown>>(sql`
            SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='questions_vec'
        `);
        const vecTableExists = vecTableResult[0]?.count as number;

        if (!vecTableExists) {
            console.log('[DB] Creating questions_vec vector table...');
            await drizzleDb.run(sql`
          CREATE VIRTUAL TABLE questions_vec USING vec0(
            question_id INTEGER PRIMARY KEY,
            embedding float[${EMBEDDING_DIM}]
          );
        `);
        }

        const ragVecTableResult = await drizzleDb.all<Record<string, unknown>>(sql`
            SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='rag_chunks_vec'
        `);
        const ragVecTableExists = ragVecTableResult[0]?.count as number;

        if (!ragVecTableExists) {
            console.log('[DB] Creating rag_chunks_vec vector table...');
            await drizzleDb.run(sql`
          CREATE VIRTUAL TABLE rag_chunks_vec USING vec0(
            chunk_id INTEGER PRIMARY KEY,
            embedding float[${EMBEDDING_DIM}]
          );
        `);
        }
        return true;
    } catch (e) {
        console.warn('[DB] Failed to create vector tables:', e);
        return false;
    }
}
