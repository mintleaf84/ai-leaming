import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../practice/data/practice_repository_impl.dart';
import '../../practice/domain/practice_repository.dart';
import '../data/agent_sets_repository.dart';
import '../domain/agent_judge.dart';
import '../domain/agent_question.dart';
import '../domain/agent_question_set.dart';
import '../domain/agent_set_detail.dart';
import 'agent_sets_error_text.dart';

/// 练习屏的阶段。
enum AgentSetPracticePhase {
  /// 正在取详情 / 建练习会话。
  loading,

  /// 有一道可做的题。
  ready,

  /// 这套题已经做完了（或可做的题都在这轮做完了）。
  finished,

  /// 首屏加载失败。
  error,
}

/// 练习屏状态（不可变快照）。
class AgentSetPracticeState {
  final AgentSetPracticePhase phase;
  final int setId;
  final AgentQuestionSet? set;

  /// 本次练习的服务端会话号；`finished` / 加载失败时为 null。
  final String? sessionId;

  /// 这一轮还能做的题。报错移出的题会从这里消失（不用重新拉详情）。
  final List<AgentQuestion> questions;

  final int index;

  /// 当前题已勾选的选项字母（多选多个，单选至多一个）。
  final Set<String> selected;

  /// 当前题的判分结果；null 表示还没交这一题。
  final AgentJudgeOutcome? outcome;

  /// 提交判分中：按钮禁用，避免同一题被交两次。
  final bool submitting;

  final bool flagging;
  final bool promoting;
  final bool creatingPaper;

  /// 本轮已答题数 / 答对数（完成态与进度文案用）。
  final int answeredCount;
  final int correctCount;

  /// 这批里已被标「有问题」移出的题数（详情 `flaggedCount`，本轮标错会 +1）。
  final int flaggedCount;

  final String? loadError;

  /// 报错 / 转正 / 成卷失败的可读原因：就地展示，不接管整屏。
  final String? actionError;

  const AgentSetPracticeState({
    this.phase = AgentSetPracticePhase.loading,
    this.setId = 0,
    this.set,
    this.sessionId,
    this.questions = const <AgentQuestion>[],
    this.index = 0,
    this.selected = const <String>{},
    this.outcome,
    this.submitting = false,
    this.flagging = false,
    this.promoting = false,
    this.creatingPaper = false,
    this.answeredCount = 0,
    this.correctCount = 0,
    this.flaggedCount = 0,
    this.loadError,
    this.actionError,
  });

  AgentQuestion? get current {
    if (index < 0 || index >= questions.length) return null;
    return questions[index];
  }

  int get total => questions.length;

  /// 当前是第几题（从 1 开始）；没有题时为 0。
  int get position => current == null ? 0 : index + 1;

  bool get isLastQuestion => index >= questions.length - 1;

  /// 是否已判分（判分后面板锁定，只能「下一题」）。
  bool get isJudged => outcome != null;

  bool get canSubmit => !isJudged && selected.isNotEmpty && !submitting;

  /// 进度条：按「已答 / 本轮题数」走，而不是按下标——中途报错移出一题后，
  /// 下标会跳过一格，用下标会让进度条突然前跳。
  double get progress {
    if (total == 0) return 0;
    return (answeredCount / total).clamp(0.0, 1.0);
  }

  /// 剩余可做（含当前题）。
  int get remaining => total - answeredCount;

  AgentSetPracticeState copyWith({
    AgentSetPracticePhase? phase,
    AgentQuestionSet? set,
    String? sessionId,
    List<AgentQuestion>? questions,
    int? index,
    Set<String>? selected,
    AgentJudgeOutcome? outcome,
    bool clearOutcome = false,
    bool? submitting,
    bool? flagging,
    bool? promoting,
    bool? creatingPaper,
    int? answeredCount,
    int? correctCount,
    int? flaggedCount,
    String? loadError,
    String? actionError,
    bool clearActionError = false,
  }) {
    return AgentSetPracticeState(
      phase: phase ?? this.phase,
      setId: setId,
      set: set ?? this.set,
      sessionId: sessionId ?? this.sessionId,
      questions: questions ?? this.questions,
      index: index ?? this.index,
      selected: selected ?? this.selected,
      outcome: clearOutcome ? null : (outcome ?? this.outcome),
      submitting: submitting ?? this.submitting,
      flagging: flagging ?? this.flagging,
      promoting: promoting ?? this.promoting,
      creatingPaper: creatingPaper ?? this.creatingPaper,
      answeredCount: answeredCount ?? this.answeredCount,
      correctCount: correctCount ?? this.correctCount,
      flaggedCount: flaggedCount ?? this.flaggedCount,
      loadError: loadError ?? this.loadError,
      actionError: clearActionError ? null : (actionError ?? this.actionError),
    );
  }
}

