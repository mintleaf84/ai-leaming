import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/recall_repository.dart';
import '../domain/recall_answer_alignment.dart';
import '../domain/recall_card.dart';
import '../domain/recall_preview.dart';
import '../domain/recall_queue.dart';
import '../domain/recall_review.dart';

/// 回忆自测的界面阶段。
///
/// `queueReady` 是移动端独有的「今天」屏：先把 due/fresh/总张数/估时/连续天数摊开，
/// 用户点「开始」才进第一张。web 端冷启动直接取卡是为了桌面端的连续阅读，手机上一屏
/// 只能看一件事，先给一眼总量再进卡更不容易误触。
enum RecallPhase {
  /// 还没开始取数（首帧）。
  idle,

  /// 正在取今日队列。
  loadingQueue,

  /// 队列已就绪，等用户点「开始 / 继续」。
  queueReady,

  /// 正在取下一张卡的详情（含 `mode` / `pendingItems`）。
  loadingCard,

  /// 作答屏。
  question,

  /// 判分屏（含提交中、提交失败、已出结论三种子态）。
  judge,

  /// 本次队列已全部作答。
  done,

  /// 今天确实没有卡。
  empty,

  /// 加载失败（队列或卡片），可重试。
  error,
}

/// 回忆自测的界面状态（不可变快照）。
///
/// 状态机只在这里与 [RecallSessionController] 里推进；屏只读它、只发意图。
class RecallSessionState {
  final RecallPhase phase;

  /// 今日队列快照；未取到时为 null。
  final RecallQueue? queue;

  /// 当前卡片；作答/判分阶段非空。
  final RecallCard? card;

  /// 还没作答的卡片主键（第一个就是当前卡）。
  final List<int> pending;

  /// 作答原文。
  final String typed;

  /// 判分屏呈现的卡内下标（顺序即输入顺序）；作答屏为空。
  final List<int> presented;

  /// 本机预判（`previewVerdicts` 的结果），改判标记以它为基准。
  final List<RecallVerdict> algoVerdicts;

  /// 用户改判后的最终判定，与 [presented] 同序。
  final List<RecallVerdict> finalVerdicts;

  /// 本次提交的结论；未提交或提交失败时为 null。
  final RecallReviewResult? result;

  /// 上一张卡的结论文案（「下次 11 月 20 日」），只在作答屏顶部回显。
  final String? lastNote;

  /// 上一张卡要重测的条目下标；完成屏据此显示「明天只重测这 N 条」。
  final List<int>? lastPendingItems;

  /// 加载失败的可读原因。
  final String? errorMessage;

  /// 提交失败的可读原因（结果未知，需要重试）。
  final String? submitError;

  /// 提交进行中：禁改判、禁重复提交。
  final bool submitting;

  /// 提交结果未知：判定锁住，重试只能重放同一份载荷。
  final bool retryLocked;

  /// 归档进行中。
  final bool archiving;

  const RecallSessionState({
    this.phase = RecallPhase.idle,
    this.queue,
    this.card,
    this.pending = const [],
    this.typed = '',
    this.presented = const [],
    this.algoVerdicts = const [],
    this.finalVerdicts = const [],
    this.result,
    this.lastNote,
    this.lastPendingItems,
    this.errorMessage,
    this.submitError,
    this.submitting = false,
    this.retryLocked = false,
    this.archiving = false,
  });

  /// 今日总量（以队列为准）。
  int get total => queue?.total ?? pending.length;

  /// 已完成张数（顶部进度条用）。
  int get doneCount => (total - pending.length).clamp(0, total);

  /// 填空卡：作答按空切开后的文本，与判分屏条目同序。
  List<String> get segments => segmentAnswer(typed, presented.length);

  /// 判定是否锁死（提交中 / 已出结论 / 结果未知）。
  bool get verdictLocked => submitting || retryLocked || result != null;

