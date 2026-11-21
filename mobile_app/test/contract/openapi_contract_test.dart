import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/compat/app_version.dart';

/// L1 契约门禁：客户端**实际依赖**的 path + method + 响应字段，必须仍然存在于
/// 仓库根的快照 `docs/openapi.json` 里。
///
/// 这个测试守的是「后端删了/改名了一个 Flutter 正在用的字段」这类**跨仓库漂移**：
/// 类型系统帮不上忙（客户端读 JSON 是字符串键），只有一份显式清单能挡住。清单
/// 是**从 `lib/` 里逐条抄出来的**，不是凭想象写的——新增调用时请同步加进来，
/// 否则门禁对那条调用形同虚设。
///
/// 三个刻意的设计：
/// 1. 只查**响应顶层**字段（数组响应查 `items` 的顶层），不递归业务字段——递归会让
///    清单变成「把整份 schema 抄一遍」，维护成本远大于收益；
/// 2. 失败信息必须点名端点与字段（`reason:`），不能只报 `expected true to be true`；
/// 3. 自带 `_selftest`：用不存在的端点和字段跑同一套断言函数，证明门禁真的会红
///    （否则一个写错的 `contains` 能绿到地老天荒）。
void main() {
  late Map<String, dynamic> snapshot;

  setUpAll(() {
    final file = _requireFile(const <String>[
      // 从 mobile_app/ 运行时生效；先按 `flutter test` 的包根口径找，
      // 再兜住「cwd 被设成 mobile_app/test」的口径。
      '../docs/openapi.json',
      '../../docs/openapi.json',
      'docs/openapi.json',
    ], '契约快照 docs/openapi.json');
    snapshot = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
  });

  group('客户端依赖的端点与响应字段', () {
    for (final spec in _clientEndpoints) {
      test('${spec.method.toUpperCase()} /api${spec.path}', () {
        requireEndpoint(snapshot, spec.path, spec.method);
        final fields = responseFields(snapshot, spec.path, spec.method);
        for (final field in spec.fields) {
          expect(
            fields,
            contains(field),
            reason:
                '端点 ${spec.method.toUpperCase()} /api${spec.path} 的响应顶层缺字段 '
                '"$field"。调用方：${spec.usedBy}。'
                '若这是「改名」而不是「删除」，说明客户端必须同步改代码；'
                '若是后端漏更新快照，请在 my-next-app/ 下跑 npm run contract:dump。',
          );
        }
      });
    }
  });

  group('/api/meta（客户端契约协商）', () {
    test('存在，且响应含协商需要的五个字段', () {
      requireEndpoint(snapshot, '/meta', 'get');
      final fields = responseFields(snapshot, '/meta', 'get');
      for (final field in const <String>[
        'contractVersion',
        'minClientVersion',
        'latestClientVersion',
        'downloadUrl',
        'features',
      ]) {
        expect(
          fields,
          contains(field),
          reason:
              '/api/meta 的响应顶层缺字段 "$field"。'
              'lib/core/compat/contract_meta.dart 依赖它做版本协商与能力探测；'
              '缺字段会让 App 把服务端当成「最旧」（contractVersion 缺省 0）。',
        );
      }
    });
  });

  group('版本常量一致性', () {
    test('appVersion 与 pubspec.yaml 的 version 主段一致', () {
      final pubspec = _requireFile(const <String>[
        'pubspec.yaml',
        '../pubspec.yaml',
      ], 'pubspec.yaml').readAsStringSync();
      final match = RegExp(
        r'^version:\s*(\S+)',
        multiLine: true,
      ).firstMatch(pubspec);
      expect(
        match,
        isNotNull,
        reason: 'pubspec.yaml 里找不到 `version:` 行，无法与 appVersion 比对',
      );

      final declared = match!.group(1)!.split('+').first;
      expect(
        appVersion,
        declared,
        reason:
            'lib/core/compat/app_version.dart 的 appVersion 是 "$appVersion"，'
            '但 pubspec.yaml 的版本主段是 "$declared"。'
            '两处漂移会让契约协商上报的版本与实际装的包不一致——'
            '请改 pubspec.yaml 同时更新 app_version.dart（反之亦然）。',
      );
    });
  });

  group('_selftest：门禁会真的红（不是空转）', () {
    test('不存在的端点必须被判为缺失', () {
      expect(
        () =>
            requireEndpoint(snapshot, '/definitely-not-a-real-endpoint', 'get'),
        throwsA(isA<TestFailure>()),
        reason: '如果这里不抛，说明 requireEndpoint 根本没在查快照',
      );
    });

    test('不存在的字段必须被判为缺失', () {
      expect(
        () {
          requireEndpoint(snapshot, '/recall/queue', 'get');
          final fields = responseFields(snapshot, '/recall/queue', 'get');
          expect(
            fields,
            contains('definitelyNotARealField'),
            reason: 'selftest：故意用一个不存在的字段',
          );
        },
        throwsA(isA<TestFailure>()),
        reason: '如果这里不抛，说明字段断言是空转的',
      );
    });

    test('不存在的 method 必须被判为缺失', () {
      expect(
        () => requireEndpoint(snapshot, '/recall/queue', 'post'),
        throwsA(isA<TestFailure>()),
        reason: '/recall/queue 只有 GET，POST 必须报错',
      );
    });

    test('路径归一化把 :id 与 {id} 视作同一端点', () {
      expect(
        _normalizePath('/api/history/:id'),
        _normalizePath('/api/history/{id}'),
      );
      expect(
        _normalizePath('/api/recall/decks/{deckKey}'),
        '/api/recall/decks/{}',
      );
    });
  });
}

