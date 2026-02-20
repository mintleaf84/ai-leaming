import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/datasources/api_client.dart';
import '../domain/question.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 练习会话状态
class PracticeSessionState {
  final String? sessionId;
  final List<Question> questions;
  final int currentIndex;
  final Map<int, String> userAnswers; // questionId -> userAnswer
  final Map<int, bool> results; // questionId -> isCorrect
  final bool isLoading;
  final String? error;

  const PracticeSessionState({
    this.sessionId,
    this.questions = const [],
    this.currentIndex = 0,
    this.userAnswers = const {},
    this.results = const {},
    this.isLoading = false,
    this.error,
  });

  PracticeSessionState copyWith({
    String? sessionId,
    List<Question>? questions,
    int? currentIndex,
    Map<int, String>? userAnswers,
    Map<int, bool>? results,
    bool? isLoading,
    String? error,
  }) {
    return PracticeSessionState(
      sessionId: sessionId ?? this.sessionId,
      questions: questions ?? this.questions,
      currentIndex: currentIndex ?? this.currentIndex,
      userAnswers: userAnswers ?? this.userAnswers,
      results: results ?? this.results,
      isLoading: isLoading ?? this.isLoading,
      error: error,
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

/// 练习会话控制器 (Riverpod 3.x Notifier pattern)
class PracticeController extends Notifier<PracticeSessionState> {
  DateTime? _questionStartTime;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  @override
  PracticeSessionState build() => const PracticeSessionState();

  ApiClient get _apiClient {
    final dio = ref.watch(dioProvider);
    return ApiClient(dio);
  }

  /// 创建新会话
  Future<void> createSession({int limit = 10}) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final token = await _storage.read(key: 'jwt_token');
      if (token == null) {
        state = state.copyWith(isLoading: false, error: '请先登录');
        return;
      }

      final response = await _apiClient.createSession({
        'mode': 'random',
        'limit': limit,
      });

      final sessionResponse = PracticeSessionResponse.fromJson(response);

      state = state.copyWith(
        isLoading: false,
        sessionId: sessionResponse.sessionId,
        questions: sessionResponse.questions,
        currentIndex: 0,
        userAnswers: {},
        results: {},
      );

      _questionStartTime = DateTime.now();
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 选择答案
  void selectAnswer(String answer) {
    final question = state.currentQuestion;
    if (question == null) return;

    final newAnswers = Map<int, String>.from(state.userAnswers);
    newAnswers[question.id] = answer;

    state = state.copyWith(userAnswers: newAnswers);
  }

  /// 提交当前题目答案 (服务端校验)
  Future<void> submitCurrentAnswer() async {
    final question = state.currentQuestion;
    if (question == null || state.sessionId == null) return;

    final userAnswer = state.userAnswers[question.id];
    if (userAnswer == null) return;

    final duration = _questionStartTime != null
        ? DateTime.now().difference(_questionStartTime!).inSeconds
        : 0;

    try {
      final response = await _apiClient.submitAnswer(state.sessionId!, {
        'questionId': question.id,
        'userAnswer': userAnswer,
        'duration': duration,
      });

      // 从后端响应获取正确性和正确答案
      final isCorrect = response['isCorrect'] as bool;
      // final correctAnswer = response['correctAnswer'] as String; // 可用于显示

      final newResults = Map<int, bool>.from(state.results);
      newResults[question.id] = isCorrect;

      state = state.copyWith(results: newResults);
    } catch (e) {
      // 静默失败，不影响用户体验
      debugPrint('提交答案失败: $e');
    }
  }

  /// 下一题
  void nextQuestion() {
    if (state.hasNext) {
      state = state.copyWith(currentIndex: state.currentIndex + 1);
      _questionStartTime = DateTime.now();
    }
  }

  /// 上一题
  void prevQuestion() {
    if (state.hasPrev) {
      state = state.copyWith(currentIndex: state.currentIndex - 1);
      _questionStartTime = DateTime.now();
    }
  }

  /// 重置会话
  void reset() {
    state = const PracticeSessionState();
  }
}

/// Provider (Riverpod 3.x pattern)
final practiceControllerProvider =
    NotifierProvider<PracticeController, PracticeSessionState>(
      PracticeController.new,
    );
