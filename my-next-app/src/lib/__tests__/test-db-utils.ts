import Database from 'better-sqlite3';
import { createTables } from '../db/schema';

export interface TestDbHelper {
    db: Database.Database;
    close: () => void;
    seedUser: (id: number, username: string) => void;
}

/**
 * 设置并返回一个初始化好的内存数据库
 */
export function setupTestDb(): TestDbHelper {
    const db = new Database(':memory:');
    
    // 初始化全表结构
    createTables(db);

    return {
        db,
        close: () => db.close(),
        seedUser: (id: number, username: string) => {
            db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)')
              .run(id, username, 'test-hash');
        }
    };
}
