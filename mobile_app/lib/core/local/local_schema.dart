import 'package:sqflite/sqflite.dart';

/// 离线库的表结构与迁移。
///
/// 为什么从 [LocalDb] 里抽出来：`LocalDb` 是懒加载单例 + 硬编码文件路径，测试里
/// 既不能换路径也不能重放"老版本库升上来"的过程，而 v1→v2 那次迁移恰恰决定了
/// 老用户的待同步作答会不会被别的账号上传。抽成纯函数后可以用内存库完整重放。
///
/// 这里只负责结构，读写封装在 `LocalPracticeStore` / `SyncService`。
class LocalSchema {
  LocalSchema._();

  /// 当前库版本。改结构时同时改这里和 [upgrade]。
  static const int version = 2;

  /// 建库：全新安装时调用。
  static Future<void> create(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_questions (
        id INTEGER PRIMARY KEY,
        content TEXT NOT NULL,
        options TEXT NOT NULL,
        type TEXT,
        tags TEXT,
        answer TEXT,
        explanation TEXT,
        fetched_at INTEGER NOT NULL
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS local_sessions (
        local_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        question_ids TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        synced_session_id TEXT
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS pending_answers (
        client_key TEXT PRIMARY KEY,
        local_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        question_id INTEGER NOT NULL,
        user_answer TEXT,
        is_correct INTEGER NOT NULL,
        duration_ms INTEGER,
        answered_at INTEGER NOT NULL,
        synced_at INTEGER
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    ''');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_pending_synced ON pending_answers(synced_at)',
    );
  }

  /// 升级：v1 → v2 给待同步数据补 `user_id`。
  ///
  /// 老数据没有归属账号，统一记为 `legacy`：它们不会被任何账号的 flush 取走，
  /// 避免 A 的作答被 B 的凭据上传；确认无用后可由用户重装清除。
  static Future<void> upgrade(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      await db.execute(
        "ALTER TABLE local_sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy'",
      );
      await db.execute(
        "ALTER TABLE pending_answers ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy'",
      );
    }
  }
}
