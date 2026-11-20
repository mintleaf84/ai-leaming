import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:mobile_app/features/exam/data/exam_repository.dart';

/// 试卷相关测试的共享假物。
///
/// 为什么单独一个文件而不是往 `fake_providers.dart` 里塞：那份文件被十几个
/// 既有用例 import，往里面加试卷专用的构造器会让每次改试卷测试都牵动别人的
/// 编译单元；lane 约定也要求新 fake 放新文件。
class ExamStubAdapter implements HttpClientAdapter {
  ExamStubAdapter(this.handler);

  final FutureOr<ResponseBody> Function(RequestOptions options) handler;
  final List<RequestOptions> requests = <RequestOptions>[];

  List<RequestOptions> get gets => requests
      .where((request) => request.method == 'GET')
      .toList(growable: false);

  List<RequestOptions> get posts => requests
      .where((request) => request.method == 'POST')
      .toList(growable: false);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody examJson(Object? body, {int statusCode = 200}) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: const <String, List<String>>{
      Headers.contentTypeHeader: <String>['application/json; charset=utf-8'],
    },
  );
}

/// 用桩 adapter 造一个指向 `/api` 的仓库（baseUrl 口径与生产一致）。
ExamRepository examRepositoryWith(ExamStubAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'))
    ..httpClientAdapter = adapter;
  return ExamRepository(dio);
}

Map<String, dynamic> examPaperJson({
  int id = 1,
  String title = '教综模考 11月20日',
  String kind = 'timed',
  int? durationMinutes = 30,
  String source = 'auto',
  int totalQuestions = 2,
  int attemptCount = 0,
  double? bestScore,
  String? lastAttemptAt,
}) {
  return <String, dynamic>{
    'id': id,
    'title': title,
    'kind': kind,
    'durationMinutes': durationMinutes,
    'source': source,
    'totalQuestions': totalQuestions,
    'attemptCount': attemptCount,
    'bestScore': bestScore,
    'lastAttemptAt': lastAttemptAt,
  };
}

Map<String, dynamic> examQuestionJson({
  int id = 1,
  String type = 'single',
  String content = '教育目的的核心是什么？',
  List<String> options = const <String>['培养人', '传授知识', '选拔人才', '服务社会'],
  List<String> tags = const <String>['教育学'],
  String? material,
  String? answer,
  String? explanation,
}) {
  return <String, dynamic>{
    'id': id,
    'content': content,
    'options': options,
    'type': type,
    'tags': tags,
    'dimension': 'knowledge',
    'material': material,
    'material_html': null,
    'answer': answer,
    'explanation': explanation,
  };
}

Map<String, dynamic> examPaperDetailJson({
  Map<String, dynamic>? paper,
  List<Map<String, dynamic>>? questions,
  Map<String, dynamic>? lastAttempt,
}) {
  final list =
      questions ??
      <Map<String, dynamic>>[
        examQuestionJson(id: 1),
        examQuestionJson(id: 2, type: 'multi'),
      ];
  return <String, dynamic>{
    'paper': paper ?? examPaperJson(totalQuestions: list.length),
    'items': <Map<String, dynamic>>[
      for (var index = 0; index < list.length; index++)
        <String, dynamic>{'position': index + 1, 'question': list[index]},
    ],
    if (lastAttempt != null) 'lastAttempt': lastAttempt,
  };
}

Map<String, dynamic> examAttemptJson({
  String sessionId = '9',
  int paperId = 1,
  String? deadlineAt,
  List<Map<String, dynamic>>? questions,
}) {
  return <String, dynamic>{
    'sessionId': sessionId,
    'paperId': paperId,
    'deadlineAt': deadlineAt,
    'questions':
        questions ??
        <Map<String, dynamic>>[
          examQuestionJson(id: 1),
          examQuestionJson(id: 2, type: 'multi'),
        ],
  };
}

Map<String, dynamic> examAttemptDetailJson({
  String sessionId = '9',
  Map<String, dynamic>? paper,
  List<Map<String, dynamic>>? questions,
  List<Map<String, dynamic>>? answers,
  Map<String, dynamic>? result,
  String? deadlineAt,
}) {
  return <String, dynamic>{
    'sessionId': sessionId,
    'paper': paper ?? examPaperJson(),
    'questions':
        questions ??
        <Map<String, dynamic>>[
          examQuestionJson(id: 1),
          examQuestionJson(id: 2, type: 'multi'),
        ],
    'answers': answers ?? const <Map<String, dynamic>>[],
    'result': result,
    'deadlineAt': deadlineAt,
  };
}

Map<String, dynamic> examSubmitResultJson({
  double score = 0.5,
  int correctCount = 1,
  int totalQuestions = 2,
  int durationMs = 125000,
  int overtimeMs = 0,
  bool overtime = false,
  bool duplicate = false,
  List<Map<String, dynamic>>? perQuestion,
}) {
  return <String, dynamic>{
    'score': score,
    'correctCount': correctCount,
    'totalQuestions': totalQuestions,
    'durationMs': durationMs,
    'overtimeMs': overtimeMs,
    'overtime': overtime,
    'duplicate': duplicate,
    'perQuestion':
        perQuestion ??
        <Map<String, dynamic>>[
          <String, dynamic>{
            'questionId': 1,
            'isCorrect': true,
            'correctAnswer': 'A',
            'explanation': '教育以培养人为核心。',
          },
          <String, dynamic>{
            'questionId': 2,
            'isCorrect': false,
            'correctAnswer': 'AB',
            'explanation': '两个选项都成立。',
          },
        ],
  };
}

Map<String, dynamic> examPaperPageJson({
  List<Map<String, dynamic>>? papers,
  int? total,
  int limit = 50,
  int offset = 0,
}) {
  final list = papers ?? <Map<String, dynamic>>[examPaperJson()];
  return <String, dynamic>{
    'data': list,
    'meta': <String, dynamic>{
      'limit': limit,
      'offset': offset,
      'total': total ?? list.length,
    },
  };
}