/// 客户端实际依赖的一个端点。
class _Endpoint {
  const _Endpoint(
    this.method,
    this.path, {
    this.fields = const <String>[],
    required this.usedBy,
  });

  /// 小写 HTTP 方法（`get` / `post` / `delete`）。
  final String method;

  /// 客户端侧的路径，**不含 `/api` 前缀**（`Dio.baseUrl` 已含）。
  final String path;

  /// 客户端从这个响应里读的**顶层**字段；数组响应写元素的顶层字段。
  final List<String> fields;

  /// 谁在读它——失败信息里点名，方便定位改动影响面。
  final String usedBy;
}

/// 客户端依赖清单。
///
/// 来源：`lib/features/*/data/*.dart`、`lib/shared/datasources/api_client.dart`、
/// `lib/core/sync/sync_service.dart` 里的 Dio/Retrofit 调用，字段取各自
/// `fromJson` 读的键。recall 的 6 条路径见 `lib/features/recall/data/recall_repository.dart`。
const List<_Endpoint> _clientEndpoints = <_Endpoint>[
  // ---- 认证 ----
  _Endpoint(
    'post',
    '/auth/login',
    fields: <String>['token', 'user'],
    usedBy: 'features/auth/data/auth_repository_impl.dart',
  ),
  _Endpoint(
    'post',
    '/auth/register',
    fields: <String>['token', 'user'],
    usedBy: 'features/auth/data/auth_repository_impl.dart',
  ),

  // ---- 题库 ----
  _Endpoint(
    'get',
    '/questions',
    fields: <String>['items', 'total'],
    usedBy: 'shared/datasources/api_client.dart（QuestionListResponse）',
  ),
  _Endpoint(
    'get',
    '/questions/{id}',
    fields: <String>['id', 'content', 'options'],
    usedBy: 'shared/datasources/api_client.dart（Question）',
  ),

  // ---- 练习 ----
  _Endpoint(
    'post',
    '/practice/session',
    fields: <String>['sessionId', 'questions'],
    usedBy: 'shared/datasources/api_client.dart（PracticeSession）',
  ),
  _Endpoint(
    'get',
    '/practice/session/{sessionId}',
    fields: <String>['sessionId', 'questions'],
    usedBy: 'features/practice/data/practice_repository_impl.dart（错题本开始练习）',
  ),
  _Endpoint(
    'post',
    '/practice/session/{sessionId}/submit',
    fields: <String>['isCorrect', 'correctAnswer'],
    usedBy: 'features/practice/data/practice_repository_impl.dart',
  ),
  _Endpoint(
    'post',
    '/practice/offline-answers',
    fields: <String>['sessionId', 'inserted', 'duplicated'],
    usedBy: 'core/sync/sync_service.dart（离线作答补交幂等键判定）',
  ),
  _Endpoint(
    'post',
    '/practice/first-principles',
    fields: <String>['analysis', 'cached'],
    usedBy: 'features/practice/domain/first_principles_response.dart',
  ),

  // ---- 历史 ----
  _Endpoint(
    'get',
    '/history',
    fields: <String>['items', 'page', 'pageSize', 'total', 'totalPages'],
    usedBy: 'shared/datasources/api_client.dart（练习历史列表）',
  ),
  _Endpoint(
    'get',
    '/history/{id}',
    fields: <String>['session', 'logs'],
    usedBy: 'shared/datasources/api_client.dart（练习历史详情）',
  ),

  // ---- 知识卡片 ----
  _Endpoint(
    'get',
    '/knowledge/cards',
    fields: <String>['cards', 'categories', 'stats'],
    usedBy: 'shared/datasources/api_client.dart',
  ),
  _Endpoint(
    'post',
    '/knowledge/cards',
    fields: <String>['id', 'message'],
    usedBy: 'shared/datasources/api_client.dart',
  ),

  // ---- 掌握度 ----
  _Endpoint(
    'get',
    '/mastery/tree',
    fields: <String>['name', 'path', 'score'],
    usedBy: 'features/mastery（数组响应，读元素字段）',
  ),
  _Endpoint(
    'get',
    '/mastery/stats',
    fields: <String>['avgScore', 'count'],
    usedBy: 'shared/datasources/api_client.dart',
  ),

  // ---- 统计 / 个人信息 ----
  _Endpoint(
    'get',
    '/stats',
    fields: <String>[
      'todayCount',
      'todayCorrect',
      'todayAccuracy',
      'totalCount',
      'totalCorrect',
      'overallAccuracy',
      'streakDays',
      'totalSessions',
    ],
    usedBy: 'features/stats/domain/learning_stats.dart',
  ),
  _Endpoint(
    'get',
    '/profile',
    fields: <String>['id', 'username', 'role', 'createdAt', 'stats'],
    usedBy: 'features/profile/domain/user_profile.dart',
  ),

  // ---- 教材 ----
  _Endpoint(
    'get',
    '/textbook',
    fields: <String>['id', 'title', 'chapterCount'],
    usedBy: 'features/textbook/domain/textbook.dart（数组响应）',
  ),
  _Endpoint(
    'get',
    '/textbook/{id}',
    fields: <String>['id', 'title', 'chapters'],
    usedBy: 'features/textbook/domain/textbook.dart（TextbookDetail）',
  ),

  // ---- 订阅 ----
  _Endpoint(
    'get',
    '/billing/plans',
    fields: <String>['plans'],
    usedBy: 'features/pricing/presentation/pricing_screen.dart',
  ),

  // ---- AI 对话 ----
  _Endpoint(
    'post',
    '/chat',
    // SSE 流（`text-delta` / `error` 帧），快照里没有 JSON schema，只查路径存在。
    usedBy: 'features/chat/data/chat_repository_impl.dart（流式，无 JSON 响应体）',
  ),
  _Endpoint(
    'get',
    '/chat/sessions',
    fields: <String>['sessions'],
    usedBy: 'features/chat/data/chat_repository_impl.dart',
  ),
  _Endpoint(
    'post',
    '/chat/sessions',
    fields: <String>['sessionId'],
    usedBy: 'features/chat/data/chat_repository_impl.dart',
  ),
  _Endpoint(
    'get',
    '/chat/sessions/{id}',
    fields: <String>['messages', 'session'],
    usedBy: 'features/chat/data/chat_repository_impl.dart',
  ),
  _Endpoint(
    'delete',
    '/chat/sessions/{id}',
    fields: <String>['success'],
    usedBy: 'features/chat/data/chat_repository_impl.dart',
  ),

  // ---- 错题本 ----
  _Endpoint(
    'get',
    '/wrong-book',
    fields: <String>[
      'questionId',
      'questionContent',
      'tags',
      'wrongCount',
      'lastWrongAt',
      'correctAnswer',
      'userLastAnswer',
    ],
    usedBy: 'features/wrong_book/domain/wrong_question.dart（数组响应）',
  ),
  _Endpoint(
    'get',
    '/wrong-book/by-tag',
    fields: <String>['tag', 'count', 'questions'],
    usedBy: 'features/wrong_book/domain/wrong_question.dart（数组响应）',
  ),
  _Endpoint(
    'get',
    '/wrong-book/stats',
    fields: <String>['total', 'recent', 'frequent'],
    usedBy: 'features/wrong_book/domain/wrong_question.dart',
  ),
  _Endpoint(
    'get',
    '/wrong-book/{id}',
    fields: <String>[
      'questionId',
      'questionContent',
      'options',
      'correctAnswer',
      'explanation',
      'tags',
      'questionType',
      'wrongCount',
      'lastWrongAt',
      'userLastAnswer',
      'historyLogs',
    ],
    usedBy:
        'features/wrong_book/domain/wrong_question.dart（WrongQuestionDetail）',
  ),
  _Endpoint(
    'post',
    '/wrong-book/practice',
    fields: <String>['sessionId', 'success'],
    usedBy: 'features/wrong_book/data/wrong_book_repository.dart',
  ),
  _Endpoint(
    'post',
    '/wrong-book/{id}/master',
    fields: <String>['success'],
    usedBy: 'features/wrong_book/data/wrong_book_repository.dart',
  ),
  _Endpoint(
    'delete',
    '/wrong-book/{id}/master',
    fields: <String>['success'],
    usedBy: 'features/wrong_book/data/wrong_book_repository.dart',
  ),

  // ---- 回忆自测（recall）6 条路径 / 7 个方法 ----
  _Endpoint(
    'get',
    '/recall/queue',
    fields: <String>[
      'ids',
      'due',
      'fresh',
      'total',
      'estimatedMinutes',
      'streakDays',
    ],
    usedBy: 'features/recall/domain/recall_queue.dart',
  ),
  _Endpoint(
    'get',
    '/recall/decks',
    fields: <String>['data', 'meta'],
    usedBy: 'features/recall/domain/recall_deck.dart（RecallDeckListPage）',
  ),
  _Endpoint(
    'get',
    '/recall/decks/{deckKey}',
    fields: <String>['data', 'deck', 'meta'],
    usedBy: 'features/recall/domain/recall_deck.dart（RecallDeckPage）',
  ),
  _Endpoint(
    'get',
    '/recall/cards/{cardId}',
    fields: <String>[
      'cardId',
      'cardKey',
      'kind',
      'groupKey',
      'prompt',
      'items',
      'blanks',
      'verbatim',
      'deckKey',
      'deckTitle',
      'mode',
      'pendingItems',
      'state',
    ],
    usedBy: 'features/recall/domain/recall_card.dart（RecallCard）',
  ),
  _Endpoint(
    'post',
    '/recall/reviews',
    fields: <String>[
      'rating',
      'nextDue',
      'pendingItems',
      'nextReviewText',
      'duplicate',
      'verdicts',
    ],
    usedBy: 'features/recall/domain/recall_review.dart（RecallReviewResult）',
  ),
  _Endpoint(
    'post',
    '/recall/cards/{cardId}/archive',
    fields: <String>['archived', 'cardId'],
    usedBy: 'features/recall/data/recall_repository.dart',
  ),
  _Endpoint(
    'delete',
    '/recall/cards/{cardId}/archive',
    fields: <String>['restored', 'cardId'],
    usedBy: 'features/recall/data/recall_repository.dart',
  ),
];

