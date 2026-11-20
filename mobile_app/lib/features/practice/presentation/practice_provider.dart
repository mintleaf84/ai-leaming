import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../../../core/auth/token_util.dart';
import '../../../core/error/user_message.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/practice_repository_impl.dart';
import '../domain/practice_repository.dart';
import '../domain/practice_resume.dart';
import '../domain/question.dart';
import '../domain/first_principles_response.dart';
import '../../history/presentation/history_provider.dart';
import '../../../shared/repositories/wrong_book_repository.dart';
import 'practice_resume_provider.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 防重复提交标志
bool _isSubmitting = false;

/// 练习会话状态
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
      isAnalyzingFirstPrinciples: isAnalyzingFirstPrinciples ?? this.isAnalyzingFirstPrinciples,
      firstPrinciplesError: firstPrinciplesError,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      isOffline: isOffline ?? this.isOffline,
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

  /// 会话代次：每次 createSession / reset 自增。
  ///
  /// 有返回栈之后会出现"退出 A 场、立刻开始 B 场"：A 的网络请求如果晚于 B 返回，
  /// 会把 B 的会话与题目覆盖掉（更糟的是清空 B 已产生的作答）。迟到的响应必须丢弃。
  int _sessionGeneration = 0;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  /// 本场**已落盘**的题号（`persisted=true` 的作答）。
  ///
  /// 断点只认这一份：`persisted=false` 的作答（离线入队失败）在服务端/本地
  /// 都没有记录，重启后必须回到那道题重练，不能被「已答过」挡在后面。
  final Set<String> _persistedQuestionIds = <String>{};

  /// 本场练习的模式，只用于写断点（后端目前只支持 `random`）。
  String _mode = 'random';

  /// 当前账号 id（`TokenUtil.userIdOf(jwt_token)`）：断点必须带归属，
  /// 否则账号 B 能接着做 A 的练习（review 二轮 3）。
  String? _userId;

  /// 旧格式断点留下的「已答数」连续前缀（新格式断点为 0）。
  ///
  /// 旧格式只有 `answered`、没有题号，恢复后 `answers` 为空；若落点仍按
  /// 「第一道未答题」算，重写断点会把进度覆盖成 0（review 二轮 2）。
  int _legacyAnswered = 0;

  @override
  PracticeSessionState build() => const PracticeSessionState();

  PracticeRepository get _repository => ref.read(practiceRepositoryProvider);

  /// 把当前进度写进断点（首页「继续上次练习」读它）。
  ///
  /// 只在**有会话且有题**时写：`reset()` 之后的空状态不该被写成一个断点。
  /// 写盘失败只打日志，不影响正在进行的练习。
  ///
  /// 写进去的是「已答题号 + 对错」与「第一道未答题的下标」，不是 `results.length`：
  /// 后者在跳题作答时会把恢复位置指到一道已经判过的题上，续练还会把真实进度
  /// 覆盖成 0（review A1/A2）。
  void _persistResume() {
    final sessionId = state.sessionId;
    if (sessionId == null || sessionId.isEmpty || state.questions.isEmpty) {
      return;
    }
    // 没有账号归属的断点不可恢复（读取时会因归属不匹配被丢弃），不写。
    final userId = _userId;
    if (userId == null) {
      return;
    }
    unawaited(
      ref
          .read(practiceResumeControllerProvider.notifier)
          .save(
            PracticeResume(
              sessionId: sessionId,
              answers: <ResumeAnswer>[
                for (final entry in state.results.entries)
                  if (_persistedQuestionIds.contains(entry.key))
                    ResumeAnswer(
                      questionId: entry.key,
                      isCorrect: entry.value,
                    ),
              ],
              nextIndex: _firstUnansweredIndex(),
              total: state.questions.length,
              mode: _mode,
              userId: userId,
              legacyAnswered: _legacyAnswered,
              savedAt: DateTime.now(),
            ),
          ),
    );
  }

  /// 第一道没有落盘作答的题的下标。
  ///
  /// 跳题作答（答了第 3 题、第 1 题没答）时这里返回 0——恢复后从真正没做的
  /// 题开始，而不是从「已答数」推出来的位置。
  ///
  /// 旧格式断点的连续前缀（[_legacyAnswered]）视为已答：从它往后找，
  /// 这样「恢复 → 立即落盘」不会把进度写回 0，用户答完前缀后的第一题才会越过它。
  int _firstUnansweredIndex() {
    for (var i = _legacyAnswered; i < state.questions.length; i++) {
      if (!_persistedQuestionIds.contains(state.questions[i].id)) {
        return i;
      }
    }
    // 全答完：停在最后一题（这场随即会被结果页清掉断点）
    return state.questions.length - 1;
  }

  /// 创建新会话
  Future<void> createSession({int limit = 10, String mode = 'random'}) async {
    final generation = ++_sessionGeneration;
    _mode = mode;
    state = state.copyWith(isLoading: true, error: null);

    try {
      final token = await _storage.read(key: 'jwt_token');
      if (generation != _sessionGeneration) return;
      if (token == null) {
        state = state.copyWith(isLoading: false, error: '请先登录');
        return;
      }
      _userId = TokenUtil.userIdOf(token);

      final sessionResponse = await _repository.createSession(
        limit: limit,
        mode: mode,
      );

      // 期间用户已退出/又开了新的一场：丢弃这次响应
      if (generation != _sessionGeneration) return;

      _persistedQuestionIds.clear();
      _legacyAnswered = 0;
      state = state.copyWith(
        isLoading: false,
        sessionId: sessionResponse.sessionId,
        questions: sessionResponse.questions,
        currentIndex: 0,
        userAnswers: {},
        results: {},
        correctAnswers: {},
        explanations: {},
        isOffline: sessionResponse.sessionId.startsWith('local_'),
      );

      _questionStartTime = DateTime.now();
      _persistResume();
    } catch (e) {
      if (generation != _sessionGeneration) return;
      // 原始异常只进日志，界面用统一文案（审计 #24）。
      debugPrint('[Practice] 创建练习失败: $e');
      state = state.copyWith(isLoading: false, error: userMessageOf(e));
    }
  }

  /// 把题干与选项拼成一段文本。
  ///
  /// 后端 `/practice/first-principles` 只用传入的字段构造 prompt，不会去查题库，
  /// 所以「下列说法正确的是？」这类题必须把 A/B/C/D 的正文一起带上，
  /// 否则模型无从解释为什么正确答案是 B。
  String _composeQuestionContent(Question question) {
    if (question.options.isEmpty) {
      return question.content;
    }
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    final buffer = StringBuffer(question.content)
      ..writeln()
      ..writeln();
    for (var i = 0; i < question.options.length; i++) {
      final label = i < labels.length ? labels[i] : '${i + 1}';
      buffer.writeln('$label. ${question.options[i]}');
    }
    return buffer.toString().trimRight();
  }

  /// 从服务端已有会话加载题目（错题本「开始练习」/ 首页「继续上次练习」用）
  /// 与 createSession 的差别：不新建会话，直接复用已经建好的那一场。
  ///
  /// [startIndex] 是续练的兜底起点（没有已答记录时用）。
  /// [answered] 是断点里持久化的已答记录：恢复时一并回填 `results`，
  /// 落点则取「第一道未答题」——比传进来的下标更准（跳题作答时两者不同）。
  Future<void> loadSession(
    String sessionId, {
    int startIndex = 0,
    List<ResumeAnswer> answered = const <ResumeAnswer>[],
    int legacyAnswered = 0,
  }) async {
    // 代次：`reset()` / 新的 createSession 已经让这次加载失效时，
    // 迟到的响应（含异常分支）必须整体丢弃，不能把旧会话写回来。
    final generation = ++_sessionGeneration;

    // 上一场可能还留在状态里（provider 不是 autoDispose）：先清空，
    // 避免加载失败时页面继续渲染旧题目/旧会话。
    state = const PracticeSessionState(isLoading: true);

    try {
      final token = await _storage.read(key: 'jwt_token');
      if (generation != _sessionGeneration) return;
      if (token == null) {
        state = state.copyWith(isLoading: false, error: '请先登录');
        return;
      }
      _userId = TokenUtil.userIdOf(token);
      // 旧格式断点没有题号，只有「已答数」这个连续前缀：落点必须从它往后算，
      // 否则恢复即落盘会把进度写回 0（review 二轮 2）。
      _legacyAnswered = legacyAnswered > 0 ? legacyAnswered : 0;

      final sessionResponse = await _repository.getSession(sessionId);
      if (generation != _sessionGeneration) return;

      final questions = sessionResponse.questions;
      // 只认这一场里真实存在的题号：断点可能来自题面已变（题被换掉）的会话，
      // 多出来的结果会把结果页的正确率算到题目总数之外。
      final questionIds = <String>{for (final q in questions) q.id};
      final restored = <String, bool>{
        for (final answer in answered)
          if (questionIds.contains(answer.questionId))
            answer.questionId: answer.isCorrect,
      };
      _persistedQuestionIds
        ..clear()
        ..addAll(restored.keys);

      state = state.copyWith(
        isLoading: false,
        sessionId: sessionResponse.sessionId,
        questions: questions,
        currentIndex: _resumeIndex(questions, restored.keys, startIndex),
        userAnswers: {},
        results: restored,
        correctAnswers: {},
        explanations: {},
        isOffline: sessionResponse.sessionId.startsWith('local_'),
      );

      _questionStartTime = DateTime.now();
      // 回填之后立刻重写一次断点：`results` 已经是「整场已答状态」，
      // 不会出现续练把已答数覆盖成 0 的情况（review A2）。
      _persistResume();
    } catch (e) {
      if (generation != _sessionGeneration) return;
      debugPrint('[Practice] 加载会话失败: $e');
      state = state.copyWith(isLoading: false, error: userMessageOf(e));
    }
  }

  /// 续练落点：第一道没有已答记录的题；没有已答记录时用传入的兜底下标。
  ///
  /// 扫描从 [_legacyAnswered] 之后开始：旧格式断点的「已答数」是一段连续前缀，
  /// 前缀里的题没有题号可比，只能按位置当作已答。
  int _resumeIndex(
    List<Question> questions,
    Iterable<String> answeredIds,
    int fallback,
  ) {
    if (questions.isEmpty) return 0;
    if (answeredIds.isNotEmpty) {
      for (var i = _legacyAnswered; i < questions.length; i++) {
        if (!answeredIds.contains(questions[i].id)) return i;
      }
      return questions.length - 1;
    }
    return fallback.clamp(0, questions.length - 1);
  }

  /// 切换选项（单选覆盖，多选 toggle）
  void toggleAnswer(String answer) {
    final question = state.currentQuestion;
    if (question == null) return;

    final newAnswers = Map<String, List<String>>.from(
      state.userAnswers.map((k, v) => MapEntry(k, List<String>.from(v))),
    );

    if (question.type == 'multi') {
      // 多选：toggle
      final current = List<String>.from(newAnswers[question.id] ?? []);
      if (current.contains(answer)) {
        current.remove(answer);
      } else {
        current.add(answer);
      }
      newAnswers[question.id] = current;
    } else {
      // 单选：直接覆盖
      newAnswers[question.id] = [answer];
    }

    state = state.copyWith(userAnswers: newAnswers);
  }

  /// 向后兼容的别名
  void selectAnswer(String answer) => toggleAnswer(answer);

  /// 提交当前题目答案 (服务端校验)
  Future<void> submitCurrentAnswer() async {
    // 防重复提交
    if (_isSubmitting) return;

    final question = state.currentQuestion;
    if (question == null || state.sessionId == null) return;

    final selectedList = state.userAnswers[question.id];
    if (selectedList == null || selectedList.isEmpty) return;

    // 单选取首个，多选排序后 JSON 序列化
    final String userAnswer;
    if (question.type == 'multi') {
      final sorted = List<String>.from(selectedList)..sort();
      userAnswer = jsonEncode(sorted);
    } else {
      userAnswer = selectedList.first;
    }

    final duration = _questionStartTime != null
        ? DateTime.now().difference(_questionStartTime!).inSeconds
        : 0;

    _isSubmitting = true;
    try {
      final response = await _repository.submitAnswer(
        sessionId: state.sessionId!,
        questionId: question.id,
        userAnswer: userAnswer,
        duration: duration,
        // 降级成本地会话时要记全整场题序，否则重启后续练只剩断网那一题。
        sessionQuestionIds: <String>[
          for (final q in state.questions) q.id,
        ],
      );

      // 从后端响应获取正确性和正确答案
      final isCorrect = response['isCorrect'] as bool;
      final correctAnswer = response['correctAnswer'] as String;
      // 中途断网降级：后续题目继续走本地判分，界面显示离线提示条
      final degradedToOffline = response['offline'] == true;
      // 已经是离线会话时不能被 false 覆盖回在线（本地会话首答就会触发）
      final nowOffline = degradedToOffline || state.isOffline;
      final persisted = response['persisted'] != false;

      // 降级后这场练习在服务端已经「断了」：后续作答必须直接走本地会话，
      // 断点也只能记 `local_<服务端会话 id>`——记服务端 id 的话，离线重启
      // 后 `getSession('agent_42')` 必然失败，续练直接不可用（review 二轮 4）。
      final serverSessionId = state.sessionId!;
      final nextSessionId =
          degradedToOffline && !serverSessionId.startsWith('local_')
          ? 'local_$serverSessionId'
          : serverSessionId;

      state = state.copyWith(
        isLoading: true,
        isOffline: nowOffline,
        sessionId: nextSessionId,
      );
      if (!persisted) {
        state = state.copyWith(error: '本次作答未能保存到本地，网络恢复后请重练此题');
      } else {
        // 只有真的落盘（服务端记录 / 本地队列）的作答才推进断点：
        // 没保存下来的那道题重启后必须能回到它（review A3）。
        _persistedQuestionIds.add(question.id);
      }
      // 错题总数随作答变化：首页角标必须能失效，否则永远停在旧数字（review B7）。
      ref.invalidate(wrongBookTotalProvider);
      String explanation = '';
      try {
        final detail = await _repository.getQuestionDetail(question.id);
        explanation = detail.explanation ?? '暂无权威解析';
      } catch (e) {
        explanation = '无法获取解析内容';
      }

      final newResults = Map<String, bool>.from(state.results);
      newResults[question.id] = isCorrect;

      final newCorrectAnswers = Map<String, String>.from(state.correctAnswers);
      newCorrectAnswers[question.id] = correctAnswer;

      final newExplanations = Map<String, String>.from(state.explanations);
      newExplanations[question.id] = explanation;

      state = state.copyWith(
        results: newResults,
        correctAnswers: newCorrectAnswers,
        explanations: newExplanations,
        isLoading: false,
      );
      // 已答数变了：断点跟着更新（杀进程后能接着这一题往后做）
      _persistResume();
    } catch (e) {
      // 静默失败，不影响用户体验
      debugPrint('提交答案失败: $e');
    } finally {
      _isSubmitting = false;
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

  /// 获取第一性原理分析
  Future<void> fetchFirstPrinciples(String questionId) async {
    final question = state.questions.firstWhere((q) => q.id == questionId);
    
    // 如果已经有缓存，则不再请求
    if (state.firstPrinciples.containsKey(questionId)) return;

    final selectedList = state.userAnswers[questionId];

    state = state.copyWith(isAnalyzingFirstPrinciples: true);

    try {
      final response = await _repository.analyzeFirstPrinciples(
        questionContent: _composeQuestionContent(question),
        correctAnswer: state.correctAnswers[questionId] ?? question.answer ?? '',
        explanation: question.explanation,
        wrongAnswer: (selectedList?.isNotEmpty ?? false)
            ? selectedList!.join(',')
            : null,
      );

      final newFirstPrinciples = Map<String, FirstPrinciplesResponse>.from(
        state.firstPrinciples,
      );
      newFirstPrinciples[questionId] = response;

      state = state.copyWith(
        firstPrinciples: newFirstPrinciples,
        isAnalyzingFirstPrinciples: false,
      );
    } catch (e) {
      // 失败原因落在面板专用字段上（成功/重试/换题时随 copyWith 清空），
      // 不污染整场练习共享的 `error`。
      debugPrint('[Practice] 获取第一性原理分析失败: $e');
      state = state.copyWith(
        isAnalyzingFirstPrinciples: false,
        firstPrinciplesError: '获取 AI 分析失败：${userMessageOf(e)}',
      );
    }
  }

  /// 重置会话
  void reset() {
    // 有没有「刚结束的一场」：决定首页要不要重新拉一次历史。
    final hadSession = state.sessionId != null && state.questions.isNotEmpty;
    // 让还在飞的 createSession / loadSession 失效，避免它们稍后把状态写回来
    _sessionGeneration++;
    _persistedQuestionIds.clear();
    _legacyAnswered = 0;
    state = const PracticeSessionState();
    // 这一场到此为止（结束/主动退出/换一场）：断点一并作废。
    // 首页据此隐藏「继续上次练习」，不会点进一个已经结束的会话。
    unawaited(ref.read(practiceResumeControllerProvider.notifier).clear());
    if (hadSession) {
      // 首页「最近练习」与错题数不能沿用练习前的列表：练习结束后重新拉一次，
      // 而不是把「列表非空」当成数据新鲜（review B6）。首页在 shell 的
      // IndexedStack 里不会重建，只能靠这份共享状态通知它。
      unawaited(ref.read(historyControllerProvider.notifier).loadHistory());
    }
  }
}

/// Provider (Riverpod 3.x pattern)
final practiceControllerProvider =
    NotifierProvider<PracticeController, PracticeSessionState>(
      PracticeController.new,
    );
