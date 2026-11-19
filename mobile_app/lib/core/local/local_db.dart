import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import 'local_schema.dart';

/// 离线刷题本地 SQLite 单例。
///
/// 只负责打开连接；表结构与迁移在 [LocalSchema]，读写封装在
/// LocalPracticeStore / SyncService。
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
      version: LocalSchema.version,
      onCreate: (db, _) => LocalSchema.create(db),
      onUpgrade: LocalSchema.upgrade,
    );
    _database = db;
    return db;
  }
}
