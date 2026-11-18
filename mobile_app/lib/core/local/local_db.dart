import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// 离线刷题本地 SQLite 单例。
///
/// 只负责建库建表；表结构的读写封装在 LocalPracticeStore / SyncService。
class LocalDb {
  LocalDb._();

  static final LocalDb instance = LocalDb._();

  static const String _fileName = 'ai_learning_offline.db';

  Database? _database;

  /// 懒加载单例：首次访问打开数据库，之后复用同一连接。
  Future<Database> get database async {
    final existing = _database;
    if (existing != null) {
      return existing;
    }
    final dirPath = await getDatabasesPath();
    final db = await openDatabase(
      p.join(dirPath, _fileName),
      version: 2,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
    _database = db;
    return db;
  }

  Future<void> _onCreate(Database db, int version) async {
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

  /// v1 → v2：给待同步数据补 user_id。
  ///
  /// 老数据没有归属账号，统一记为 legacy：它们不会被任何账号的 flush 取走，
  /// 避免 A 的作答被 B 的凭据上传；确认无用后可由用户重装清除。
  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
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
