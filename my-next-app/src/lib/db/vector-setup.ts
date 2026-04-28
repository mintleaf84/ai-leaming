import { drizzleDb } from './index';
import { sql } from 'drizzle-orm';

const EMBEDDING_DIM = 1536; // OpenAI text-embedding-3-small dimension

/**
 * 初始化 sqlite-vec 向量扩展和向量表 (Drizzle 版本)
 */
export async function setupVectorExtension() {
    const vecTableResult = await drizzleDb.all<any>(sql`
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

    const ragVecTableResult = await drizzleDb.all<any>(sql`
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
}
