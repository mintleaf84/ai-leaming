import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_client.dart';
import '../domain/exam_attempt.dart';
import '../domain/exam_generate_rules.dart';
import '../domain/exam_paper.dart';
import '../domain/exam_question.dart';
import '../domain/exam_submit_result.dart';

/// 试卷 / 模考的 Repository。
///
/// 路径口径：`Dio.baseUrl` 已含 `/api`（见 `core/constants/api_constants.dart`），
/// 所以这里一律写 `/exam/...`，**不要**再拼 `/api`。
///
/// 响应形状纪律：除了列表以外全是 JSON 对象，统一走 [_requireMap]——拿不到对象
/// 说明服务端形状漂移或代理回了 HTML，直接抛 [FormatException]，让界面走错误态，
/// 而不是把 `null` 当数据继续渲染。
class ExamRepository {
  final Dio _dio;

  ExamRepository(this._dio);

  /// 我的试卷列表（含作答次数 / 最好成绩 / 最近作答时间）。
  Future<ExamPaperPage> listPapers({int limit = 20, int offset = 0}) async {
    final response = await _dio.get(
      '/exam/papers',
      queryParameters: <String, dynamic>{'limit': limit, 'offset': offset},
    );
    return ExamPaperPage.fromJson(_requireMap(response.data, '/exam/papers'));
  }

  /// 手工组卷（移动端 MVP 没有选题界面，留给将来的入口/接口测试用）。
  ///
  /// 幂等性由服务端负责（同一 `questionIds` 重复提交会产生两张卷子），
  /// 因此调用方必须在工具栏/按钮层挡住重复点击。
  Future<ExamPaperDetail> createPaper({
    required String title,
    required String kind,
    int? durationMinutes,
    required List<int> questionIds,
  }) async {
    final response = await _dio.post(
      '/exam/papers',
      data: <String, dynamic>{
        'title': title,
        'kind': kind,
        if (kind == 'timed' && durationMinutes != null)
          'durationMinutes': durationMinutes,
        'questionIds': List<int>.from(questionIds),
      },
    );
    return ExamPaperDetail.fromJson(
      _requireMap(response.data, 'POST /exam/papers'),
    );
  }

  /// 试卷详情（题目清单 + 最近一次作答摘要）。
  Future<ExamPaperDetail> getPaper(int paperId) async {
    final response = await _dio.get('/exam/papers/$paperId');
    return ExamPaperDetail.fromJson(
      _requireMap(response.data, '/exam/papers/{id}'),
    );
  }

  /// 自动组卷。
  ///
  /// 服务端在「题量凑不满」时回 400 + `{requested, available, shortfall}`；
  /// 这里不吞错误——转换成人话是展示层的事（见 `describeExamError`）。
  Future<ExamPaperDetail> generate(ExamGenerateRules rules) async {
    final response = await _dio.post(
      '/exam/papers/generate',
      data: rules.toJson(),
    );
    return ExamPaperDetail.fromJson(
      _requireMap(response.data, '/exam/papers/generate'),
    );
  }

  /// 开始作答（每次调用都产生**新的一场**：同一张卷子做两次就是两条历史）。
  Future<ExamAttempt> startAttempt(int paperId) async {
    final response = await _dio.post('/exam/papers/$paperId/attempts');
    return ExamAttempt.fromJson(
      _requireMap(response.data, '/exam/papers/{id}/attempts'),
    );
  }

  /// 作答态 / 结果态。已交卷时响应里的 `result` 非空。
  Future<ExamAttemptDetail> getAttempt(String sessionId) async {
    final id = Uri.encodeComponent(sessionId);
    final response = await _dio.get('/exam/attempts/$id');
    return ExamAttemptDetail.fromJson(
      _requireMap(response.data, '/exam/attempts/{sessionId}'),
      fallbackSessionId: sessionId,
    );
  }

  /// 交卷。见 [submitPayload] 的幂等说明。
  Future<ExamSubmitResult> submit({
    required String sessionId,
    required List<ExamAnswerPayload> answers,
    required String clientKey,
  }) {
    return submitPayload(sessionId, <String, dynamic>{
      'answers': <Map<String, dynamic>>[
        for (final answer in answers) answer.toJson(),
      ],
      'clientKey': clientKey,
    });
  }

  /// 用一份**已经冻结**的载荷交卷（失败重试 / 结果未知重放）。
  ///
  /// 幂等纪律：服务端以 `exam_submitted_at` 为准，`clientKey` 只作日志与兜底。
  /// 客户端这边只要保证「同一次提交永远发同一份 body」——重试时若重新生成
  /// `clientKey`，日志里会出现两条看起来无关的提交，排查超时/重放问题会失去线索。
  Future<ExamSubmitResult> submitPayload(
    String sessionId,
    Map<String, dynamic> payload,
  ) async {
    final id = Uri.encodeComponent(sessionId);
    final response = await _dio.post(
      '/exam/attempts/$id/submit',
      data: payload,
    );
    return ExamSubmitResult.fromJson(
      _requireMap(response.data, '/exam/attempts/{sessionId}/submit'),
    );
  }

  Map<String, dynamic> _requireMap(Object? data, String path) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) {
      return data.map((key, value) => MapEntry(key.toString(), value));
    }
    throw FormatException(
      '$path 返回的不是 JSON 对象（${data.runtimeType}），'
      '请检查服务器地址是否指向 /api 后端',
    );
  }
}

/// Repository Provider。
///
/// 用 `watch`：`dioProvider` 在服务器地址变更后重建，试卷请求必须跟着换地址
/// （与 `recallRepositoryProvider` 同一理由）。
final examRepositoryProvider = Provider<ExamRepository>((ref) {
  return ExamRepository(ref.watch(dioProvider));
});
