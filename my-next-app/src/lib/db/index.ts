import db from '../db';
import { createTables } from './schema';
import { runMigrations } from './migrations';
import { setupVectorExtension } from './vector-setup';
import { seedData } from './seed-data';

/**
 * 初始化数据库
 */
export function initDatabase() {
    console.log('[DB] Starting database initialization...');

    try {
        createTables(db);
        runMigrations(db);
        setupVectorExtension(db);
        seedData(db);
        console.log('[DB] Database initialization completed');
    } catch (error) {
        console.error('[DB] Database initialization failed:', error);
        throw error;
    }
}

// 导出
export { createTables, EMBEDDING_DIM } from './schema';
export { runMigrations } from './migrations';
export { setupVectorExtension } from './vector-setup';
export { seedData } from './seed-data';
export { addColumnIfNotExists, getSetting, setSetting } from './utils';

if (require.main === module) {
    initDatabase();
}