/// 题集练习控制器。
///
/// 流程（契约 §4.2）：
/// 1. `GET /agent-sets/{id}` 拿题集与题目（不含答案）；
/// 2. `POST /agent-sets/{id}/attempts` 建一场 `practice_mode='agent_set'` 的会话；
/// 3. 逐题 `POST /practice/session/{sessionId}/submit` 判分（复用练习的判分入口，
///    断网降级也由它负责——题集页不另写一套判分）；
/// 4. 「这题有问题」→ `flag`，服务端立即移除该题并回剩余题数；
/// 5. 「一键成卷」/「转正入库」→ 成功后由界面跳转/提示，列表页返回时重拉。
class AgentSetPracticeController extends Notifier<AgentSetPracticeState> {
  AgentSetPracticeController(this.setId);

  final int setId;

  /// 建会话的闸：双击「开始练习」不能开两场（服务端每调一次都是一场新会话）。
  bool _opening = false;

  DateTime? _questionStart;

  @override
  AgentSetPracticeState build() {
    Future.microtask(load);
    return AgentSetPracticeState(setId: setId);
  }

  AgentSetsRepository get _repository => ref.read(agentSetsRepositoryProvider);

  /// 判分走练习的仓库：这条入口同时负责服务端判分与断网降级，
  /// 题集页重复实现一套会让「判分口径」出现两个事实源。
  PracticeRepository get _practiceRepository =>
      ref.read(practiceRepositoryProvider);

  Future<void> load() async {
    if (_opening) return;
    _opening = true;
    _set(
      AgentSetPracticeState(phase: AgentSetPracticePhase.loading, setId: setId),
    );
    try {
      final detail = await _repository.getSet(setId);
      if (!ref.mounted) return;

      // 已经做完（或可做的题都被报错移出了）：不再建空会话。
      if (detail.remainingCount <= 0 || detail.questions.isEmpty) {
        _set(
          state.copyWith(
            phase: AgentSetPracticePhase.finished,
            set: detail.set,
            questions: detail.questions,
            flaggedCount: detail.flaggedCount,
            clearActionError: true,
          ),
        );
        return;
      }

      final attempt = await _repository.startAttempt(setId);
      if (!ref.mounted) return;
      if (!attempt.hasSession) {
        // 没有会话号就没有判分入口：宁可报错，也不要让用户对着题目做完了
        // 才发现答案存不下来。
        _set(
          state.copyWith(
            phase: AgentSetPracticePhase.error,
            set: detail.set,
            loadError: '服务器没有返回练习会话，稍后再试。',
          ),
        );
        return;
      }

      final questions = attempt.questions.isNotEmpty
          ? attempt.questions
          : detail.questions;
      _questionStart = DateTime.now();
      _set(
        state.copyWith(
          phase: AgentSetPracticePhase.ready,
          set: detail.set,
          sessionId: attempt.sessionId,
          questions: questions,
          flaggedCount: detail.flaggedCount,
          index: 0,
          selected: const <String>{},
          clearOutcome: true,
          clearActionError: true,
        ),
      );
    } catch (error) {
      if (!ref.mounted) return;
      _set(
        state.copyWith(
          phase: AgentSetPracticePhase.error,
          loadError: describeAgentSetsError(error),
        ),
      );
    } finally {
      _opening = false;
    }
  }

  /// 勾选 / 取消一个选项。判分后锁死（改答案等于改判分结果）。
  void toggleOption(String label) {
    final question = state.current;
    if (question == null || state.isJudged || state.submitting) return;
    final next = Set<String>.from(state.selected);
    if (question.isMulti) {
      if (!next.remove(label)) next.add(label);
    } else {
      next
        ..clear()
        ..add(label);
    }
    _set(state.copyWith(selected: next));
  }

  /// 交当前题，拿服务端判分。
  Future<void> submitCurrent() async {
    final question = state.current;
    final sessionId = state.sessionId;
    if (question == null || sessionId == null) return;
    if (!state.canSubmit) return;

    final selected = state.selected.toList()..sort();
    // 多选提交值是 JSON 数组字符串（与练习页同一口径）；单选直接给字母。
    final userAnswer = question.isMulti ? jsonEncode(selected) : selected.first;
    final duration = _questionStart == null
        ? 0
        : DateTime.now().difference(_questionStart!).inSeconds;

    _set(state.copyWith(submitting: true, clearActionError: true));
    try {
      final response = await _practiceRepository.submitAnswer(
        sessionId: sessionId,
        questionId: question.idString,
        userAnswer: userAnswer,
        duration: duration,
        // 断网降级要靠整场题序重建本地会话；只给当前题会让续练只剩一题。
        sessionQuestionIds: <String>[
          for (final item in state.questions) item.idString,
        ],
      );
      if (!ref.mounted) return;
      final outcome = AgentJudgeOutcome.fromResponse(response);
      _set(
        state.copyWith(
          submitting: false,
          outcome: outcome,
          answeredCount: state.answeredCount + 1,
          correctCount: state.correctCount + (outcome.isCorrect ? 1 : 0),
        ),
      );
    } catch (error) {
      if (!ref.mounted) return;
      _set(
        state.copyWith(
          submitting: false,
          actionError: describeAgentSetAnswerError(error),
        ),
      );
    }
  }

