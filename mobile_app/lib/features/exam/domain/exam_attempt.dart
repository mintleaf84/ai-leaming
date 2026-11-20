import 'exam_json.dart';
import 'exam_paper.dart';
import 'exam_question.dart';
import 'exam_submit_result.dart';

/// 一次作答的开始态（`POST /papers/{id}/attempts`）。
///
/// 倒计时以 [deadlineAt] 为唯一依据：客户端只做展示与一次本地自动交卷，
/// 最终是否超时由服务端在提交时判定（`overtimeMs` / `overtime`）。
class ExamAttempt {
  final String sessionId;
  final int paperId;

  /// 截止时间；不限时为 null。
  final DateTime? deadlineAt;
  final List<ExamQuestion> questions;

  const ExamAttempt({
    required this.sessionId,
    required this.paperId,
    this.deadlineAt,
    this.questions = const [],
  });

  bool get isTimed => deadlineAt != null;

  factory ExamAttempt.fromJson(Map<String, dynamic> json) {
    return ExamAttempt(
      // 契约没写死 sessionId 的类型（practice_sessions 的主键是整数），
      // 统一转成字符串：路由参数本来就是字符串，界面层不需要再分叉。
      sessionId: readString(json['sessionId']),
      paperId: readInt(json['paperId']),
      deadlineAt: readDateTime(json['deadlineAt']),
      questions: readObjectList(json['questions'], ExamQuestion.fromJson),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'sessionId': sessionId,
    'paperId': paperId,
    'deadlineAt': deadlineAt?.toIso8601String(),
    'questions': <Map<String, dynamic>>[
      for (final question in questions) question.toJson(),
    ],
  };
}

/// 作答态/结果态（`GET /attempts/{sessionId}`）。
///
/// 同一个接口在交卷前后各返回一次：交卷前 [result] 为 null、题目 `answer` 为空；
/// 交卷后 [result] 是已经落库的那份成绩。界面据此决定渲染作答屏还是成绩单。
class ExamAttemptDetail {
  final String sessionId;
  final ExamPaper? paper;
  final List<ExamQuestion> questions;
  final DateTime? deadlineAt;

  /// 已作答的记录（题号 → 作答原文）。深链接重新打开时用来回填。
  final Map<int, String> answers;
  final ExamSubmitResult? result;

  const ExamAttemptDetail({
    required this.sessionId,
    this.paper,
    this.questions = const [],
    this.deadlineAt,
    this.answers = const {},
    this.result,
  });

  bool get isSubmitted => result != null;

  factory ExamAttemptDetail.fromJson(
    Map<String, dynamic> json, {
    String? fallbackSessionId,
  }) {
    final paperJson = readMap(json['paper']);
    final resultJson = readMap(json['result']);
    return ExamAttemptDetail(
      sessionId: readString(
        json['sessionId'],
        fallback: fallbackSessionId ?? '',
      ),
      paper: paperJson == null ? null : ExamPaper.fromJson(paperJson),
      questions: readObjectList(json['questions'], ExamQuestion.fromJson),
      deadlineAt: readDateTime(json['deadlineAt']),
      answers: _readAnswers(json['answers']),
      result: resultJson == null ? null : ExamSubmitResult.fromJson(resultJson),
    );
  }

  /// `answers` 的两种可能形状都认：
  /// - `[{questionId, userAnswer}, …]`（与交卷载荷同形）；
  /// - `{"12": "A"}` / `{"12": ["A","B"]}`（按题号索引）。
  ///
  /// 读不出来就返回空表——回填失败只意味着重新作答，不该让整屏报错。
  static Map<int, String> _readAnswers(Object? value) {
    final out = <int, String>{};
    if (value is List) {
      for (final item in value) {
        final map = readMap(item);
        if (map == null) continue;
        final questionId = readInt(map['questionId'] ?? map['question_id']);
        if (questionId <= 0) continue;
        out[questionId] = _answerText(
          map['userAnswer'] ?? map['user_answer'] ?? map['answer'],
        );
      }
      return out;
    }
    final map = readMap(value);
    if (map != null) {
      for (final entry in map.entries) {
        final questionId = int.tryParse(entry.key);
        if (questionId == null) continue;
        out[questionId] = _answerText(entry.value);
      }
    }
    return out;
  }

  static String _answerText(Object? value) {
    if (value is List) {
      // 多选题若以数组回传（`["A","B"]`），拼成与客户端一致的「AB」。
      final letters = value.map(readString).where((item) => item.isNotEmpty);
      return letters.join();
    }
    return readString(value).trim();
  }

  ExamAttemptDetail copyWith({
    List<ExamQuestion>? questions,
    DateTime? deadlineAt,
    Map<int, String>? answers,
    ExamSubmitResult? result,
  }) {
    return ExamAttemptDetail(
      sessionId: sessionId,
      paper: paper,
      questions: questions ?? this.questions,
      deadlineAt: deadlineAt ?? this.deadlineAt,
      answers: answers ?? this.answers,
      result: result ?? this.result,
    );
  }
}
