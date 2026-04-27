import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'path';
import { fileURLToPath } from 'url';
import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createClient } from '@libsql/client';
import * as schema from './drizzle-schema';
import { runMigrations as runOldMigrations } from './migrations';
import { setupVectorExtension } from './vector-setup';
import { seedData } from './seed-data';

// --- Legacy Better-SQLite3 Initialization (from old db.ts) ---

const globalForDb = global as unknown as { db: Database.Database | null };

function initDb() {
  if (globalForDb.db) return globalForDb.db;

  const dbName = process.env.DB_FILENAME || 'ai-learning.db';
  const dbPath = path.resolve(process.cwd(), 'data', dbName);
  console.log(`[DB] 正在连接数据库: ${dbPath}`);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('cache_size = -20000');
  db.pragma('temp_store = MEMORY');
  db.pragma('synchronous = NORMAL');

  try {
    let loadablePath;
    try {
      loadablePath = sqliteVec.getLoadablePath();
    } catch (_e) {
      console.warn('[DB] sqliteVec.getLoadablePath() failed, attempting fallback...');
    }

    if (!loadablePath) {
      const platform = process.platform;
      const arch = process.arch;
      let binaryName = 'vec0.so';
      let packageName = 'sqlite-vec-linux-x64';

      if (platform === 'win32') {
        binaryName = 'vec0.dll';
        packageName = arch === 'x64' ? 'sqlite-vec-windows-x64' : `sqlite-vec-win32-${arch}`;
      } else if (platform === 'darwin') {
        binaryName = 'vec0.dylib';
        packageName = `sqlite-vec-darwin-${arch}`;
      }
      loadablePath = path.resolve(process.cwd(), 'node_modules', packageName, binaryName);
    }

    if (loadablePath && typeof loadablePath !== 'string') {
      try {
        loadablePath = fileURLToPath(loadablePath as unknown as URL);
      } catch (_e) {
        loadablePath = String(loadablePath).replace(/^file:\/\/\/?/, '');
      }
    }

    console.log(`[DB] 正在加载向量扩展: ${loadablePath}`);
    db.loadExtension(loadablePath);

    const version = db.prepare('SELECT vec_version() as version').get() as { version: string };
    console.log(`✅ sqlite-vec 扩展加载成功, 版本: ${version.version}`);
  } catch (err) {
    console.error('⚠️ 向量扩展加载失败，将无法使用 AI 检索功能:', err);
  }

  return db;
}

export function getLegacyDb(): Database.Database {
  if (globalForDb.db) return globalForDb.db;
  globalForDb.db = initDb();
  return globalForDb.db!;
}

/** @deprecated 请优先使用 drizzleDb 或默认导出的 drizzleDb 实例 */
export const db = globalForDb.db || (typeof window === 'undefined' ? null : undefined);
// 注意：这里不再自动初始化，由调用方通过 getLegacyDb() 获取或在 initDatabase 后使用

export function closeDb() {
  if (globalForDb.db) {
    console.log('[DB] Closing database connection...');
    globalForDb.db.close();
    globalForDb.db = null;
  }
}

export function reinitDb() {
    closeDb();
    globalForDb.db = initDb();
    return globalForDb.db;
}

// --- Drizzle ORM Initialization ---

const libsqlDbName = process.env.DB_FILENAME || 'ai-learning.db';
const libsqlDbPath = path.resolve(process.cwd(), 'data', libsqlDbName);
const libsqUrl = `file:${libsqlDbPath}`;

const globalForLibsql = global as unknown as { 
    libsqlClient: ReturnType<typeof createClient> | null;
    drizzleDb: LibSQLDatabase<typeof schema> | null;
};

if (!globalForLibsql.libsqlClient) {
    globalForLibsql.libsqlClient = createClient({ url: libsqUrl });
}
if (!globalForLibsql.drizzleDb) {
    globalForLibsql.drizzleDb = drizzle(globalForLibsql.libsqlClient, { schema });
}

export const drizzleDb = globalForLibsql.drizzleDb!;

// 防止在单个进程内重复初始化
let isInitialized = false;

/**
 * 初始化数据库
 */
export async function initDatabase() {
    // 检查是否已经初始化
    if (isInitialized) {
        return;
    }

    isInitialized = true;
    console.log('[DB] Starting database initialization...');

    try {
        // 1. 运行 Drizzle 自动化迁移 (包含 IF NOT EXISTS 补强)
        console.log('[DB] Running Drizzle migrations...');
        // 设置忙碌超时时间，防止并发写入导致 SQLITE_BUSY
        await globalForLibsql.libsqlClient?.execute('PRAGMA busy_timeout = 5000;');
        
        await migrate(drizzleDb, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });
        console.log('[DB] Drizzle migrations completed');

        // 2. 运行旧版迁移作为存量数据库兜底（幂等，可安全重复执行）
        //    确保旧数据库中缺失的字段/索引/表能够补全
        console.log('[DB] Running legacy migrations for backward compatibility...');
        runOldMigrations(getLegacyDb());
        console.log('[DB] Legacy migrations completed');

        // 3. 补全向量扩展和种子数据
        setupVectorExtension(getLegacyDb());
        seedData(getLegacyDb());
        console.log('[DB] Database initialization completed');
    } catch (error: any) {
        console.error('[DB] Database initialization failed:', error.message);
        if (error.cause) {
            console.error('[DB] Detailed Cause:', error.cause);
        }
        // 在所有环境下都抛出错误，确保迁移失败时能及时发现
        throw error;
    }
}

// --- Exports ---

export default db; // 默认导出 legacyDb 以兼容旧代码
export { runOldMigrations as runMigrations };
export { setupVectorExtension } from './vector-setup';
export { seedData } from './seed-data';
export { addColumnIfNotExists, getSetting, setSetting } from './utils';
export * as drizzleSchema from './drizzle-schema';

if (require.main === module) {
    initDatabase();
}