  /// 去下一题；已经是最后一题时进入完成态。
  void next() {
    if (!state.isJudged) return;
    if (state.isLastQuestion) {
      _set(
        state.copyWith(
          phase: AgentSetPracticePhase.finished,
          clearOutcome: true,
          selected: const <String>{},
        ),
      );
      return;
    }
    _questionStart = DateTime.now();
    _set(
      state.copyWith(
        index: state.index + 1,
        selected: const <String>{},
        clearOutcome: true,
        clearActionError: true,
      ),
    );
  }

  /// 「这题有问题」：移除当前题。成功返回剩余题数（界面据此提示）。
  Future<int?> flagCurrent({String? reason}) async {
    final question = state.current;
    if (question == null || state.flagging) return null;
    _set(state.copyWith(flagging: true, clearActionError: true));
    try {
      final result = await _repository.flagQuestion(
        setId,
        question.id,
        reason: reason,
      );
      if (!ref.mounted) return result.remaining;
      final remainingQuestions = <AgentQuestion>[
        for (final item in state.questions)
          if (item.id != question.id) item,
      ];
      final nextIndex = state.index >= remainingQuestions.length
          ? remainingQuestions.length - 1
          : state.index;
      final remaining = result.remaining ?? remainingQuestions.length;
      final sets = state.set;
      _set(
        state.copyWith(
          flagging: false,
          questions: remainingQuestions,
          flaggedCount: state.flaggedCount + 1,
          index: nextIndex < 0 ? 0 : nextIndex,
          selected: const <String>{},
          clearOutcome: true,
          set: sets?.copyWith(
            questionCount: sets.questionCount > 0
                ? sets.questionCount - 1
                : sets.questionCount,
            pendingCount: remaining,
          ),
          // 移出最后一题：本轮没有题可做了，直接进完成态。
          phase: remainingQuestions.isEmpty
              ? AgentSetPracticePhase.finished
              : state.phase,
        ),
      );
      return remaining;
    } catch (error) {
      if (!ref.mounted) return null;
      _set(
        state.copyWith(
          flagging: false,
          actionError: describeAgentSetsError(error),
        ),
      );
      return null;
    }
  }

  /// 转正入库。成功返回服务端结果（界面据此提示题数），失败返回 null。
  Future<AgentPromoteResult?> promote() async {
    if (state.promoting) return null;
    _set(state.copyWith(promoting: true, clearActionError: true));
    try {
      final result = await _repository.promote(setId);
      if (!ref.mounted) return result;
      final sets = state.set;
      _set(
        state.copyWith(
          promoting: false,
          set: sets?.copyWith(status: result.promoted ? 'promoted' : null),
        ),
      );
      return result;
    } catch (error) {
      if (!ref.mounted) return null;
      _set(
        state.copyWith(
          promoting: false,
          actionError: describeAgentSetsError(error),
        ),
      );
      return null;
    }
  }

  /// 一键成卷。成功返回新试卷（界面据此跳到试卷预览），失败返回 null。
  Future<AgentSetPaper?> createPaper() async {
    if (state.creatingPaper) return null;
    _set(state.copyWith(creatingPaper: true, clearActionError: true));
    try {
      final paper = await _repository.createPaper(setId);
      if (!ref.mounted) return paper;
      _set(state.copyWith(creatingPaper: false));
      return paper;
    } catch (error) {
      if (!ref.mounted) return null;
      _set(
        state.copyWith(
          creatingPaper: false,
          actionError: describeAgentSetsError(error),
        ),
      );
      return null;
    }
  }

  /// 清掉上一次的操作失败提示（用户点了「知道了」或开始下一步）。
  void clearActionError() {
    if (state.actionError == null) return;
    _set(state.copyWith(clearActionError: true));
  }

  void _set(AgentSetPracticeState next) {
    if (!ref.mounted) return;
    state = next;
  }
}

/// 练习屏控制器（按题集 id 分家）。
///
/// `autoDispose`：退出就要丢——下次进来必须重新建会话，否则会拿着上一场
/// 已经提交过的会话继续判分（服务端会按会话记账，重复提交等于重复计数）。
final agentSetPracticeControllerProvider = NotifierProvider.autoDispose
    .family<AgentSetPracticeController, AgentSetPracticeState, int>(
      AgentSetPracticeController.new,
    );
