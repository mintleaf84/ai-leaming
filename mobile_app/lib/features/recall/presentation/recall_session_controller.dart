import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/recall_repository.dart';
import '../domain/recall_answer_alignment.dart';
import '../domain/recall_preview.dart';
import '../domain/recall_review.dart';
import 'recall_session_state.dart';

/// 阶段枚举与状态快照已搬到 `recall_session_state.dart`（纯搬移）。
/// 这里重新导出，`import recall_session_controller.dart` 拿到的名字不变。
export 'recall_session_state.dart';

/// 纯函数（失败分类 / 错误文案）单独住一个 part：它们不碰状态机，但界面与测试
/// 都会直接调，留在同一个库里才能保证导出的名字不变（`import` 本文件即得）。
part 'recall_session_errors.dart';

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

    // 被拒绝之后草稿已作废（见 _send 的 rejected 分支）：用户再点一次「确认结果」
    // 属于一次**新的**尝试，必须换新的幂等键——重发被拒的那份只会再被拒一次。
    var draft = _draft;
    if (draft == null) {
      final card = state.card;
      if (card == null) return;
      draft = RecallReviewDraft(cardId: card.cardId, typed: state.typed);
      _draft = draft;
    }

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
    state = state.copyWith(
      submitting: true,
      clearSubmitError: true,
      submitRejected: false,
    );

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
        submitRejected: false,
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

      final message = describeRecallError(error);
      switch (classifySubmitFailure(error)) {
        case RecallSubmitFailure.unknown:
          // 结果未知：不解冻、不换 key、不推进界面，只把判定锁住并给出可读原因。
          // 服务端可能已经写进去了，唯一安全的动作是重放同一份载荷。
          state = state.copyWith(
            submitting: false,
            retryLocked: true,
            submitRejected: false,
            submitError: message,
          );

        case RecallSubmitFailure.rejected:
          // 服务端明确拒绝：这份载荷作废。不锁判定、也绝不再发同一份，
          // 交给用户选出口（跳过这张 / 留在这里重新作答）。
          _discardDraft();
          state = state.copyWith(
            submitting: false,
            retryLocked: false,
            submitRejected: true,
            submitError: message,
          );

        case RecallSubmitFailure.sessionExpired:
          // 401 交给全局拦截器（登出 + 回登录页）。这里既不锁判定、也不假装
          // "再试一次有用"：提示一句原因，人还在这一屏，重新登录后可以再提交。
          _discardDraft();
          state = state.copyWith(
            submitting: false,
            retryLocked: false,
            submitRejected: false,
            submitError: message,
          );
      }
    }
  }

  /// 丢掉本次作答的草稿与冻结载荷（只在"这份载荷已经不可能成功"时调用）。
  void _discardDraft() {
    _draft = null;
    _frozenPayload = null;
    _submittedAllBlank = false;
  }

  /// 被拒绝后的出口一：放弃这次作答，直接推进到队列里下一张。
  ///
  /// 只推进队列，**不写任何本地/远端状态、也不伪造结论**：这次提交被服务端拒了，
  /// 我们既不知道它有没有部分生效，也不该替用户说"记下了"。用户下次遇到这张卡
  /// 会重新作答（那次会换新的幂等键，所以不会被当成重放）。
  Future<void> skipRejectedCard() async {
    if (state.phase != RecallPhase.judge) return;
    _discardDraft();
    await advance();
  }

  /// 被拒绝后的出口二：「留在这里」——收起提示，回到可改判、可再提交的样子。
  void dismissSubmitFailure() {
    if (state.phase != RecallPhase.judge) return;
    state = state.copyWith(
      submitRejected: false,
      retryLocked: false,
      clearSubmitError: true,
    );
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

      // 404：这张卡在服务端已经不存在了（卡组重导入、别处删卡之后，队列里还留着旧 id）。
      // 归档的本意就是让它离开队列，所以直接把用户带到下一张，而不是让他在一张
      // 已经不存在的卡上反复点。
      if (isCardGoneError(error)) {
        await advance();
        return '这张卡已经不在了，已跳到下一张。';
      }
      return '归档没有成功：${describeRecallError(error)}';
    }
  }
}

/// 会话状态机 Provider。
///
/// `autoDispose`：离开回忆页就丢快照。复习进度以学习日（04:00）切分，本地算不出来，
/// 留着昨天的队列只会让用户对着已经不属于今天的卡作答。
final recallSessionControllerProvider =
    NotifierProvider.autoDispose<RecallSessionController, RecallSessionState>(
      RecallSessionController.new,
    );
