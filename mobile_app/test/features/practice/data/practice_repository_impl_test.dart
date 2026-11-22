import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/error/user_message.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/core/sync/sync_providers.dart';
import 'package:mobile_app/features/practice/data/local_practice_store.dart';
import 'package:mobile_app/features/practice/data/practice_repository_impl.dart';
import 'package:mobile_app/features/practice/domain/practice_exceptions.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/shared/datasources/api_client.dart';

import '../../../support/recording_adapter.dart';

/// 这个测试守的是「断网时刷题不至于崩，但也绝不掩盖真实错误」这几条线：
///
/// 1. **降级只在连不上时发生**：`DioException.response == null` 才走离线出题；
///    4xx/5xx 是服务端明确拒绝（鉴权失效、参数错），必须原样抛出。静默换成本地
///    出题会让用户永远看不到真正原因，也会把「服务端挂了」伪装成「你没网」。
/// 2. **离线判分口径与后端一致**：多选题忽略顺序（`["B","A"]` 对 `AB`），
///    填空题按整串比较（`CAT` 对 `ACT` 是错的，不能按字母集合比），空答案判错。
/// 3. **作答入队失败不等于判分失败**：`recordAnswer` 抛异常时返回
///    `persisted: false`，但 `isCorrect` 仍然要给用户——判分结果不能因为
///    存储故障而丢。
/// 4. **中途断网降级用稳定幂等键** `local_<serverSessionId>`：同一场练习
///    补交两次必须是同一个 key，否则服务端会重复建会话、重复计数。
/// 5. **缓存写失败不能影响刷题**：`cacheQuestions` 抛异常只记日志。
///
/// 本地库用 [FakeLocalStore] 手写桩（不引 mocktail，与仓库既有测试一致）：
/// 只实现被调用的 6 个方法，其余靠 `noSuchMethod` 抛 `UnimplementedError`，
/// 保证「多调了一个不该调的存储方法」会立刻炸出来。
class FakeLocalStore implements LocalPracticeStore {
  List<Question> pickResult = const <Question>[];
  Object? pickError;
  int pickRandomCalls = 0;

  final Map<String, Question> questions = <String, Question>{};
  Object? questionByIdError;

  /// 本地会话里的题目 id（离线续练用）；null 表示「本地没有这场会话」。
  List<String>? localQuestionIds;

  /// 本地会话的归属账号（默认与 `makeJwt()` 的 user id 一致）。
  String? localOwner = '7';

  /// 本地会话的模式（离线续练要如实还原；null = 老记录没存）。
  String? localMode = 'wrong';

  List<Question>? cachedQuestions;
  Object? cacheError;

  final List<Map<String, Object?>> createdSessions = <Map<String, Object?>>[];
  final List<Map<String, Object?>> ensuredSessions = <Map<String, Object?>>[];
  final List<Map<String, Object?>> recordedAnswers = <Map<String, Object?>>[];
  Object? recordError;

  @override
  Future<List<Question>> pickRandom({
    int limit = 10,
    String? tag,
    int maxAgeDays = LocalPracticeStore.cacheMaxAgeDays,
  }) async {
    pickRandomCalls++;
    final error = pickError;
    if (error != null) {
      throw error;
    }
    return pickResult.take(limit).toList();
  }

  @override
  Future<Question?> questionById(
    String id, {
    int maxAgeDays = LocalPracticeStore.cacheMaxAgeDays,
  }) async {
    final error = questionByIdError;
    if (error != null) {
      throw error;
    }
    return questions[id];
  }

  @override
  Future<List<String>?> localSessionQuestionIds(String localId) async {
    return localQuestionIds;
  }

  @override
  Future<String?> localSessionOwner(String localId) async {
    return localQuestionIds == null ? null : localOwner;
  }

  @override
  Future<String?> localSessionMode(String localId) async {
    return localMode;
  }

  @override
  Future<void> cacheQuestions(List<Question> questions) async {
    final error = cacheError;
    if (error != null) {
      throw error;
    }
    cachedQuestions = questions;
  }

