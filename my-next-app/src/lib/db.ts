import 'server-only';

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'path';
import { fileURLToPath } from 'url';

// 使用全局变量防止热重载时重复初始化导致的 Panic
const globalForDb = global as unknown as { db: Database.Database | null };

function initDb() {
  if (globalForDb.db) return globalForDb.db;

  const dbName = process.env.DB_FILENAME || 'ai-learning.db';
  const dbPath = path.resolve(process.cwd(), 'data', dbName);
  console.log(`[DB] 正在连接数据库: ${dbPath}`);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  try {
    // 显式加载向量扩展
    let loadablePath;
    try {
      loadablePath = sqliteVec.getLoadablePath();
    } catch (e) {
      console.warn('[DB] sqliteVec.getLoadablePath() failed, attempting fallback...');
    }

    // Fallback if initial load failed or returned invalid path
    if (!loadablePath) {
      const platform = process.platform;
      const arch = process.arch;

      let binaryName = 'vec0.so';
      let packageName = 'sqlite-vec-linux-x64';

      if (platform === 'win32') {
        binaryName = 'vec0.dll';
        packageName = `sqlite-vec-win32-${arch}`; // e.g. sqlite-vec-win32-x64, but actual package might be sqlite-vec-windows-x64
        // Correction based on file search: sqlite-vec-windows-x64
        if (arch === 'x64') packageName = 'sqlite-vec-windows-x64';
      } else if (platform === 'darwin') {
        binaryName = 'vec0.dylib';
        packageName = `sqlite-vec-darwin-${arch}`;
      }

      // Try to find it in node_modules relative to current working directory
      loadablePath = path.resolve(process.cwd(), 'node_modules', packageName, binaryName);
    }

    // 修复 Windows 下可能返回 URL 对象导致的问题
    if (loadablePath && typeof loadablePath !== 'string') {
      try {
        loadablePath = fileURLToPath(loadablePath);
      } catch (e) {
        loadablePath = String(loadablePath).replace(/^file:\/\/\/?/, '');
      }
    }

    console.log(`[DB] 正在加载向量扩展: ${loadablePath}`);
    db.loadExtension(loadablePath);

    // 验证扩展是否加载成功
    const version = db.prepare('SELECT vec_version() as version').get() as { version: string };
    console.log(`✅ sqlite-vec 扩展加载成功, 版本: ${version.version}`);
  } catch (err) {
    console.error('⚠️ 向量扩展加载失败，将无法使用 AI 检索功能:', err);
    // 打印更详细的错误信息
    if (err instanceof Error) {
      console.error(`错误详情: ${err.message}`);
    }
  }

  return db;
}

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

const db = globalForDb.db || initDb();
globalForDb.db = db;

export default db;
