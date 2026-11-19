/// 离线库测试基建：用 `sqflite_common_ffi` 把生产 SQLite 换成内存/临时文件库。
///
/// 守的是这几条线：
/// 1. **不碰 `LocalDb` 单例**。`LocalDb` 是懒加载单例 + 硬编码
///    `getDatabasesPath()`，测试里既换不了路径、也没法重放「v1 老库升上来」；
///    而 v1→v2 迁移恰好决定老用户的待同步作答会不会被别的账号上传。
///    所以这里只复刻它的**参数**（`LocalSchema.version` / `create` / `upgrade`），
///    单例本身在报告里说明为「不可测」。
/// 2. **表结构必须由 `LocalSchema` 自己建**，不在测试里抄一份 DDL：抄一份就等于
///    测了个假库，生产建表语句改坏了测试还是绿的。
/// 3. **v1 老结构必须手写**（[openV1MemoryDb]）：v1 的 DDL 已经不在代码里，
///    只能按迁移前的样子重放，才能验证 `upgrade` 真的补上了 `user_id`。
///
/// 另外钉住本机环境的两个坑（都不影响生产代码，只影响这里怎么把库打开）：
/// - `sqflite_common_ffi` 锁在 `2.3.7+1`：2.4.x 起 `package:sqlite3` 改用 Dart
///   build hooks 下载官方预编译 `libsqlite3.so`，那个二进制要求 GLIBC_2.33，
///   本机是 CentOS 7（glibc 2.17），加载直接失败；2.3.x 走系统库，没有这个问题。
/// - 用 `databaseFactoryFfiNoIsolate` 而不是 `databaseFactoryFfi`：
///   `sqlite3` 的 `open.overrideFor` 只作用于当前 isolate，sqflite 的 isolate
///   版本会另起一个 isolate 重新 `dlopen`，override 丢失。
library;

import 'dart:ffi';
import 'dart:io';

import 'package:mobile_app/core/local/local_schema.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
// `sqlite3` 是 `sqflite_common_ffi` 的传递依赖，这里只借用它的平台加载钩子
// 指到系统的 libsqlite3（见下方 [_openSystemSqlite]），不需要单独声明依赖。
// ignore: depend_on_referenced_packages
import 'package:sqlite3/open.dart' as sqlite_open;

/// 在每个测试文件的 `setUpAll` 里调用一次：把 `databaseFactory` 换成 FFI 实现。
///
/// 必须在任何 `openDatabase` 之前执行，否则会走 sqflite 的平台通道（测试里没有
/// 插件注册，直接 MissingPluginException）。
void setUpFfiDatabaseFactory() {
  if (Platform.isLinux) {
    sqlite_open.open.overrideFor(
      sqlite_open.OperatingSystem.linux,
      _openSystemSqlite,
    );
  }
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfiNoIsolate;
}

/// 打开系统 SQLite。
///
/// `package:sqlite3` 默认 `dlopen('libsqlite3.so')`，那只是开发包里的软链；
/// 本机只装了运行时的 `libsqlite3.so.0`。先试 `.so.0` 再退回 `.so`，
/// 让「只装运行时」和「装了 -dev」两种机器都能跑。
DynamicLibrary _openSystemSqlite() {
  for (final name in const <String>['libsqlite3.so.0', 'libsqlite3.so']) {
    try {
      return DynamicLibrary.open(name);
    } on ArgumentError {
      continue;
    }
  }
  throw StateError('找不到系统 libsqlite3（试过 libsqlite3.so.0 与 libsqlite3.so）');
}

/// 打开一个全新的内存库，按**当前**版本建表。
///
/// 每次调用都是一个独立的 `:memory:` 连接，用例之间互不干扰，也不用手工清理。
Future<Database> openMemoryDb() {
  return databaseFactory.openDatabase(
    inMemoryDatabasePath,
    options: OpenDatabaseOptions(
      version: LocalSchema.version,
      onCreate: (db, _) => LocalSchema.create(db),
      onUpgrade: LocalSchema.upgrade,
    ),
  );
}

/// v1 的建表语句（迁移前的老结构）。
///
/// 与 v2 的唯一差别：`local_sessions` 与 `pending_answers` 都**没有** `user_id`。
/// 这正是迁移要解决的问题——老数据没有归属账号。
Future<void> _createV1Schema(Database db) async {
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

/// 打开一个**版本 1** 的内存库，用于重放 v1 → v2 迁移。
///
/// 内存库关掉就没了，没法「关掉再以 v2 打开」，所以调用方需要自己调
/// `LocalSchema.upgrade(db, 1, 2)` 触发迁移；真实 `openDatabase` 触发路径由
/// `local_schema_test.dart` 里的临时文件用例覆盖。
Future<Database> openV1MemoryDb() {
  return databaseFactory.openDatabase(
    inMemoryDatabasePath,
    options: OpenDatabaseOptions(
      version: 1,
      onCreate: (db, _) => _createV1Schema(db),
    ),
  );
}

/// 用临时**文件**库完整走一遍生产升级路径：v1 建库 → 关库 → 以 v2 打开。
///
/// 复刻的是 `LocalDb.database` 的 `openDatabase(..., version, onCreate, onUpgrade)`
/// 参数。返回升级后的连接，调用方负责 `close()` 并删除 [directory]。
Future<({Database db, Directory directory})> openUpgradedV1FileDb() async {
  final directory = await Directory.systemTemp.createTemp(
    'offline_db_upgrade_',
  );
  final path = '${directory.path}/offline.db';

  final v1 = await databaseFactory.openDatabase(
    path,
    options: OpenDatabaseOptions(
      version: 1,
      onCreate: (db, _) => _createV1Schema(db),
    ),
  );
  await v1.close();

  final upgraded = await databaseFactory.openDatabase(
    path,
    options: OpenDatabaseOptions(
      version: LocalSchema.version,
      onCreate: (db, _) => LocalSchema.create(db),
      onUpgrade: LocalSchema.upgrade,
    ),
  );
  return (db: upgraded, directory: directory);
}

/// 读表的列名集合（用于断言迁移前后结构）。
Future<Set<String>> columnNames(Database db, String table) async {
  final rows = await db.rawQuery('PRAGMA table_info($table)');
  return rows.map((row) => row['name'] as String).toSet();
}