  @override
  Future<String> createLocalSession({
    required String userId,
    required String mode,
    required List<String> questionIds,
  }) async {
    createdSessions.add(<String, Object?>{
      'userId': userId,
      'mode': mode,
      'questionIds': questionIds,
    });
    return 'local_test_session';
  }

  @override
  Future<void> ensureLocalSession({
    required String localId,
    required String userId,
    required String mode,
    required List<String> questionIds,
  }) async {
    ensuredSessions.add(<String, Object?>{
      'localId': localId,
      'userId': userId,
      'mode': mode,
      'questionIds': questionIds,
    });
  }

  @override
  Future<void> recordAnswer({
    required String localId,
    required String userId,
    required String questionId,
    String? userAnswer,
    required bool isCorrect,
    int? durationMs,
  }) async {
    final error = recordError;
    if (error != null) {
      throw error;
    }
    recordedAnswers.add(<String, Object?>{
      'localId': localId,
      'userId': userId,
      'questionId': questionId,
      'userAnswer': userAnswer,
      'isCorrect': isCorrect,
      'durationMs': durationMs,
    });
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'FakeLocalStore 未实现 ${invocation.memberName}：这个测试不该调用它',
    );
  }
}

/// 拼一个只用于读 payload 的 JWT（签名段不参与客户端逻辑）。
String makeJwt({int userId = 7}) {
  String segment(Object value) {
    return base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  }

  final header = segment(<String, dynamic>{'alg': 'HS256', 'typ': 'JWT'});
  final payload = segment(<String, dynamic>{
    'user': <String, dynamic>{'id': userId, 'username': 'tester'},
    'exp': 9999999999,
  });
  return '$header.$payload.signature-not-verified';
}

Map<String, dynamic> questionJson({
  int id = 1,
  String content = '我国教育目的的理论基础是（ ）。',
  List<String> options = const <String>['A. 个人本位', 'B. 社会本位'],
  String type = 'single',
  String? answer = 'A',
}) {
  return <String, dynamic>{
    'id': id,
    'content': content,
    'options': options,
    'type': type,
    'tags': <String>['教育目的'],
    'answer': answer,
  };
}

const Question cachedQuestion = Question(
  id: '3',
  content: '下列属于教育目的功能的是（ ）。',
  options: <String>['A. 导向', 'B. 激励', 'C. 评价'],
  type: 'multi',
  answer: 'AB',
);

Matcher throwsOfflineCache(String messagePart) {
  return throwsA(
    isA<OfflineCacheUnavailable>().having(
      (error) => error.message,
      'message',
      contains(messagePart),
    ),
  );
}