  RecallSessionState copyWith({
    RecallPhase? phase,
    RecallQueue? queue,
    RecallCard? card,
    bool clearCard = false,
    List<int>? pending,
    String? typed,
    List<int>? presented,
    List<RecallVerdict>? algoVerdicts,
    List<RecallVerdict>? finalVerdicts,
    RecallReviewResult? result,
    bool clearResult = false,
    String? lastNote,
    List<int>? lastPendingItems,
    String? errorMessage,
    bool clearError = false,
    String? submitError,
    bool clearSubmitError = false,
    bool? submitting,
    bool? retryLocked,
    bool? archiving,
  }) {
    return RecallSessionState(
      phase: phase ?? this.phase,
      queue: queue ?? this.queue,
      card: clearCard ? null : (card ?? this.card),
      pending: pending ?? this.pending,
      typed: typed ?? this.typed,
      presented: presented ?? this.presented,
      algoVerdicts: algoVerdicts ?? this.algoVerdicts,
      finalVerdicts: finalVerdicts ?? this.finalVerdicts,
      result: clearResult ? null : (result ?? this.result),
      lastNote: lastNote ?? this.lastNote,
      lastPendingItems: lastPendingItems ?? this.lastPendingItems,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      submitError: clearSubmitError ? null : (submitError ?? this.submitError),
      submitting: submitting ?? this.submitting,
      retryLocked: retryLocked ?? this.retryLocked,
      archiving: archiving ?? this.archiving,
    );
  }
}

/// 状态机 + 提交纪律（规格 §1.4 / §4.1–§4.3）。
///
/// 三条不变量在这里用结构保证，而不是靠调用方自觉：
///
/// 1. **一次作答只提交一次**：进入判分屏时构造唯一的 [RecallReviewDraft]，
///    改判只改 `overrides`，随那一次提交上送。没有"先提交拿结果、改判再提交"的路径。
/// 2. **同一 `clientKey` = 同一份载荷**：`toPayload()` 首次调用即冻结，
///    失败重试只重放这份 map；要换 key 必须显式 `reset()`，而这里从不调用它。
/// 3. **结果未知时锁判定**：`retryLocked` 期间改判入口全部关闭，避免"屏上显示 A、
///    服务端按 key 重放 B"。
class RecallSessionController extends Notifier<RecallSessionState> {
  /// 本轮作答的草稿（进入判分屏时构造一次）。
  RecallReviewDraft? _draft;

  /// 已冻结的提交载荷；失败重试原样重发这一份。
  Map<String, dynamic>? _frozenPayload;

  /// 备份载荷对应的提交方式（决定成功后要不要把判定全刷成「没写」）。
  bool _submittedAllBlank = false;

  /// 答题轮次令牌：换队列 / 换卡即 +1。
  ///
  /// `await` 之前捕获它，回来先比对——不一致说明结果属于上一轮（用户已经换卡了），
  /// 写进新卡会把旧结论、旧幂等键和重试引用带过去。
  int _round = 0;

  @override
  RecallSessionState build() => const RecallSessionState();

  RecallRepository get _repository => ref.read(recallRepositoryProvider);

  // ==================== 取数 ====================

  /// 取今日队列（冷启动与「刷新」共用）。
  Future<void> loadQueue() async {
    final round = ++_round;
    _draft = null;
    _frozenPayload = null;
    _submittedAllBlank = false;
    state = RecallSessionState(
      phase: RecallPhase.loadingQueue,
      queue: state.queue,
    );

    try {
      final queue = await _repository.getQueue();
      if (!ref.mounted || round != _round) return;

      if (queue.total > 0 && queue.isEmpty) {
        // 有卡却没有编号：契约被破坏。宁可报错，也不能显示成「今天没有卡」——
        // 那会让用户以为已经做完，直接丢掉今天的复习量。
        state = RecallSessionState(
          phase: RecallPhase.error,
          queue: queue,
          errorMessage: '今日队列缺少卡片编号，请稍后重试。',
        );
        return;
      }

      if (queue.isEmpty) {
        state = RecallSessionState(phase: RecallPhase.empty, queue: queue);
        return;
      }

      state = RecallSessionState(
        phase: RecallPhase.queueReady,
        queue: queue,
        pending: queue.ids,
      );
    } catch (error) {
      if (!ref.mounted || round != _round) return;
      state = RecallSessionState(
        phase: RecallPhase.error,
        queue: state.queue,
        errorMessage: describeRecallError(error),
      );
    }
  }

