import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/agent_sets_repository.dart';
import '../domain/agent_question_set.dart';
import 'agent_sets_error_text.dart';

/// 题集列表的界面阶段。
enum AgentSetsPhase {
  /// 首屏加载中（还没有任何数据）。
  loading,

  /// 有结果（`sets` 可能为空，空态由界面判定）。
  ready,

  /// 首屏加载失败。
  error,
}

/// 题集列表状态（不可变快照）。
class AgentSetsState {
  final AgentSetsPhase phase;
  final List<AgentQuestionSet> sets;

  /// 下拉刷新中（列表已有数据时不清屏，只转刷新指示器）。
  final bool refreshing;

  /// 首屏加载失败的可读原因。
  final String? errorMessage;

  const AgentSetsState({
    this.phase = AgentSetsPhase.loading,
    this.sets = const <AgentQuestionSet>[],
    this.refreshing = false,
    this.errorMessage,
  });

  bool get isEmpty => sets.isEmpty;

  /// 未读总数：列表头部「N 道未读」用它，不另发一次请求。
  int get unreadTotal => sets.fold<int>(0, (sum, set) => sum + set.unreadCount);

  AgentSetsState copyWith({
    AgentSetsPhase? phase,
    List<AgentQuestionSet>? sets,
    bool? refreshing,
    String? errorMessage,
    bool clearError = false,
  }) {
    return AgentSetsState(
      phase: phase ?? this.phase,
      sets: sets ?? this.sets,
      refreshing: refreshing ?? this.refreshing,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

/// 题集列表控制器。
///
/// 只有一个写入口 [load]：首屏、下拉刷新、从练习/报错/成卷返回时重取。
/// 练习屏里的报错与转正**不改这里的快照**——它们由服务端改，客户端直接重拉，
/// 免得两处各维护一份「剩几题」的算法。
class AgentSetsController extends Notifier<AgentSetsState> {
  @override
  AgentSetsState build() => const AgentSetsState();

  AgentSetsRepository get _repository => ref.read(agentSetsRepositoryProvider);

  Future<void> load({bool silent = false}) async {
    final hasData = state.sets.isNotEmpty;
    if (!silent && !hasData) {
      state = state.copyWith(phase: AgentSetsPhase.loading, clearError: true);
    } else {
      state = state.copyWith(refreshing: true, clearError: true);
    }

    try {
      final page = await _repository.list(limit: 50);
      if (!ref.mounted) return;
      state = state.copyWith(
        phase: AgentSetsPhase.ready,
        sets: page.sets,
        refreshing: false,
        clearError: true,
      );
    } catch (error) {
      if (!ref.mounted) return;
      state = state.copyWith(
        // 刷新失败但手里还有旧列表：保留列表不清屏（用户能继续点开旧题集），
        // 错误只体现在刷新指示器结束后的提示行上。
        phase: hasData ? AgentSetsPhase.ready : AgentSetsPhase.error,
        refreshing: false,
        errorMessage: describeAgentSetsError(error),
      );
    }
  }
}

/// 列表控制器 Provider。
///
/// `autoDispose`：离开列表就丢快照，回来重新拉——未做数/未读数/最近成绩都
/// 可能刚变过，缓存一份旧列表只会让用户以为「刚才做完的没记上」。
final agentSetsControllerProvider =
    NotifierProvider.autoDispose<AgentSetsController, AgentSetsState>(
      AgentSetsController.new,
    );
