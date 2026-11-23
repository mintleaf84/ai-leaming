import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/user_message.dart';
import '../../../core/network/dio_client.dart';
import '../data/fenbi_api.dart';
import '../domain/fenbi_status.dart';

/// 接口客户端。
///
/// 用 `watch` 而不是 `read`：`dioProvider` 在服务器地址变更后会重建，客户端
/// 必须跟着换成新 dio，否则换服务器后仍然打旧地址（与 `recallRepositoryProvider`
/// 同一理由）。
final fenbiApiProvider = Provider<FenbiApi>((ref) {
  return FenbiApi(ref.watch(dioProvider));
});

/// 一个「动作」的结果：成功或一句可直接展示的失败原因。
///
/// 为什么不把失败塞进 [FenbiSyncState]：绑定 / 同步 / 解绑的失败要落在**发起
/// 那个动作的界面**（表单留在弹层里、错误就地重试），而不是把整屏换掉。
class FenbiActionResult {
  const FenbiActionResult.ok([this.result]) : error = null;

  const FenbiActionResult.failed(this.error) : result = null;

  final String? error;

  /// 同步动作的返回值（绑定/解绑为 null）。
  final FenbiSyncResult? result;

  bool get isOk => error == null;
}

/// 首屏阶段。动作中（绑定/同步/解绑）不改变阶段，只切 [FenbiSyncState.busy]。
enum FenbiSyncPhase { loading, ready, error }

class FenbiSyncState {
  const FenbiSyncState({
    this.phase = FenbiSyncPhase.loading,
    this.status,
    this.errorMessage,
    this.busy = false,
    this.lastSyncResult,
  });

  final FenbiSyncPhase phase;
  final FenbiSyncStatus? status;

  /// 首屏加载失败的原因（整屏 [AppErrorView] 用）。
  final String? errorMessage;

  /// 任一动作进行中：按钮禁用，避免连点触发服务端限频。
  final bool busy;

  /// 最近一次「立即同步」的返回值。
  ///
  /// 优先于 `status.lastResult` 展示：同步刚结束时服务端可能还没把结果写回
  /// status（或状态刷新失败），用户点完就该立刻看到本次的数字。
  final FenbiSyncResult? lastSyncResult;

  bool get linked => status?.linked ?? false;

  /// 展示用的结果：本次同步优先，其次服务端记录的上次结果。
  FenbiSyncResult? get displayResult => lastSyncResult ?? status?.lastResult;

  FenbiSyncState copyWith({
    FenbiSyncPhase? phase,
    FenbiSyncStatus? status,
    String? errorMessage,
    bool clearError = false,
    bool? busy,
    FenbiSyncResult? lastSyncResult,
    bool clearLastSyncResult = false,
  }) {
    return FenbiSyncState(
      phase: phase ?? this.phase,
      status: status ?? this.status,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      busy: busy ?? this.busy,
      lastSyncResult: clearLastSyncResult
          ? null
          : (lastSyncResult ?? this.lastSyncResult),
    );
  }
}

/// 粉笔同步的控制器。
///
/// 写入口只有五个：加载、绑定（密码）、生成二维码（在 [FenbiQrController]）、
/// 同步、解绑。所有失败都通过 [FenbiActionResult] 返回，由界面决定错误视图
/// 放在哪一层；状态里的 `errorMessage` 只服务首屏加载失败。
class FenbiSyncController extends Notifier<FenbiSyncState> {
  @override
  FenbiSyncState build() => const FenbiSyncState();

  FenbiApi get _api => ref.read(fenbiApiProvider);

  /// 首屏 / 绑定成功后 / 解绑后重新读状态。
  Future<void> load() async {
    if (state.status == null) {
      state = state.copyWith(phase: FenbiSyncPhase.loading, clearError: true);
    }
    try {
      final status = await _api.fetchStatus();
      if (!ref.mounted) return;
      state = FenbiSyncState(
        phase: FenbiSyncPhase.ready,
        status: status,
        // 重新读状态时丢掉上一轮的本地结果，避免和 status.lastResult 显示两套数字。
        busy: state.busy,
      );
    } catch (error) {
      if (!ref.mounted) return;
      debugPrint('[fenbi] 读取绑定状态失败: $error');
      state = state.copyWith(
        phase: state.status == null
            ? FenbiSyncPhase.error
            : FenbiSyncPhase.ready,
        errorMessage: userMessageOf(error),
      );
    }
  }