void main() {
  late RecordingAdapter adapter;
  late FakeLocalStore store;
  late PracticeRepositoryImpl repository;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues(<String, String>{
      'jwt_token': makeJwt(),
    });
    adapter = RecordingAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'));
    dio.httpClientAdapter = adapter;
    store = FakeLocalStore();
    repository = PracticeRepositoryImpl(ApiClient(dio), dio, store);
  });

  group('createSession：只有连不上才降级', () {
    test('服务端成功时直接返回，不碰本地库', () async {
      adapter.responseBody = <String, dynamic>{
        'sessionId': 'agent_1',
        'questions': <Map<String, dynamic>>[questionJson()],
      };

      final session = await repository.createSession(limit: 5);

      expect(session.sessionId, 'agent_1');
      expect(session.questions.single.id, '1');
      final request = adapter.requests.single;
      expect(request.path, '/practice/session');
      expect(request.method, 'POST');
      expect(request.data, <String, dynamic>{'mode': 'random', 'limit': 5});
      expect(store.pickRandomCalls, 0, reason: '在线成功不该读本地题库');
      expect(store.createdSessions, isEmpty, reason: '在线成功不该建本地会话');
    });

    test('连不上（response == null）时用本地缓存出题', () async {
      adapter.handler = (options) => offlineException(options);
      store.pickResult = <Question>[
        cachedQuestion,
        const Question(
          id: '4',
          content: '第二题',
          options: <String>['A. 甲', 'B. 乙'],
          answer: 'A',
        ),
      ];

      final session = await repository.createSession(limit: 2, mode: 'endless');

      expect(session.sessionId, 'local_test_session');
      expect(session.questions, hasLength(2));
      final created = store.createdSessions.single;
      expect(created['userId'], '7', reason: '待同步数据必须带账号归属');
      expect(created['mode'], 'endless');
      expect(created['questionIds'], <String>['3', '4']);
    });

    test('服务端 500 必须 rethrow，不能静默换成本地出题', () async {
      adapter.responseBody = <String, dynamic>{'error': 'internal error'};
      adapter.statusCode = 500;

      await expectLater(
        repository.createSession(limit: 5),
        throwsA(isA<DioException>()),
      );
      expect(store.pickRandomCalls, 0, reason: '5xx 不是断网，不该走离线出题');
      expect(store.createdSessions, isEmpty);
    });

    test('服务端 401 同样 rethrow（鉴权失效不能被伪装成离线）', () async {
      adapter.responseBody = <String, dynamic>{'error': 'unauthorized'};
      adapter.statusCode = 401;

      await expectLater(
        repository.createSession(limit: 5),
        throwsA(
          isA<DioException>().having(
            (error) => error.response?.statusCode,
            'statusCode',
            401,
          ),
        ),
      );
      expect(store.pickRandomCalls, 0);
    });
  });

  group('离线出题：失败原因要能直接给用户看', () {
    test('缓存为空/过期 → 提示 7 天，而不是静默出一套空题', () async {
      adapter.handler = (options) => offlineException(options);
      store.pickResult = const <Question>[];

      await expectLater(
        repository.createSession(limit: 5),
        throwsOfflineCache('7 天'),
      );
      expect(store.createdSessions, isEmpty);
    });

    test('没有 jwt → 提示登录已失效', () async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{});
      adapter.handler = (options) => offlineException(options);
      store.pickResult = <Question>[cachedQuestion];

      await expectLater(
        repository.createSession(limit: 5),
        throwsOfflineCache('登录已失效'),
      );
      expect(store.createdSessions, isEmpty);
    });

    test('本地库抛异常 → 以「本地题库读取失败」开头，不伪装成没网', () async {
      adapter.handler = (options) => offlineException(options);
      store.pickError = StateError('disk full');

      await expectLater(
        repository.createSession(limit: 5),
        throwsA(
          isA<OfflineCacheUnavailable>().having(
            (error) => error.message,
            'message',
            startsWith('本地题库读取失败'),
          ),
        ),
      );
    });
  });

  group('submitAnswer：本地会话只判分、不发请求', () {
    test('local_ 前缀的会话不发任何 HTTP 请求', () async {
      store.questions['3'] = cachedQuestion;

      final result = await repository.submitAnswer(
        sessionId: 'local_test_session',
        questionId: '3',
        userAnswer: '["B","A"]',
        duration: 5,
      );

      expect(adapter.requests, isEmpty, reason: '本地会话没有服务端记录，不该联网');
      expect(result['isCorrect'], isTrue);
      expect(result['correctAnswer'], 'AB');
      expect(result['persisted'], isTrue);
      expect(result['offline'], isTrue);

      final recorded = store.recordedAnswers.single;
      expect(recorded['localId'], 'local_test_session');
      expect(recorded['userId'], '7');
      expect(recorded['isCorrect'], isTrue);
      expect(recorded['durationMs'], 5000, reason: '入队用毫秒，界面传的是秒');
    });

    test('多选题忽略选项顺序：["B","A"] 对 AB 判对', () async {
      store.questions['3'] = cachedQuestion;

      final result = await repository.submitAnswer(
        sessionId: 'local_x',
        questionId: '3',
        userAnswer: '["B","A"]',
        duration: 0,
      );

      expect(result['isCorrect'], isTrue);
    });

    test('填空题不能按字母集合比：CAT 对 ACT 判错', () async {
      store.questions['8'] = const Question(
        id: '8',
        content: '英文单词「猫」怎么拼？',
        options: <String>[],
        type: 'fill',
        answer: 'ACT',
      );

      final result = await repository.submitAnswer(
        sessionId: 'local_x',
        questionId: '8',
        userAnswer: 'CAT',
        duration: 0,
      );

      expect(
        result['isCorrect'],
        isFalse,
        reason: '若退化成字母集合比较，CAT 会被误判成 ACT 的正确答案',
      );
    });

    test('空答案判错（不能让"没作答"变成正确）', () async {
      store.questions['3'] = cachedQuestion;

      final result = await repository.submitAnswer(
        sessionId: 'local_x',
        questionId: '3',
        userAnswer: '',
        duration: 0,
      );

      expect(result['isCorrect'], isFalse);
    });

    test('入队失败时 persisted=false，但判分结果仍然返回', () async {
      store.questions['3'] = cachedQuestion;
      store.recordError = StateError('database is locked');

      final result = await repository.submitAnswer(
        sessionId: 'local_x',
        questionId: '3',
        userAnswer: '["A","B"]',
        duration: 3,
      );

      expect(result['persisted'], isFalse);
      expect(result['isCorrect'], isTrue, reason: '存储故障不能连带把用户做对的题判错');
      expect(result['correctAnswer'], 'AB');
    });

    test('本地没有这道题 → 宁可不判分，也不写错数据', () async {
      final result = repository.submitAnswer(
        sessionId: 'local_x',
        questionId: '404',
        userAnswer: 'A',
        duration: 0,
      );

      await expectLater(result, throwsOfflineCache('本地没有这道题'));
      expect(store.recordedAnswers, isEmpty);
    });
  });

  group('submitAnswer：在线会话中途断网的降级', () {
    test('断网后用 local_<服务端会话 id> 补建会话并判分', () async {
      adapter.handler = (options) => offlineException(options);
      store.questions['3'] = cachedQuestion;

      final result = await repository.submitAnswer(
        sessionId: 'agent_42',
        questionId: '3',
        userAnswer: '["A","B"]',
        duration: 2,
        sessionQuestionIds: const <String>['1', '3', '5'],
      );

      expect(adapter.requests.single.path, '/practice/session/agent_42/submit');
      expect(result['offline'], isTrue);
      expect(result['isCorrect'], isTrue);
      expect(result['persisted'], isTrue);

      final ensured = store.ensuredSessions.single;
      expect(ensured['localId'], 'local_agent_42');
      expect(
        ensured['mode'],
        'offline-resume',
        reason: '调用方没说模式时才落内部标记（续练会归一成「未知」）',
      );
      expect(
        ensured['questionIds'],
        <String>['1', '3', '5'],
        reason: '降级后的本地会话必须记全整场题序，否则重启续练只剩断网那一题',
      );
      expect(store.recordedAnswers.single['localId'], 'local_agent_42');
    });

    test('没传整场题序时至少记下当前题（不写空列表）', () async {
      adapter.handler = (options) => offlineException(options);
      store.questions['3'] = cachedQuestion;

      await repository.submitAnswer(
        sessionId: 'agent_42',
        questionId: '3',
        userAnswer: 'A',
        duration: 0,
      );

      expect(store.ensuredSessions.single['questionIds'], <String>['3']);
    });

    test('降级建本地会话时写入真实模式（不是内部标记）', () async {
      adapter.handler = (options) => offlineException(options);
      store.questions['3'] = cachedQuestion;

      await repository.submitAnswer(
        sessionId: 'agent_42',
        questionId: '3',
        userAnswer: 'A',
        duration: 0,
        mode: 'review',
      );

      expect(
        store.ensuredSessions.single['mode'],
        'review',
        reason: '断网续练时要能把「这一场是错题复习」还原出来，而不是只知道「降级过」',
      );
    });

    test('同一题再次断网降级，幂等键保持不变', () async {
      adapter.handler = (options) => offlineException(options);
      store.questions['3'] = cachedQuestion;

      await repository.submitAnswer(
        sessionId: 'agent_42',
        questionId: '3',
        userAnswer: '["A","B"]',
        duration: 2,
      );
      await repository.submitAnswer(
        sessionId: 'agent_42',
        questionId: '3',
        userAnswer: '["A","B"]',
        duration: 2,
      );

      expect(store.recordedAnswers, hasLength(2));
      expect(
        store.recordedAnswers.first['localId'],
        store.recordedAnswers.last['localId'],
        reason: '幂等键变了，服务端会把同一场练习补交两次',
      );
      expect(
        store.ensuredSessions.map((item) => item['localId']).toSet(),
        <String>{'local_agent_42'},
      );
    });

    test('服务端 4xx 必须 rethrow，不能降级成"离线作答"', () async {
      adapter.responseBody = <String, dynamic>{'error': 'invalid answer'};
      adapter.statusCode = 400;

      await expectLater(
        repository.submitAnswer(
          sessionId: 'agent_42',
          questionId: '3',
          userAnswer: 'A',
          duration: 1,
        ),
        throwsA(isA<DioException>()),
      );
      expect(store.ensuredSessions, isEmpty);
      expect(store.recordedAnswers, isEmpty);
    });

    test('题号不是数字：抛业务错误，不发请求、不降级', () async {
      await expectLater(
        repository.submitAnswer(
          sessionId: 'agent_42',
          questionId: 'abc',
          userAnswer: 'A',
          duration: 1,
        ),
        throwsA(
          isA<InvalidQuestionIdException>().having(
            (error) => error.userMessage,
            'userMessage',
            '题目编号异常，请刷新后重试',
          ),
        ),
      );

      expect(adapter.requests, isEmpty, reason: '题号都解析不了，不该把请求发出去');
      expect(store.ensuredSessions, isEmpty, reason: '这不是网络问题，不能顺手降级成本地作答');
    });
  });

  group('getQuestions / getSession：路径与缓存副作用', () {
    test('成功拉到题库后写入本地缓存', () async {
      adapter.responseBody = <String, dynamic>{
        'items': <Map<String, dynamic>>[questionJson()],
        'total': 1,
      };

      final response = await repository.getQuestions(page: 1, limit: 10);

      final request = adapter.requests.single;
      expect(request.path, '/questions');
      expect(request.queryParameters, <String, dynamic>{
        'page': 1,
        'limit': 10,
      });
      expect(response.items.single.id, '1');
      expect(store.cachedQuestions, hasLength(1));
      expect(store.cachedQuestions!.single.content, contains('教育目的'));
    });

    test('缓存写失败不影响本次刷题（只记日志）', () async {
      adapter.responseBody = <String, dynamic>{
        'items': <Map<String, dynamic>>[questionJson()],
        'total': 1,
      };
      store.cacheError = StateError('read-only file system');

      final response = await repository.getQuestions();

      expect(response.items, hasLength(1), reason: '缓存只是副作用，失败不该让刷题失败');
    });

    test('getSession 打 /practice/session/{id}（手写路径不能多一层 /api）', () async {
      adapter.responseBody = <String, dynamic>{
        'sessionId': 'agent_9',
        'questions': <Map<String, dynamic>>[questionJson()],
        'completedCount': 0,
        'practiceMode': 'wrong-book',
      };

      final session = await repository.getSession('agent_9');

      expect(adapter.requests.single.path, '/practice/session/agent_9');
      expect(session.sessionId, 'agent_9');
      expect(session.questions.single.id, '1');
    });

    test('local_ 会话从本地记录 + 题目缓存重建，不发 HTTP（离线续练）', () async {
      store.localQuestionIds = <String>['1', '2'];
      store.questions['1'] = const Question(
        id: '1',
        content: '本地题一',
        options: <String>['A', 'B'],
        answer: 'A',
      );
      store.questions['2'] = const Question(
        id: '2',
        content: '本地题二',
        options: <String>['A', 'B'],
        answer: 'B',
      );

      final session = await repository.getSession('local_123');

      expect(adapter.requests, isEmpty, reason: '本地会话在服务端不存在，不该打请求');
      expect(session.sessionId, 'local_123');
      expect(
        session.practiceMode,
        'wrong',
        reason: '离线会话的模式要跟着本地记录还原，不能丢成 random',
      );
      expect(
        session.questions.map((q) => q.content),
        <String>['本地题一', '本地题二'],
        reason: '题目顺序必须与开练时一致（否则续练落点会错位）',
      );
    });

    test('local_ 会话的题面已过期/缺失：明确拒绝，不拿空答案判分', () async {
      store.localQuestionIds = <String>['1', '2'];
      store.questions['1'] = const Question(
        id: '1',
        content: '本地题一',
        options: <String>['A', 'B'],
      );

      await expectLater(
        repository.getSession('local_123'),
        throwsA(
          isA<OfflineCacheUnavailable>().having(
            (e) => e.userMessage,
            'userMessage',
            contains('过期'),
          ),
        ),
      );
      expect(adapter.requests, isEmpty);
    });

    test('local_ 会话在本地找不到记录：给出可读原因', () async {
      store.localQuestionIds = null;

      await expectLater(
        repository.getSession('local_missing'),
        throwsA(isA<OfflineCacheUnavailable>()),
      );
    });

    test('local_ 会话不属于当前账号：拒绝恢复（A 的离线练习不能被 B 接着做）', () async {
      store.localQuestionIds = <String>['1'];
      store.localOwner = '9';
      store.questions['1'] = const Question(
        id: '1',
        content: '本地题一',
        options: <String>['A', 'B'],
        answer: 'A',
      );

      await expectLater(
        repository.getSession('local_123'),
        throwsOfflineCache('不属于当前账号'),
      );
      expect(adapter.requests, isEmpty);
    });

    test('缓存里的题没有答案：恢复被拒，文案指向「联网刷新题库」', () async {
      store.localQuestionIds = <String>['1', '2'];
      store.questions['1'] = const Question(
        id: '1',
        content: '本地题一',
        options: <String>['A', 'B'],
        answer: 'A',
      );
      // 缓存被列表接口覆盖过：answer 缺失。用空答案判分会把整场判错。
      store.questions['2'] = const Question(
        id: '2',
        content: '本地题二',
        options: <String>['A', 'B'],
      );

      await expectLater(
        repository.getSession('local_123'),
        throwsOfflineCache('请联网刷新题库'),
      );
      expect(adapter.requests, isEmpty);
    });

    test('题面与答案都在：恢复成功且题序不变', () async {
      store.localQuestionIds = <String>['2', '1'];
      for (final id in <String>['1', '2']) {
        store.questions[id] = Question(
          id: id,
          content: '本地题$id',
          options: const <String>['A', 'B'],
          answer: 'A',
        );
      }

      final session = await repository.getSession('local_123');

      expect(session.sessionId, 'local_123');
      expect(
        session.questions.map((q) => q.id),
        <String>['2', '1'],
        reason: '题序必须与开练时一致，否则断点落点会错位',
      );
    });
  });

  /// 这两块以前没人守：
  /// - `practiceRepositoryProvider` 的装配（dio + 本地库注入）；
  /// - `OfflineCacheUnavailable` 作为 [UserFacingException] 的契约（文案要能直接
  ///   上屏，不能被 `userMessageOf` 归到「出了点问题」）。
  group('provider 装配与离线错误类型', () {
    test('practiceRepositoryProvider 用 dio + 本地库装配出实现类', () {
      final container = ProviderContainer(
        overrides: [
          dioProvider.overrideWithValue(
            Dio(BaseOptions(baseUrl: 'http://localhost:3000/api')),
          ),
          localPracticeStoreProvider.overrideWithValue(store),
        ],
      );
      addTearDown(container.dispose);

      expect(container.read(practiceRepositoryProvider), isA<PracticeRepositoryImpl>());
    });

    test('OfflineCacheUnavailable 的文案原样上屏（不被兜底文案替换）', () {
      const error = OfflineCacheUnavailable('本地题库为空或已超过 7 天未刷新');

      expect(error.userMessage, '本地题库为空或已超过 7 天未刷新');
      expect(userMessageOf(error), error.userMessage);
      expect(error.toString(), error.message);
    });
  });
}