  /// 从「今天」屏进入第一张卡。
  Future<void> start() async {
    if (state.pending.isEmpty) {
      await loadQueue();
      return;
    }
    await _loadCard(state.pending.first);
  }

  /// 错误态重试：按出错位置分派（队列取不到就重取队列，卡取不到就重取当前卡）。
  Future<void> retryLoad() async {
    final current = state.card;
    final hasPending = state.pending.isNotEmpty;
    if (hasPending && current == null) {
      await _loadCard(state.pending.first);
      return;
    }
    await loadQueue();
  }

  Future<void> _loadCard(int cardId) async {
    final round = _round;
    state = state.copyWith(
      phase: RecallPhase.loadingCard,
      clearCard: true,
      typed: '',
      presented: const [],
      algoVerdicts: const [],
      finalVerdicts: const [],
      clearResult: true,
      clearSubmitError: true,
      submitting: false,
      retryLocked: false,
      clearError: true,
    );
    _draft = null;
    _frozenPayload = null;
    _submittedAllBlank = false;

    try {
      final card = await _repository.getCard(cardId);
      if (!ref.mounted || round != _round) return;
      state = state.copyWith(phase: RecallPhase.question, card: card);
    } catch (error) {
      if (!ref.mounted || round != _round) return;
      state = state.copyWith(
        phase: RecallPhase.error,
        errorMessage: describeRecallError(error),
      );
    }
  }

  // ==================== 作答 ====================

  /// 记录作答原文（作答屏每次按键调用）。
  void setTyped(String value) {
    if (state.phase != RecallPhase.question) return;
    state = state.copyWith(typed: value);
  }

  /// 作答屏 → 判分屏：本地预判一次，并定下这次提交的幂等键。
  ///
  /// 幂等键必须在这里（而不是点「确认结果」时）定下来：用户可能在判分屏停留很久、
  /// 期间网络断过一次，key 一变服务端就会当成第二次作答，进度被推进两次。
  void reveal() {
    final card = state.card;
    if (card == null || state.phase != RecallPhase.question) return;

    final preview = previewVerdicts(card, state.typed);
    _draft = RecallReviewDraft(cardId: card.cardId, typed: state.typed);
    _frozenPayload = null;
    _submittedAllBlank = false;

    state = state.copyWith(
      phase: RecallPhase.judge,
      presented: preview.presented,
      algoVerdicts: preview.verdicts,
      finalVerdicts: preview.verdicts,
      clearResult: true,
      clearSubmitError: true,
      retryLocked: false,
      submitting: false,
    );
  }

  /// 点一条改判（参数是**屏上位置**）。
  ///
  /// 三种情况一律拒绝：提交中（请求已带着点击那一刻的判定发出去了）、已出结论、
  /// 结果未知（锁判定）。拒绝而不是排队：界面与已落库的结论必须一致。
  void toggleVerdict(int position) {
    if (state.phase != RecallPhase.judge) return;
    if (state.verdictLocked) return;
    if (position < 0 || position >= state.finalVerdicts.length) return;

    final next = List<RecallVerdict>.from(state.finalVerdicts);
    next[position] = next[position].isOk
        ? RecallVerdict.miss
        : RecallVerdict.ok;
    state = state.copyWith(finalVerdicts: List.unmodifiable(next));
  }

  /// 提交（`allBlank == false` 走改判，`true` 走「全没想起」）。
  ///
  /// 结果未知时只重放首次那份载荷：服务端按 `clientKey` 回放首次结果，
  /// 换方式重发会让「服务端记的」和「界面显示的」不一致。
  Future<void> submit({required bool allBlank}) {
    return _submit(allBlank: allBlank);
  }

