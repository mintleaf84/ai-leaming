import 'dart:async';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/state_views.dart';
import '../data/exam_repository.dart';
import '../domain/exam_attempt.dart';
import '../domain/exam_question.dart';
import '../domain/exam_submit_result.dart';
import 'exam_error_text.dart';
import 'widgets/exam_answer_sheet.dart';
import 'widgets/exam_dialogs.dart';
import 'widgets/exam_result_view.dart';
import 'widgets/exam_session_app_bar.dart';
import 'widgets/exam_session_question_pane.dart';

/// 限时作答 + 成绩单。
///
/// 为什么作答与成绩共用一个路由：交卷后如果 `replace` 到一条新路由，用户按返回
/// 会回到「已经交过卷的作答屏」，还得再处理一次「这场已经交了」。同一屏内切换
/// 状态最省事，也最不容易恢复出一个自相矛盾的栈。
///
/// 三条纪律：
/// 1. **倒计时只做展示**：`deadlineAt` 来自服务端，超时判定以交卷响应为准；
/// 2. **自动交卷只触发一次**：`_autoSubmitted` 一旦置位就不会再自动发；
/// 3. **同一份载荷只发一次**：失败重试重放冻结的 body 与 `clientKey`。
class ExamSessionScreen extends ConsumerStatefulWidget {
  const ExamSessionScreen({
    super.key,
    required this.sessionId,
    this.initialAttempt,
  });

  final String sessionId;

  /// 从预览页「开始作答」带过来的开场数据；深链接进来时为 null（再取一次）。
  final ExamAttempt? initialAttempt;

  @override
  ConsumerState<ExamSessionScreen> createState() => _ExamSessionScreenState();
}

