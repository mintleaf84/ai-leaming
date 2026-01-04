import Database from 'better-sqlite3';
import { EMBEDDING_DIM } from './schema';

/**
 * 初始化 sqlite-vec 向量扩展和向量表
 */
export function setupVectorExtension(db: Database.Database) {
    const vecTableExists = db.prepare(
        "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='questions_vec'"
    ).get() as { count: number };

    if (!vecTableExists.count) {
        console.log('[DB] Creating questions_vec vector table...');
        db.exec(`
      CREATE VIRTUAL TABLE questions_vec USING vec0(
        question_id INTEGER PRIMARY KEY,
        embedding float[${EMBEDDING_DIM}]
      );
    `);
    }

    const ragVecTableExists = db.prepare(
        "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='rag_chunks_vec'"
    ).get() as { count: number };

    if (!ragVecTableExists.count) {
        console.log('[DB] Creating rag_chunks_vec vector table...');
        db.exec(`
      CREATE VIRTUAL TABLE rag_chunks_vec USING vec0(
        chunk_id INTEGER PRIMARY KEY,
        embedding float[${EMBEDDING_DIM}]
      );
    `);
    }
}