  /// 手机号 + 密码绑定。
  Future<FenbiActionResult> link({
    required String phone,
    required String password,
  }) async {
    if (state.busy) return const FenbiActionResult.failed('上一个操作还没完成，请稍候。');
    state = state.copyWith(busy: true);
    try {
      await _api.link(phone: phone, password: password);
      final status = await _readStatusAfterLink();
      if (!ref.mounted) return const FenbiActionResult.ok();
      state = FenbiSyncState(
        phase: FenbiSyncPhase.ready,
        status: status,
      );
      return const FenbiActionResult.ok();
    } catch (error) {
      if (!ref.mounted) return FenbiActionResult.failed(userMessageOf(error));
      state = state.copyWith(busy: false);
      return FenbiActionResult.failed(userMessageOf(error));
    }
  }

  /// 立即同步。
  Future<FenbiActionResult> sync({bool full = false}) async {
    if (state.busy) return const FenbiActionResult.failed('正在同步，请稍候。');
    state = state.copyWith(busy: true);
    try {
      final result = await _api.sync(full: full);
      final status = await _refreshStatusQuietly();
      if (!ref.mounted) return FenbiActionResult.ok(result);
      state = state.copyWith(
        phase: FenbiSyncPhase.ready,
        status: status ?? state.status,
        busy: false,
        lastSyncResult: result,
        clearError: true,
      );
      return FenbiActionResult.ok(result);
    } catch (error) {
      if (!ref.mounted) return FenbiActionResult.failed(userMessageOf(error));
      debugPrint('[fenbi] 同步失败: $error');
      state = state.copyWith(busy: false);
      return FenbiActionResult.failed(userMessageOf(error));
    }
  }

  /// 解绑（清掉密码 / cookie；已同步的记录保留）。
  Future<FenbiActionResult> unlink() async {
    if (state.busy) return const FenbiActionResult.failed('上一个操作还没完成，请稍候。');
    state = state.copyWith(busy: true);
    try {
      await _api.unlink();
      // 解绑后服务端一定回到未绑定；状态刷新失败也不要显示成「已绑定」。
      FenbiSyncStatus status;
      try {
        status = await _api.fetchStatus();
      } catch (error) {
        debugPrint('[fenbi] 解绑后刷新状态失败，按未绑定处理: $error');
        status = const FenbiSyncStatus();
      }
      if (!ref.mounted) return const FenbiActionResult.ok();
      state = FenbiSyncState(phase: FenbiSyncPhase.ready, status: status);
      return const FenbiActionResult.ok();
    } catch (error) {
      if (!ref.mounted) return FenbiActionResult.failed(userMessageOf(error));
      state = state.copyWith(busy: false);
      return FenbiActionResult.failed(userMessageOf(error));
    }
  }

  /// 绑定已成功、但状态刷新失败时，至少让界面进入「已绑定」。
  Future<FenbiSyncStatus> _readStatusAfterLink() async {
    try {
      return await _api.fetchStatus();
    } catch (error) {
      debugPrint('[fenbi] 绑定后刷新状态失败，按已绑定处理: $error');
      return const FenbiSyncStatus(linked: true);
    }
  }

  /// 同步成功后刷新「上次同步时间」；刷新失败不影响同步结果本身。
  Future<FenbiSyncStatus?> _refreshStatusQuietly() async {
    try {
      return await _api.fetchStatus();
    } catch (error) {
      debugPrint('[fenbi] 同步后刷新状态失败: $error');
      return null;
    }
  }
}

/// `autoDispose`：离开粉笔同步页就丢快照，下次进来重新读绑定状态
/// （可能在 Web 端刚解绑 / 刚过期）。
final fenbiSyncControllerProvider =
    NotifierProvider.autoDispose<FenbiSyncController, FenbiSyncState>(
      FenbiSyncController.new,
    );

/// 扫码绑定弹层的一次会话状态。
class FenbiQrScanState {
  const FenbiQrScanState({
    this.session,
    this.phase = FenbiQrPhase.pending,
    this.errorMessage,
    this.starting = false,
  });

