import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/local/local_schema.dart';

import '../../support/ffi_db.dart';

/// 守的是「老数据不会被任何账号上传」这条线。
///
/// 具体钉住三件事：
/// 1. 全新安装时 4 张表和 `pending_answers(synced_at)` 索引都必须建出来——
///    `pendingCount()` 与 `markAnswersSynced()` 都依赖这个索引，缺了不会报错，
///    只会随数据量变慢（线上表现为「同步越用越卡」，很难归因）；
/// 2. `create()` 必须幂等：`LocalDb` 是懒加载单例，一旦初始化路径走重了
///    （热重启、测试里重复调用），建表语句不能炸；
/// 3. **v1 → v2 迁移把老 `pending_answers` / `local_sessions` 的 `user_id`
///    全部补成 `legacy`**。这是「A 的老作答不会被 B 的凭据上传」的唯一保障：
///    `pendingSessions(userId: ...)` 按 `user_id` 精确过滤，只要老数据是
///    `legacy`，任何真实用户都取不到它。
void main() {
  setUpAll(setUpFfiDatabaseFactory);

  test('create 后 4 张表与 pending_answers(synced_at) 索引都存在', () async {
    final db = await openMemoryDb();
    addTearDown(db.close);

    final tables = await db.rawQuery(
      'SELECT name FROM sqlite_master WHERE type = \'table\'',
    );
    final names = tables.map((row) => row['name'] as String).toSet();
    expect(
      names,
      containsAll(<String>[
        'cached_questions',
        'local_sessions',
        'pending_answers',
        'sync_meta',
      ]),
    );

    final indexes = await db.rawQuery(
      'SELECT name FROM sqlite_master '
      'WHERE type = \'index\' AND tbl_name = \'pending_answers\'',
    );
    expect(
      indexes.map((row) => row['name'] as String),
      contains('idx_pending_synced'),
    );
  });

  test('create 幂等：连跑两次不抛，表数量不变', () async {
    final db = await openMemoryDb();
    addTearDown(db.close);

    final before = await db.rawQuery(
      'SELECT name FROM sqlite_master WHERE type = \'table\'',
    );
    await LocalSchema.create(db);
    final after = await db.rawQuery(
      'SELECT name FROM sqlite_master WHERE type = \'table\'',
    );

    expect(after.length, before.length);
    expect(await columnNames(db, 'pending_answers'), contains('user_id'));
  });

  test(
    'v1 → v2：老 pending_answers 与 local_sessions 的 user_id 都补成 legacy',
    () async {
      final db = await openV1MemoryDb();
      addTearDown(db.close);

      // 迁移前：老结构确实没有 user_id（否则下面的断言就是空转）。
      expect(
        await columnNames(db, 'pending_answers'),
        isNot(contains('user_id')),
      );
      expect(
        await columnNames(db, 'local_sessions'),
        isNot(contains('user_id')),
      );

      await db.insert('local_sessions', <String, Object?>{
        'local_id': 'local_old',
        'mode': 'random',
        'question_ids': '["1"]',
        'started_at': 1,
      });
      await db.insert('pending_answers', <String, Object?>{
        'client_key': 'local_old:1',
        'local_id': 'local_old',
        'question_id': 1,
        'user_answer': 'A',
        'is_correct': 1,
        'duration_ms': 1200,
        'answered_at': 1,
        'synced_at': null,
      });

      await LocalSchema.upgrade(db, 1, 2);

      final answerRows = await db.query('pending_answers');
      expect(answerRows.single['user_id'], 'legacy');
      final sessionRows = await db.query('local_sessions');
      expect(sessionRows.single['user_id'], 'legacy');

      // 老作答在 legacy 名下，任何真实用户都查不到——这就是「不会被串账号上传」。
      final asRealUser = await db.query(
        'pending_answers',
        where: 'synced_at IS NULL AND user_id = ?',
        whereArgs: <Object?>['42'],
      );
      expect(asRealUser, isEmpty);
    },
  );

  test('v1 → v2 走真实 openDatabase 触发路径（临时文件库）', () async {
    final opened = await openUpgradedV1FileDb();
    addTearDown(() async {
      await opened.db.close();
      await opened.directory.delete(recursive: true);
    });

    // 升级后 PRAGMA user_version 必须被写成当前版本，否则每次启动都会重跑迁移。
    final versionRows = await opened.db.rawQuery('PRAGMA user_version');
    expect(versionRows.single['user_version'], LocalSchema.version);

    expect(
      await columnNames(opened.db, 'pending_answers'),
      contains('user_id'),
    );
    expect(await columnNames(opened.db, 'local_sessions'), contains('user_id'));
  });

  test('upgrade(db, 2, 2) 不抛且不改结构', () async {
    final db = await openMemoryDb();
    addTearDown(db.close);

    final before = await columnNames(db, 'pending_answers');
    await LocalSchema.upgrade(db, 2, 2);
    final after = await columnNames(db, 'pending_answers');

    expect(after, before);
  });
}
