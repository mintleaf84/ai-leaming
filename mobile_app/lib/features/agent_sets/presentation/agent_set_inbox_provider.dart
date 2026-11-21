import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/server_config.dart';
import '../../../core/storage/preferences.dart';
import '../data/agent_sets_repository.dart';
import '../domain/agent_set_inbox.dart';
import 'agent_set_notifier.dart';
import 'agent_sets_error_text.dart';

/// 未读汇总的界面状态。
///
/// [inbox] 为 null 表示「还没成功拉过一次」——此时首页不显示角标，也不写
/// 「0 道未读」，因为「不知道」和「没有」在用户眼里是两件事。
class AgentSetInboxState {
  final AgentSetInbox? inbox;
  final bool loading;

  /// 最近一次失败的可读原因（不弹窗、不占位，仅用于排查与调试入口）。
  final String? errorMessage;

  const AgentSetInboxState({
    this.inbox,
    this.loading = false,
    this.errorMessage,
  });

  bool get loaded => inbox != null;
  int get unreadCount => inbox?.unreadCount ?? 0;

  AgentSetInboxState copyWith({
    AgentSetInbox? inbox,
    bool? loading,
    String? errorMessage,
    bool clearError = false,
  }) {
    return AgentSetInboxState(
      inbox: inbox ?? this.inbox,
      loading: loading ?? this.loading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

/// 未读汇总控制器：App 启动 / 回前台时拉一次列表，算未读总和，
/// 未读变多时发一条本地通知（契约 §6 的第一步，不做周期拉取）。
///
/// 为什么不放在首页的 `useEffect` 里：首页每次进入都会重建，那会变成「切一次
/// 卡片就查一次」；契约要的是「启动/回前台各一次」，由 [AgentSetInboxWatcher]
/// 的生命周期事件驱动。
class AgentSetInboxController extends Notifier<AgentSetInboxState> {
  /// 同一时刻只允许一次请求：回前台事件可能连发两条（比如从通知栏点回来）。
  bool _running = false;

  @override
  AgentSetInboxState build() => const AgentSetInboxState();

  Future<void> refresh() async {
    if (_running) return;
    _running = true;
    state = state.copyWith(loading: true, clearError: true);
    try {
      final page = await ref.read(agentSetsRepositoryProvider).list(limit: 20);
      if (!ref.mounted) return;
      final inbox = AgentSetInbox.fromSets(page.sets);
      state = AgentSetInboxState(inbox: inbox, loading: false);
      await _maybeNotify(inbox);
    } catch (error) {
      if (!ref.mounted) return;
      debugPrint('[AgentSets] 拉未读失败: $error');
      // 保留上一次的快照：断网不能把「3 道未读」抹成「都看过了」。
      state = state.copyWith(
        loading: false,
        errorMessage: describeAgentSetsError(error),
      );
    } finally {
      _running = false;
    }
  }

  Future<void> _maybeNotify(AgentSetInbox inbox) async {
    final seen = await _readSeen();
    final unread = inbox.unreadCount;
    if (unread == seen) return;

    // 未读变少了（用户去做了/标了错题）：只同步游标，不通知。
    if (unread < seen) {
      await _writeSeen(unread);
      return;
    }

    final text = agentSetNotificationText(inbox, newCount: unread - seen);
    final delivered = await ref
        .read(agentSetNotifierProvider)
        .showNewSets(title: text.title, body: text.body);
    if (delivered) await _writeSeen(unread);
  }

  Future<int> _readSeen() async {
    try {
      final raw = await ref
          .read(preferencesStoreProvider)
          .read(PreferencesKeys.agentSetUnreadSeen);
      return int.tryParse((raw ?? '').trim()) ?? 0;
    } catch (error) {
      // 读不到就按 0 处理：顶多多发一条通知，不会漏。
      debugPrint('[AgentSets] 读未读游标失败: $error');
      return 0;
    }
  }

  Future<void> _writeSeen(int value) async {
    try {
      await ref
          .read(preferencesStoreProvider)
          .write(PreferencesKeys.agentSetUnreadSeen, '$value');
    } catch (error) {
      // 写不进去只影响下次去重，不影响本次提示。
      debugPrint('[AgentSets] 写未读游标失败: $error');
    }
  }
}

/// 未读汇总 Provider。
///
/// 不是 autoDispose：首页角标与子页面共用同一份快照；离开首页就丢会让角标
/// 在返回时闪一下「没有」。登录切换的旧快照由下一次启动/回前台的刷新覆盖。
final agentSetInboxProvider =
    NotifierProvider<AgentSetInboxController, AgentSetInboxState>(
      AgentSetInboxController.new,
    );

/// 挂在 App 根部，负责「启动 + 回前台各拉一次未读」。
///
/// 为什么挂在 `MyApp` 而不是首页：首页是 shell 的一个分支，用户可能一直停在
/// 练习 tab，回前台时首页并不重建——那样「回前台拉一次」就永远不触发。
class AgentSetInboxWatcher extends ConsumerStatefulWidget {
  const AgentSetInboxWatcher({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<AgentSetInboxWatcher> createState() =>
      _AgentSetInboxWatcherState();
}

class _AgentSetInboxWatcherState extends ConsumerState<AgentSetInboxWatcher>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // 首帧之后再发请求：build 期间读 provider 会触发「在 build 中修改状态」。
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // 只认 resumed：inactive/paused 在切后台、下拉通知栏时都会来一遍，
    // 每次都发请求等于把「回前台一次」变成「碰一下就一次」。
    if (state == AppLifecycleState.resumed) _refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _refresh() {
    if (!mounted) return;
    // 没有服务器地址时 `/agent-sets` 必然失败：不在启动阶段制造一条必然报错。
    if (!ref.read(serverConfigProvider).isConfigured) return;
    ref.read(agentSetInboxProvider.notifier).refresh();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