  /// 作答屏直接「全没想起」：跳过展示预判，直接按全部没写提交。
  ///
  /// 仍然走 [reveal] → [_submit]：幂等键、冻结载荷、判分屏的逐条呈现三件事
  /// 都保持不变，只是用户没看到中间那半拍。失败时人落在判分屏（能看到参考条目），
  /// 比停在作答屏干等更有用。
  Future<void> submitAllBlankFromQuestion() async {
    if (state.phase != RecallPhase.question) return;
    reveal();
    await _submit(allBlank: true);
  }

  Future<void> _submit({required bool allBlank}) async {
    if (state.phase != RecallPhase.judge) return;
    if (state.submitting) return;

    // 结果未知：只允许重放同一份载荷
    if (state.retryLocked) {
      final payload = _frozenPayload;
      if (payload == null) return;
      return _send(payload, allBlank: _submittedAllBlank);
    }

    if (state.result != null) return;

    final draft = _draft;
    if (draft == null) return;

    if (!draft.isFrozen) {
      if (allBlank) {
        draft.setAllBlank(true);
        // allBlank 与 overrides 互斥：全没想起时服务端忽略改判，发了只是噪音
        draft.setOverrides(const []);
      } else {
        draft.setAllBlank(false);
        draft.setOverrides(
          buildOverrides(
            state.presented,
            state.finalVerdicts,
            algoVerdicts: state.algoVerdicts,
          ),
        );
      }
    }

    final payload = draft.toPayload();
    _frozenPayload = payload;
    _submittedAllBlank = allBlank;
    return _send(payload, allBlank: allBlank);
  }

  Future<void> _send(
    Map<String, dynamic> payload, {
    required bool allBlank,
  }) async {
    final round = _round;
    state = state.copyWith(submitting: true, clearSubmitError: true);

    try {
      final result = await _repository.submitReviewPayload(payload);
      if (!ref.mounted || round != _round) return;

      // 屏上保留**用户确认过的那份判定**（这是他说过的话），不拿服务端回来的
      // verdicts 覆盖：一是两者口径本应一致，二是万一不一致，界面会凭空长出
      // 「已改判」标记（用户根本没点过）。服务端真正权威的东西是调度结果——
      // 也就是下面展示的 nextReviewText / pendingItems。
      //
      // 唯一例外是「全没想起」：服务端按 rating=again 记的是全部没写，
      // 界面必须跟着变成全黄，否则提交前看到的绿条与落库的结论不一致。
      final resolved = allBlank
          ? List<RecallVerdict>.filled(
              state.presented.length,
              RecallVerdict.miss,
            )
          : state.finalVerdicts;

      state = state.copyWith(
        submitting: false,
        retryLocked: false,
        result: result,
        finalVerdicts: List.unmodifiable(resolved),
        clearSubmitError: true,
      );
      // 这次作答已落库：key 用完即弃，下一张卡重新生成
      _draft = null;
      _frozenPayload = null;
      _submittedAllBlank = false;
    } catch (error) {
      if (!ref.mounted || round != _round) return;
      // 结果未知：不解冻、不换 key、不推进界面，只把判定锁住并给出可读原因
      state = state.copyWith(
        submitting: false,
        retryLocked: true,
        submitError: describeRecallError(error),
      );
    }
  }

  // ==================== 推进 ====================