  final FenbiQrSession? session;
  final FenbiQrPhase phase;

  /// 生成二维码 / 连续轮询失败的原因（弹层里用 AppErrorView + 重试）。
  final String? errorMessage;

  /// 正在向服务端申请二维码。
  final bool starting;

  bool get hasSession => session != null;

  FenbiQrScanState copyWith({
    FenbiQrSession? session,
    FenbiQrPhase? phase,
    String? errorMessage,
    bool clearError = false,
    bool? starting,
  }) {
    return FenbiQrScanState(
      session: session ?? this.session,
      phase: phase ?? this.phase,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      starting: starting ?? this.starting,
    );
  }
}

/// 扫码绑定（生成二维码 + 每 2s 轮询状态）。
///
/// 为什么单独一个 controller：轮询定时器必须跟着弹层的生命周期走。独立成
/// `autoDispose` 的 provider，弹层关掉 → 没有监听者 → dispose → `ref.onDispose`
/// 里取消定时器；混在 [FenbiSyncController] 里会让「用户关掉弹层」继续打接口。
class FenbiQrController extends Notifier<FenbiQrScanState> {
  static const Duration pollInterval = Duration(seconds: 2);

  /// 2s 一次 × 90 = 3 分钟。粉笔侧二维码通常更早过期，这里只是兜底。
  static const int maxPolls = 90;

  Timer? _timer;
  bool _polling = false;
  int _polls = 0;
  int _consecutiveFailures = 0;

  @override
  FenbiQrScanState build() {
    ref.onDispose(() {
      _timer?.cancel();
      _timer = null;
    });
    return const FenbiQrScanState();
  }

  /// 申请一张新二维码并开始轮询（「重新生成」也走这里）。
  Future<void> start() async {
    _stopPolling();
    _polls = 0;
    _consecutiveFailures = 0;
    state = const FenbiQrScanState(starting: true);
    try {
      final session = await ref.read(fenbiApiProvider).createQrSession();
      if (!ref.mounted) return;
      if (!session.isUsable) {
        state = const FenbiQrScanState(
          errorMessage: '服务端没有返回可用的二维码，请稍后重试。',
        );
        return;
      }
      state = FenbiQrScanState(session: session);
      _timer = Timer.periodic(pollInterval, (_) => unawaited(_poll()));
    } catch (error) {
      if (!ref.mounted) return;
      debugPrint('[fenbi] 生成二维码失败: $error');
      state = FenbiQrScanState(errorMessage: userMessageOf(error));
    }
  }

  /// 关闭弹层前手动收尾（`autoDispose` 也会兜底取消）。
  void cancel() {
    _stopPolling();
    state = const FenbiQrScanState();
  }

  Future<void> _poll() async {
    final session = state.session;
    if (session == null || _polling) return;
    _polling = true;
    try {
      final phase = await ref.read(fenbiApiProvider).fetchQrPhase(
        session.lgtoken,
      );
      if (!ref.mounted) return;
      _consecutiveFailures = 0;
      _polls++;

      // 终态一律停止：上游二维码约 100 秒就失效，继续轮询同一个 token 只会
      // 一直拿到 0，界面停在「正在确认扫码状态…」。
      if (phase.isTerminal || _polls >= maxPolls) {
        _stopPolling();
        state = state.copyWith(
          phase: _polls >= maxPolls && phase != FenbiQrPhase.confirmed
              ? FenbiQrPhase.expired
              : phase,
        );
        return;
      }
      state = state.copyWith(phase: phase);
    } catch (error) {
      if (!ref.mounted) return;
      // 单次失败多是网络抖动：连续 3 次才终止并让用户重试。
      _consecutiveFailures++;
      if (_consecutiveFailures >= 3) {
        _stopPolling();
        debugPrint('[fenbi] 轮询二维码状态连续失败: $error');
        state = state.copyWith(errorMessage: userMessageOf(error));
      }
    } finally {
      _polling = false;
    }
  }

  void _stopPolling() {
    _timer?.cancel();
    _timer = null;
  }
}

/// `autoDispose`：弹层关闭即销毁，轮询定时器随之取消。
final fenbiQrControllerProvider =
    NotifierProvider.autoDispose<FenbiQrController, FenbiQrScanState>(
      FenbiQrController.new,
    );
