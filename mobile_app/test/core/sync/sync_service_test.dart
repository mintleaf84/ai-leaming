import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/sync/sync_service.dart';
import 'package:mobile_app/features/practice/data/local_practice_store.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../../support/ffi_db.dart';
import '../../support/recording_adapter.dart';

/// 守的是「离线作答不会静默丢、不会串账号上传」这两条线。
///
/// 逐条对应的线上事故形态：
/// 1. **没登录就一个请求都不发**：token 缺失/解析不出 userId 时必须早退，
///    否则会把本机待同步数据发给匿名端点（服务端只能丢弃）；
/// 2. **Authorization 用本次解析出的 token**：Dio 拦截器每次会重读当前 token，
///    若期间换了账号，A 的作答就会被 B 的凭据上传——跨账号串数据；
/// 3. **幂等键 = `localId:本批最早 answeredAt`**：同批重试必须完全一致（否则
///    服务端重复计数），新批次必须不同（否则第二批被当成重复整批丢弃）；
/// 4. **只标记真正上传过的 clientKey**：宽限期跳过的作答不能被标记，
///    否则它们永远不会再重试；
/// 5. **响应不是 Map 时不标记已同步**：这通常意味着服务端/网关吐了非预期内容，
///    此时标记 = 这批作答永久丢失；
/// 6. **单会话失败不拖垮其余会话，401 立即中止**：401 继续发只会继续 401。
///
/// 用真实 `LocalPracticeStore` + 内存库（不 mock 数据库），只桩掉 HTTP 与
/// 安全存储：这样「标记已同步」和「读取待同步」这两步是拿真 SQL 验的。
void main() {
  setUpAll(setUpFfiDatabaseFactory);

  late Database db;
  late LocalPracticeStore store;
  late RecordingAdapter adapter;
  late Dio dio;
  late SyncService service;

  /// 构造一个 `TokenUtil` 能解析出 userId 的假 JWT（不校验签名）。
  String jwtFor(String userId, {int expOffsetSeconds = 3600}) {
    String encode(Object value) =>
        base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
    final payload = <String, dynamic>{
      'user': <String, dynamic>{'id': userId, 'username': 'u$userId'},
      'exp': DateTime.now().millisecondsSinceEpoch ~/ 1000 + expOffsetSeconds,
    };
    return '${encode(<String, String>{'alg': 'HS256'})}.${encode(payload)}.sig';
  }

  setUp(() async {
    db = await openMemoryDb();
    store = LocalPracticeStore(db: Future<Database>.value(db));
    adapter = RecordingAdapter();
    dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'))
      ..httpClientAdapter = adapter;
    service = SyncService(store, dio);
  });

  tearDown(() async {
    // `_followUpTimer` 是 8 秒的补交定时器：不 dispose 会在用例结束后触发，
    // 拿着已经关掉的库跑 flush，报的错和被测逻辑无关。
    service.dispose();
    await db.close();
  });

  /// 预置一批作答，并把 `answered_at` 设成 [startAt] 起的递增毫秒数。
  ///
  /// 必须早于 now-5s，否则会被 `pendingSessions` 的同步宽限期跳过。
  Future<void> seedAnswers({
    required String localId,
    required String userId,
    required List<String> questionIds,
    required int startAt,
  }) async {
    for (var i = 0; i < questionIds.length; i++) {
      await store.recordAnswer(
        localId: localId,
        userId: userId,
        questionId: questionIds[i],
        userAnswer: i.isEven ? 'A' : 'B',
        isCorrect: i.isEven,
        durationMs: 1000 + i * 10,
      );
      await db.rawUpdate(
        'UPDATE pending_answers SET answered_at = ? WHERE client_key = ?',
        <Object?>[startAt + i * 100, '$localId:${questionIds[i]}'],
      );
    }
  }

  int nowMs() => DateTime.now().millisecondsSinceEpoch;

  Map<String, dynamic> bodyOf(RequestOptions options) =>
      options.data as Map<String, dynamic>;

  group('未登录', () {
    test('无 token → 返回 error 含「未登录」，不发任何 HTTP', () async {
      FlutterSecureStorage.setMockInitialValues(const <String, String>{});
      await seedAnswers(
        localId: 'local_1',
        userId: 'u1',
        questionIds: const <String>['1'],
        startAt: nowMs() - 60000,
      );

      final result = await service.flush();

      expect(result.error, contains('未登录'));
      expect(result.sessions, 0);
      expect(adapter.requests, isEmpty);
    });

    test('token 解析不出 userId → 同样早退，不发任何 HTTP', () async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': 'not-a-jwt',
      });
      await seedAnswers(
        localId: 'local_1',
        userId: 'u1',
        questionIds: const <String>['1'],
        startAt: nowMs() - 60000,
      );

      final result = await service.flush();

      expect(result.error, contains('未登录'));
      expect(adapter.requests, isEmpty);
    });
  });

  group('正常路径', () {
    test('POST /practice/offline-answers，载荷与本地记录一致', () async {
      final token = jwtFor('u1');
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': token,
      });
      final startAt = nowMs() - 60000;
      await seedAnswers(
        localId: 'local_1',
        userId: 'u1',
        questionIds: const <String>['11', '12'],
        startAt: startAt,
      );
      adapter.responseBody = <String, dynamic>{'sessionId': 'srv_1'};

      final result = await service.flush();

      expect(adapter.requests, hasLength(1));
      final request = adapter.requests.single;
      expect(request.method, 'POST');
      expect(request.path, '/practice/offline-answers');
      expect(request.headers['Authorization'], 'Bearer $token');

      final body = bodyOf(request);
      // 幂等键 = localId + 本批最早的作答时间（不是首条 clientKey：那会随批次组成漂移）。
      expect(body['sessionKey'], 'local_1:$startAt');
      expect(body['sessionName'], isNotNull);
      final answers = (body['answers'] as List<dynamic>)
          .cast<Map<String, dynamic>>();
      expect(answers, hasLength(2));
      expect(answers.first['questionId'], 11);
      expect(answers.first['userAnswer'], 'A');
      expect(answers.first['isCorrect'], true);
      expect(answers.first['durationMs'], 1000);
      expect(answers.last['questionId'], 12);
      expect(answers.last['userAnswer'], 'B');
      expect(answers.last['isCorrect'], false);
      expect(answers.last['durationMs'], 1010);

      expect(result.sessions, 1);
      expect(result.answers, 2);
      expect(result.error, isNull);
    });

    test('只标记本次上传的 clientKey，宽限期内的作答仍待同步', () async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': jwtFor('u1'),
      });
      await seedAnswers(
        localId: 'local_1',
        userId: 'u1',
        questionIds: const <String>['1'],
        startAt: nowMs() - 60000,
      );
      // 刚作答的一条：落在 5 秒宽限期内，不会被这次 flush 取走。
      await store.recordAnswer(
        localId: 'local_1',
        userId: 'u1',
        questionId: '2',
        userAnswer: 'C',
        isCorrect: true,
      );
      adapter.responseBody = <String, dynamic>{'sessionId': 'srv_7'};

      await service.flush();

      expect(await store.pendingCount(), 1);
      final remaining = await db.query(
        'pending_answers',
        where: 'synced_at IS NULL',
      );
      expect(remaining.single['client_key'], 'local_1:2');
    });

    test('成功后 markLocalSessionServerId 收到 sessionId', () async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': jwtFor('u1'),
      });
      await store.createLocalSession(
        userId: 'u1',
        mode: 'random',
        questionIds: const <String>['1'],
      );
      final localId =
          (await db.query('local_sessions')).single['local_id'] as String;
      await seedAnswers(
        localId: localId,
        userId: 'u1',
        questionIds: const <String>['1'],
        startAt: nowMs() - 60000,
      );
      adapter.responseBody = <String, dynamic>{'sessionId': 'srv_42'};

      await service.flush();

      expect(
        (await db.query('local_sessions')).single['synced_session_id'],
        'srv_42',
      );
      expect(await store.pendingCount(), 0);
    });

    test('中途换账号：Authorization 仍用本次解析出的 token', () async {
      final tokenA = jwtFor('u1');
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': tokenA,
      });
      await seedAnswers(
        localId: 'local_1',
        userId: 'u1',
        questionIds: const <String>['1'],
        startAt: nowMs() - 60000,
      );
      // 请求发出后立刻把存储里的 token 换成 B 的：拦截器若重读就会用 B 上传 A 的数据。
      adapter.handler = (options) {
        FlutterSecureStorage.setMockInitialValues(<String, String>{
          'jwt_token': jwtFor('u2'),
        });
        return jsonBody(<String, dynamic>{'sessionId': 'srv_1'});
      };

      await service.flush();

      expect(
        adapter.requests.single.headers['Authorization'],
        'Bearer $tokenA',
      );
    });
  });

  group('响应处理', () {
    test('duplicated: true 计入 duplicated，且照常标记已同步', () async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': jwtFor('u1'),
      });
      await seedAnswers(
        localId: 'local_1',
        userId: 'u1',
        questionIds: const <String>['1'],
        startAt: nowMs() - 60000,
      );
      adapter.responseBody = <String, dynamic>{
        'sessionId': 'srv_1',
        'duplicated': true,
      };

      final result = await service.flush();

      expect(result.duplicated, 1);
      expect(result.sessions, 1);
      expect(await store.pendingCount(), 0);
    });

    test('响应不是 Map → 记 error 且该批不被标记已同步', () async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': jwtFor('u1'),
      });
      await seedAnswers(
        localId: 'local_1',
        userId: 'u1',
        questionIds: const <String>['1'],
        startAt: nowMs() - 60000,
      );
      adapter.handler = (options) => jsonBody('ok');

      final result = await service.flush();

      expect(result.error, isNotNull);
      expect(result.error, contains('响应格式非预期'));
      expect(result.sessions, 0);
      // 关键：不能标记，否则这批作答永久丢失。
      expect(await store.pendingCount(), 1);
    });

    test('某会话 500 → 其余会话继续，成功的那批已标记', () async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': jwtFor('u1'),
      });
      final startAt = nowMs() - 60000;
      await seedAnswers(
        localId: 'local_fail',
        userId: 'u1',
        questionIds: const <String>['1'],
        startAt: startAt,
      );
      await seedAnswers(
        localId: 'local_ok',
        userId: 'u1',
        questionIds: const <String>['2'],
        startAt: startAt + 1000,
      );
      adapter.handler = (options) {
        final key = bodyOf(options)['sessionKey'] as String;
        if (key.startsWith('local_fail')) {
          return jsonBody(<String, dynamic>{'error': 'boom'}, statusCode: 500);
        }
        return jsonBody(<String, dynamic>{'sessionId': 'srv_ok'});
      };

      final result = await service.flush();

      expect(adapter.requests, hasLength(2));
      expect(result.sessions, 1);
      expect(result.error, contains('HTTP 500'));
      final remaining = await db.query(
        'pending_answers',
        where: 'synced_at IS NULL',
      );
      expect(remaining.single['local_id'], 'local_fail');
    });

    test('某会话 401 → 立即中止，后续会话不再发请求', () async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': jwtFor('u1'),
      });
      final startAt = nowMs() - 60000;
      await seedAnswers(
        localId: 'local_a',
        userId: 'u1',
        questionIds: const <String>['1'],
        startAt: startAt,
      );
      await seedAnswers(
        localId: 'local_b',
        userId: 'u1',
        questionIds: const <String>['2'],
        startAt: startAt + 1000,
      );
      adapter.handler = (options) =>
          jsonBody(<String, dynamic>{'error': 'unauthorized'}, statusCode: 401);

      final result = await service.flush();

      // 只发了第一个会话：token 失效后继续发只会继续 401。
      expect(adapter.requests, hasLength(1));
      expect(result.sessions, 0);
      expect(result.error, contains('401'));
      expect(await store.pendingCount(), 2);
    });

    test('幂等键稳定：同一批数据 flush 两次，sessionKey 完全一致', () async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': jwtFor('u1'),
      });
      final startAt = nowMs() - 60000;
      await seedAnswers(
        localId: 'local_1',
        userId: 'u1',
        questionIds: const <String>['1', '2'],
        startAt: startAt,
      );
      // 用非 Map 响应，使两轮都不会被标记，从而真正重发同一批。
      adapter.handler = (options) => jsonBody('ok');

      await service.flush();
      await service.flush();

      expect(adapter.requests, hasLength(2));
      expect(
        bodyOf(adapter.requests[0])['sessionKey'],
        bodyOf(adapter.requests[1])['sessionKey'],
      );
      expect(bodyOf(adapter.requests[1])['sessionKey'], 'local_1:$startAt');
    });

    test('全部同步完成后 pendingCount 为 0，不残留补交定时器', () async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': jwtFor('u1'),
      });
      await seedAnswers(
        localId: 'local_1',
        userId: 'u1',
        questionIds: const <String>['1', '2', '3'],
        startAt: nowMs() - 60000,
      );
      adapter.responseBody = <String, dynamic>{'sessionId': 'srv_1'};

      await service.flush();

      expect(await store.pendingCount(), 0);
      // pendingCount 归零时不会排 8 秒补交定时器；再 flush 一次也不发请求。
      await service.flush();
      expect(adapter.requests, hasLength(1));
    });
  });

  group('并发保护', () {
    test('并发两次 flush：第二次直接返回 empty，不会重复上传同一批作答', () async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'jwt_token': jwtFor('u1'),
      });
      await seedAnswers(
        localId: 'local_1',
        userId: 'u1',
        questionIds: const <String>['1'],
        startAt: nowMs() - 60000,
      );
      // 卡住第一次的响应，制造「第一次还没回来」的并发窗口。
      final gate = Completer<void>();
      adapter.handler = (options) async {
        await gate.future;
        return jsonBody(<String, dynamic>{'sessionId': 'srv_1'});
      };

      final first = service.flush();
      await pumpEventQueue();
      expect(adapter.requests, hasLength(1), reason: '第一次请求已发出并挂起');

      final second = await service.flush();

      expect(second.sessions, 0);
      expect(second.answers, 0);
      expect(second.duplicated, 0);
      expect(second.error, isNull);
      expect(
        adapter.requests,
        hasLength(1),
        reason: '并发期间第二次不得再发请求（重复上传会互相污染计数）',
      );

      gate.complete();
      final firstResult = await first;

      expect(firstResult.sessions, 1);
      expect(firstResult.answers, 1);
      expect(adapter.requests, hasLength(1), reason: '整轮只应有一批请求');
      expect(await store.pendingCount(), 0);
    });
  });
}
