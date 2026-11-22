import '../domain/first_principles_response.dart';
import '../domain/question.dart';

/// 练习会话状态
///
/// 从 `practice_provider.dart` 原样搬出（纯搬移，字段与 `copyWith` 一字未改）。
/// `practice_provider.dart` 重新导出本文件，`import practice_provider.dart`
/// 拿到的名字不变。
class PracticeSessionState {
  final String? sessionId;
  final List<Question> questions;
  final int currentIndex;
  final Map<String, List<String>> userAnswers; // questionId -> 选中的选项列表
  final Map<String, bool> results; // questionId -> isCorrect
  final Map<String, String> correctAnswers; // questionId -> correctAnswer
  final Map<String, String> explanations; // questionId -> explanation
  final Map<String, FirstPrinciplesResponse> firstPrinciples; // questionId -> AI分析
  final bool isAnalyzingFirstPrinciples;

  /// 第一性原理分析**专用**的失败原因（面板的失败态读它）。
  ///
  /// 不能复用 [error]：那是整场练习的粗粒度错误（创建会话失败、断点保存失败等），
  /// 面板拿它判断会把一条与 AI 分析无关的红字显示成「分析失败」。
  /// 语义与 [error] 一致：下一次 copyWith 不带它就清空（重试中 / 成功 / 换题都清）。
  final String? firstPrinciplesError;
  final bool isLoading;
  final String? error;

  /// 本次练习是否在离线状态（本地会话，作答先落队列、回连再补交）。
  final bool isOffline;

  /// 本场的练习模式（`practice_sessions.practice_mode` 原值）。
  ///
  /// `null` = 还不知道（会话未建/未加载）：界面显示中性「其它练习」。
  /// **不要**给 `random` 默认值——从错题本、AI 题集、试卷进来的练习
  /// 会被它冒充成「随机练习」，断点也会跟着记错。
  final String? mode;

  const PracticeSessionState({
    this.sessionId,
    this.questions = const [],
    this.currentIndex = 0,
    this.userAnswers = const {},
    this.results = const {},
    this.correctAnswers = const {},
    this.explanations = const {},
    this.firstPrinciples = const {},
    this.isAnalyzingFirstPrinciples = false,
    this.firstPrinciplesError,
    this.isLoading = false,
    this.error,
    this.isOffline = false,
    this.mode,
  });

  PracticeSessionState copyWith({
    String? sessionId,
    List<Question>? questions,
    int? currentIndex,
    Map<String, List<String>>? userAnswers,
    Map<String, bool>? results,
    Map<String, String>? correctAnswers,
    Map<String, String>? explanations,
    Map<String, FirstPrinciplesResponse>? firstPrinciples,
    bool? isAnalyzingFirstPrinciples,
    String? firstPrinciplesError,
    bool? isLoading,
    String? error,
    bool? isOffline,
    String? mode,
  }) {
    return PracticeSessionState(
      sessionId: sessionId ?? this.sessionId,
      questions: questions ?? this.questions,
      currentIndex: currentIndex ?? this.currentIndex,
      userAnswers: userAnswers ?? this.userAnswers,
      results: results ?? this.results,
      correctAnswers: correctAnswers ?? this.correctAnswers,
      explanations: explanations ?? this.explanations,
      firstPrinciples: firstPrinciples ?? this.firstPrinciples,
      isAnalyzingFirstPrinciples:
          isAnalyzingFirstPrinciples ?? this.isAnalyzingFirstPrinciples,
      firstPrinciplesError: firstPrinciplesError,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      isOffline: isOffline ?? this.isOffline,
      mode: mode ?? this.mode,
    );
  }

  Question? get currentQuestion =>
      questions.isNotEmpty && currentIndex < questions.length
      ? questions[currentIndex]
      : null;

  double get progress =>
      questions.isEmpty ? 0 : (currentIndex + 1) / questions.length;

  bool get hasNext => currentIndex < questions.length - 1;
  bool get hasPrev => currentIndex > 0;
}