/// 断言快照里有该 path + method；失败信息点名端点。
void requireEndpoint(Map<String, dynamic> doc, String path, String method) {
  final item = _findPathItem(doc, path);
  expect(
    item,
    isNotNull,
    reason:
        '契约快照里没有端点 /api$path。'
        '客户端仍在调用它（清单见 test/contract/openapi_contract_test.dart）。'
        '若后端确实删了这个路径，必须同步删客户端的调用；'
        '若只是快照过期，请在 my-next-app/ 下跑 npm run contract:dump。',
  );
  expect(
    item![method.toLowerCase()],
    isNotNull,
    reason:
        '端点 /api$path 在快照里存在，但没有 ${method.toUpperCase()} 方法。'
        '客户端按 ${method.toUpperCase()} 调用它。',
  );
}

/// 取该端点成功响应（2xx）的顶层字段名集合；数组响应取 `items` 的顶层字段。
///
/// `$ref` 解析到 `components/schemas`，`allOf` 合并，`anyOf`/`oneOf` 取并集
/// （任一分支提供该字段即算存在）。
Set<String> responseFields(
  Map<String, dynamic> doc,
  String path,
  String method,
) {
  final item = _findPathItem(doc, path);
  if (item == null) return <String>{};
  final operation = item[method.toLowerCase()];
  if (operation is! Map) return <String>{};

  final responses = operation['responses'];
  if (responses is! Map) return <String>{};

  // 优先 200；没有就取第一个 2xx（例如 201）。
  final codes = responses.keys.map((key) => key.toString()).toList()..sort();
  final successCode = codes.firstWhere(
    (code) => code == '200',
    orElse: () {
      return codes.firstWhere((code) => code.startsWith('2'), orElse: () => '');
    },
  );
  if (successCode.isEmpty) return <String>{};

  final response = responses[successCode];
  if (response is! Map) return <String>{};
  final content = response['content'];
  if (content is! Map) return <String>{};
  final json = content['application/json'];
  if (json is! Map) return <String>{};

  return _collectFieldNames(doc, json['schema']);
}