class _ExamSessionScreenState extends ConsumerState<ExamSessionScreen>
    with WidgetsBindingObserver {
  final ScrollController _scrollController = ScrollController();

  ExamAttemptDetail? _detail;
  bool _loading = true;
  String? _loadError;

  int _index = 0;
  final Map<int, String> _answers = <int, String>{};

  /// 每道题第一次进入的时间，用来估算 `durationMs`（只影响统计，不影响判分）。
  final Map<int, DateTime> _enteredAt = <int, DateTime>{};

  ExamSubmitResult? _result;
  bool _submitting = false;
  String? _submitError;

  /// 交卷结果未知（超时/断网/5xx）时锁住作答：
  /// 重试发的仍是冻结的那份载荷，此时还允许改答案会让「屏上 A、服务端 B」。
  bool _editingLocked = false;
  bool _autoSubmitted = false;

  Duration? _remaining;
  Timer? _timer;

  /// 交卷载荷首次提交时冻结；重试原样重发。
  Map<String, dynamic>? _frozenPayload;
  late final String _clientKey;
  late final DateTime _startedAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startedAt = DateTime.now();
    // 幂等键：同一屏实例内稳定；不用 uuid 包（不新增依赖），时间戳 + 随机数足够
    // 避免同一毫秒内两次提交撞车。
    _clientKey =
        'exam_${_startedAt.microsecondsSinceEpoch}_'
        '${math.Random().nextInt(1 << 32)}';

    final attempt = widget.initialAttempt;
    if (attempt != null) {
      _applyDetail(
        ExamAttemptDetail(
          sessionId: attempt.sessionId.isEmpty
              ? widget.sessionId
              : attempt.sessionId,
          questions: attempt.questions,
          deadlineAt: attempt.deadlineAt,
        ),
        notify: false,
      );
    } else {
      // 放到微任务里：initState 期间不调 setState，与其它「挂载即发请求」的屏
      // 走同一条时序。
      unawaited(Future.microtask(_load));
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    // 切后台期间定时器可能被系统挂起：回到前台必须按服务端截止时间重新对表，
    // 否则「后台待了 10 分钟」回来还在显示 05:00。
    _syncRemaining();
  }

  ExamRepository get _repository => ref.read(examRepositoryProvider);

  List<ExamQuestion> get _questions => _detail?.questions ?? const [];

  ExamQuestion? get _currentQuestion {
    if (_index < 0 || _index >= _questions.length) return null;
    return _questions[_index];
  }

  String get _paperTitle => _detail?.paper?.title ?? '';

  bool get _isTimed => _detail?.deadlineAt != null;

  // ==================== 取数 ====================

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final detail = await _repository.getAttempt(widget.sessionId);
      if (!mounted) return;
      _applyDetail(detail);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = describeExamError(error);
      });
    }
  }

  void _applyDetail(ExamAttemptDetail detail, {bool notify = true}) {
    if (detail.result == null && detail.questions.isEmpty) {
      _loading = false;
      _loadError = '这场作答没有题目，可能是试卷已经被删除了。';
      if (notify && mounted) setState(() {});
      return;
    }
    _detail = detail;
    _answers
      ..clear()
      ..addAll(detail.answers);
    _result = detail.result;
    _loading = false;
    _loadError = null;

    // 回到第一道没作答的题：深链接回来时不要把用户丢在第 1 题。
    final firstUnanswered = detail.questions.indexWhere(
      (question) => (detail.answers[question.id] ?? '').trim().isEmpty,
    );
    _index = firstUnanswered < 0 ? 0 : firstUnanswered;

    _syncRemaining(startTimer: true, notify: notify);
    if (notify && mounted) setState(() {});
  }

  // ==================== 倒计时 ====================

  void _syncRemaining({bool startTimer = false, bool notify = true}) {
    final deadline = _detail?.deadlineAt;
    if (deadline == null || _result != null) {
      _timer?.cancel();
      _remaining = null;
      return;
    }
    final diff = deadline.difference(DateTime.now());
    _remaining = diff.isNegative ? Duration.zero : diff;
    if (startTimer) {
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(seconds: 1), (_) => _onTick());
    }
    if (_remaining == Duration.zero) {
      // 进来就已经超时：仍然给服务端一次提交机会（服务端接受超时提交，
      // 只是会带回 overtime）。放到帧后，避免 initState 里直接 setState。
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_submit(automatic: true));
      });
    } else if (notify && mounted) {
      setState(() {});
    }
  }

  void _onTick() {
    final current = _remaining;
    if (current == null || _result != null) return;
    final next = current - const Duration(seconds: 1);
    if (next <= Duration.zero) {
      _timer?.cancel();
      setState(() => _remaining = Duration.zero);
      unawaited(_submit(automatic: true));
      return;
    }
    setState(() => _remaining = next);
  }

  // ==================== 作答 ====================

  void _goTo(int index) {
    if (_questions.isEmpty) return;
    final next = index.clamp(0, _questions.length - 1);
    _enteredAt.putIfAbsent(_questions[next].id, DateTime.now);
    setState(() => _index = next);
    if (_scrollController.hasClients) _scrollController.jumpTo(0);
  }

  void _selectOption(ExamQuestion question, String label) {
    if (_submitting || _editingLocked || _result != null) return;
    if (!question.isMulti) {
      setState(() => _answers[question.id] = label);
      return;
    }
    final set = (_answers[question.id] ?? '')
        .split('')
        .where((item) => item.isNotEmpty)
        .toSet();
    if (set.contains(label)) {
      set.remove(label);
    } else {
      set.add(label);
    }
    final sorted = set.toList()..sort();
    setState(() {
      if (sorted.isEmpty) {
        _answers.remove(question.id);
      } else {
        _answers[question.id] = sorted.join();
      }
    });
  }

  void _setTyped(ExamQuestion question, String value) {
    if (_submitting || _editingLocked || _result != null) return;
    setState(() {
      if (value.trim().isEmpty) {
        // 输入框里只剩空格时视为未作答：交卷载荷不该出现一条空答案。
        _answers.remove(question.id);
      } else {
        _answers[question.id] = value;
      }
    });
  }

  int get _answeredCount => _questions
      .where((question) => (_answers[question.id] ?? '').trim().isNotEmpty)
      .length;

  // ==================== 交卷 ====================

  Future<void> _confirmSubmit() async {
    if (_questions.isEmpty || _submitting || _result != null) return;
    final unanswered = _questions.length - _answeredCount;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => ExamSubmitConfirmDialog(unanswered: unanswered),
    );
    if (confirmed != true || !mounted) return;
    await _submit();
  }

  Future<void> _submit({bool automatic = false}) async {
    if (_submitting || _result != null || _questions.isEmpty) return;
    if (automatic) {
      if (_autoSubmitted) return;
      _autoSubmitted = true;
    }

    setState(() {
      _submitting = true;
      _submitError = null;
    });

    final now = DateTime.now();
    final durations = <int, int>{
      for (final question in _questions)
        question.id: now
            .difference(_enteredAt[question.id] ?? _startedAt)
            .inMilliseconds,
    };
    final payload = _frozenPayload ??= buildExamSubmitBody(
      questions: _questions,
      answers: _answers,
      durationsMs: durations,
      clientKey: _clientKey,
    );

    try {
      final result = await _repository.submitPayload(widget.sessionId, payload);
      if (!mounted) return;
      _timer?.cancel();
      setState(() {
        _submitting = false;
        _result = result;
        _remaining = null;
      });
    } catch (error) {
      if (!mounted) return;
      // 服务端明确拒绝（400/422）说明这份载荷作废：允许下一次用新的答案重建。
      // 超时/5xx/断网属于「不知道结果」，必须继续重放同一份，否则可能重复计分。
      final status = error is DioException ? error.response?.statusCode : null;
      if (status == 400 || status == 422) {
        _frozenPayload = null;
        _editingLocked = false;
      } else {
        // 结果未知：锁答案，重试重放同一份载荷。
        _editingLocked = true;
      }
      final message = describeExamError(error);
      setState(() {
        _submitting = false;
        _submitError = message;
      });
      if (automatic) {
        unawaited(_showAutoSubmitFailure(message));
      }
    }
  }

  Future<void> _showAutoSubmitFailure(String message) async {
    final retry = await showDialog<bool>(
      context: context,
      builder: (_) => ExamAutoSubmitFailureDialog(message: message),
    );
    if (retry == true && mounted) {
      await _submit();
    }
  }

  // ==================== 离开 ====================

  Future<void> _confirmLeave() async {
    if (_submitting) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('正在交卷，稍等一下。'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }
    if (_result != null) {
      context.backOrHome();
      return;
    }
    final leave = await showDialog<bool>(
      context: context,
      builder: (_) => const ExamLeaveConfirmDialog(),
    );
    if (leave == true && mounted) context.backOrHome();
  }

  Future<void> _openAnswerSheet() async {
    if (_submitting) return;
    final picked = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: context.colors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20.r)),
      ),
      builder: (_) => ExamAnswerSheet(
        questions: _questions,
        answers: _answers,
        currentIndex: _index,
      ),
    );
    if (picked != null && mounted) _goTo(picked);
  }

  void _retryWrong() {
    final wrong = _result?.wrongCount ?? 0;
    if (wrong <= 0) return;
    // 错题已经落进错题本（交卷写 practice_logs / origin=exam），
    // 走服务端的 wrong 模式真正只练错题；limit 取本次错题数，最多 50。
    context.replace(
      AppRoutes.practice,
      extra: <String, dynamic>{'mode': 'wrong', 'limit': wrong.clamp(1, 50)},
    );
  }

  // ==================== 渲染 ====================

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final result = _result;

    return PopScope(
      canPop: result != null,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        unawaited(_confirmLeave());
      },
      child: Scaffold(
        backgroundColor: colors.background,
        appBar: ExamSessionAppBar(
          colors: colors,
          title: result != null
              ? '成绩单'
              : (_paperTitle.isNotEmpty
                    ? _paperTitle
                    : (_isTimed ? '限时作答' : '作答')),
          hasResult: result != null,
          showSubmit: result == null && !_loading && _loadError == null,
          submitting: _submitting,
          timed: _isTimed,
          remaining: _remaining,
          onLeading: () {
            if (result != null) {
              context.backOrHome();
            } else {
              unawaited(_confirmLeave());
            }
          },
          onSubmit: _confirmSubmit,
        ),
        body: _buildBody(colors),
      ),
    );
  }

  Widget _buildBody(AppColors colors) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_loadError != null) {
      return AppErrorView(
        message: _loadError!,
        onRetry: _load,
        secondaryLabel: '返回',
        onSecondary: () => context.backOrHome(),
      );
    }
    final result = _result;
    if (result != null) {
      return ExamResultView(
        result: result,
        questions: _questions,
        answers: _answers,
        onRetryWrong: result.wrongCount > 0 ? _retryWrong : null,
        onBack: () => context.backOrHome(),
      );
    }
    final question = _currentQuestion;
    if (question == null) {
      return AppErrorView(
        message: '这场的题目取不到了。',
        onRetry: _load,
        secondaryLabel: '返回',
        onSecondary: () => context.backOrHome(),
      );
    }

    return ExamSessionQuestionPane(
      colors: colors,
      index: _index,
      total: _questions.length,
      answeredCount: _answeredCount,
      question: question,
      selected: _answers[question.id] ?? '',
      scrollController: _scrollController,
      submitting: _submitting,
      submitError: _submitError,
      editingLocked: _editingLocked,
      onSelectOption: _selectOption,
      onTyped: _setTyped,
      onGoTo: _goTo,
      onOpenAnswerSheet: _openAnswerSheet,
      onConfirmSubmit: _confirmSubmit,
    );
  }
}