  /// 判分屏 →（下一张 | 完成）。
  ///
  /// 不自动跳转：`nextReviewText`（「下次 11 月 20 日」）是规格要求展示的信息，
  /// 一闪而过等于没展示。
  Future<void> advance() async {
    final note = state.result?.nextReviewText;
    final pendingItems = state.result?.pendingItems;
    final remaining = state.pending.skip(1).toList(growable: false);

    ++_round;
    _draft = null;
    _frozenPayload = null;
    _submittedAllBlank = false;

    if (remaining.isEmpty) {
      state = RecallSessionState(
        phase: RecallPhase.done,
        queue: state.queue,
        result: state.result,
        lastNote: note ?? state.lastNote,
        lastPendingItems: pendingItems ?? state.lastPendingItems,
      );
      return;
    }

    state = RecallSessionState(
      phase: RecallPhase.loadingCard,
      queue: state.queue,
      pending: remaining,
      lastNote: note ?? state.lastNote,
      lastPendingItems: pendingItems ?? state.lastPendingItems,
    );

    await _loadCard(remaining.first);
  }

  /// 归档当前卡并推进到下一张。
  ///
  /// 返回 null 表示成功，非 null 是可读的失败原因（由界面弹 SnackBar）。
  /// 归档天然幂等，重试不会产生第二条记录。
  Future<String?> archiveCurrent() async {
    final card = state.card;
    if (card == null || state.archiving || state.submitting) return null;

    final round = _round;
    state = state.copyWith(archiving: true);
    try {
      await _repository.archive(card.cardId);
      if (!ref.mounted) return null;
      state = state.copyWith(archiving: false);
      // 期间换了轮次（比如用户返回又进来）：不能拿新队列去推进旧的归档
      if (round != _round) return null;
      await advance();
      return null;
    } catch (error) {
      if (!ref.mounted) return describeRecallError(error);
      if (round != _round) return null;
      state = state.copyWith(archiving: false);
      return describeRecallError(error);
    }
  }
}

/// 把异常翻译成用户能读懂的一句话。
///
/// 界面上一律展示这个（而不是 `DioException` 的 `toString()`）：
/// 「加载失败」这种没有信息量的文案会让用户只能靠重试碰运气。
String describeRecallError(Object error) {
  if (error is FormatException) {
    final message = error.message.trim();
    return message.isEmpty ? '服务器返回的内容看不懂，请检查服务器地址。' : message;
  }

  if (error is DioException) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return '网络超时了，检查一下网络再试一次。';
      case DioExceptionType.connectionError:
        return '连不上服务器，检查一下网络或服务器地址。';
      case DioExceptionType.badCertificate:
        return '服务器证书不受信任，请确认服务器地址。';
      case DioExceptionType.cancel:
        return '请求被取消了，再试一次。';
      case DioExceptionType.badResponse:
        final status = error.response?.statusCode;
        if (status == 401) return '登录已过期，请重新登录后再来。';
        if (status == 403) return '没有权限访问这份回忆卡。';
        if (status == 404) return '这张卡在服务器上已经不存在了。';
        if (status != null && status >= 500) {
          return '服务器出了点问题（$status），稍后再试。';
        }
        final serverMessage = _serverErrorMessage(error.response?.data);
        if (serverMessage != null) return serverMessage;
        return status == null ? '服务器返回了异常。' : '服务器拒绝了这次请求（$status）。';
      case DioExceptionType.unknown:
        return '网络好像断了，检查一下网络再试一次。';
    }
  }

  return '出了一点问题，稍后再试。';
}

/// 尽力从错误响应里取一句人话（后端形状：`{error: {message}}` 或 `{message}`）。
String? _serverErrorMessage(Object? data) {
  if (data is Map) {
    final error = data['error'];
    if (error is Map) {
      final message = error['message'];
      if (message is String && message.trim().isNotEmpty) {
        return message.trim();
      }
    }
    final message = data['message'];
    if (message is String && message.trim().isNotEmpty) return message.trim();
  }
  return null;
}

/// 会话状态机 Provider。
///
/// `autoDispose`：离开回忆页就丢快照。复习进度以学习日（04:00）切分，本地算不出来，
/// 留着昨天的队列只会让用户对着已经不属于今天的卡作答。
final recallSessionControllerProvider =
    NotifierProvider.autoDispose<RecallSessionController, RecallSessionState>(
      RecallSessionController.new,
    );