/// 归一化路径：`{id}` 与 Hono 快照里的 `:id` 视为同一段。
String _normalizePath(String path) {
  var normalized = path.trim();
  normalized = normalized.replaceAll(RegExp(r'\{[^/}]*\}'), '{}');
  normalized = normalized.replaceAll(RegExp(r':[^/]+'), '{}');
  return normalized;
}

Map<String, dynamic>? _findPathItem(Map<String, dynamic> doc, String path) {
  final paths = doc['paths'];
  if (paths is! Map) return null;

  final wanted = _normalizePath('/api$path');
  for (final entry in paths.entries) {
    if (_normalizePath(entry.key.toString()) == wanted) {
      final item = entry.value;
      if (item is Map<String, dynamic>) return item;
      if (item is Map) return item.cast<String, dynamic>();
    }
  }
  return null;
}

Set<String> _collectFieldNames(
  Map<String, dynamic> doc,
  Object? schema, {
  bool insideArray = false,
}) {
  final names = <String>{};
  if (schema is! Map) return names;

  final map = schema.cast<String, dynamic>();

  final ref = map[r'$ref'];
  if (ref is String) {
    final target = _lookupRef(doc, ref);
    if (target != null) {
      names.addAll(_collectFieldNames(doc, target, insideArray: insideArray));
    }
    return names;
  }

  for (final key in const <String>['allOf', 'anyOf', 'oneOf']) {
    final branches = map[key];
    if (branches is List) {
      for (final branch in branches) {
        names.addAll(_collectFieldNames(doc, branch, insideArray: insideArray));
      }
    }
  }

  final properties = map['properties'];
  if (properties is Map) {
    names.addAll(properties.keys.map((key) => key.toString()));
  }

  // 数组响应：字段在元素上（`{"type":"array","items":{...}}`）。
  if (!insideArray && map['type'] == 'array') {
    names.addAll(_collectFieldNames(doc, map['items'], insideArray: true));
  }

  return names;
}

Map<String, dynamic>? _lookupRef(Map<String, dynamic> doc, String ref) {
  if (!ref.startsWith('#/')) return null;
  Object? node = doc;
  for (final segment in ref.substring(2).split('/')) {
    if (node is! Map) return null;
    node = node[segment];
  }
  return node is Map ? node.cast<String, dynamic>() : null;
}

/// 按候选路径找文件；都找不到就 fail 并把 cwd 写出来（这类失败九成是 cwd 问题）。
File _requireFile(List<String> candidates, String what) {
  for (final candidate in candidates) {
    final file = File(candidate);
    if (file.existsSync()) return file.absolute;
  }
  fail(
    '找不到 $what。已尝试：${candidates.join('、')}；'
    '当前工作目录：${Directory.current.path}。'
    '这个测试预期从 mobile_app/ 下运行（flutter test）。',
  );
}
