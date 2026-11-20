import '../domain/recall_answer_alignment.dart';
import '../domain/recall_card.dart';
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
/// 从 `recall_session_controller.dart` 原样搬出（纯搬移，字段与 `copyWith`
/// 一字未改）。控制器重新导出本文件，`import recall_session_controller.dart`
/// 拿到的名字不变。
///
/// 状态机只在 `RecallSessionController` 里推进；屏只读它、只发意图。
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

  /// 提交失败的可读原因。
  final String? submitError;

  /// 提交进行中：禁改判、禁重复提交。
  final bool submitting;

  /// 提交**结果未知**（超时/断网/5xx）：判定锁住，重试只能重放同一份载荷。
  final bool retryLocked;

  /// 提交被服务端**明确拒绝**（400/403/404/422）：同一份载荷再发也不会成功。
  ///
  /// 与 [retryLocked] 互斥，且**不锁判定**：既然这份载荷已经作废，就允许用户
  /// 继续改判、也允许他从头再试（那会换一个新的幂等键）；同时给出「跳过这张」
  /// 这条真正的出口，避免用户被一个永远重试不成功的按钮堵死。
  final bool submitRejected;

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
    this.submitRejected = false,
    this.archiving = false,
  });

  /// 今日总量（以队列为准）。
  int get total => queue?.total ?? pending.length;

  /// 已完成张数（顶部进度条用）。
  int get doneCount => (total - pending.length).clamp(0, total);

  /// 填空卡：作答按空切开后的文本，与判分屏条目同序。
  List<String> get segments => segmentAnswer(typed, presented.length);

  /// 判定是否锁死（提交中 / 已出结论 / 结果未知）。
  ///
  /// 被拒绝（[submitRejected]）**不在**此列：那份载荷已经作废，改判不会和
  /// "已经发出去的内容"打架。
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
    bool? submitRejected,
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
      submitRejected: submitRejected ?? this.submitRejected,
      archiving: archiving ?? this.archiving,
    );
  }
}
