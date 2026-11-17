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
      version: 1,
      onCreate: _onCreate,
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
}
