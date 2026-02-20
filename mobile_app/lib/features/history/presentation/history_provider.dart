import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/datasources/api_client.dart';
import '../domain/history_item.dart';
import '../domain/practice_log.dart';

part 'history_provider.freezed.dart';

/// 历史列表状态
@freezed
abstract class HistoryListState with _$HistoryListState {
  const factory HistoryListState({
    @Default([]) List<HistoryItem> items,
    @Default(0) int total,
    @Default(1) int page,
    @Default(10) int pageSize,
    @Default(false) bool isLoading,
    @Default(true) bool hasMore,
    String? error,
  }) = _HistoryListState;
}

/// 历史记录控制器 (Riverpod 3.x Notifier pattern)
class HistoryController extends Notifier<HistoryListState> {
  @override
  HistoryListState build() => const HistoryListState();

  ApiClient get _apiClient {
    final dio = ref.watch(dioProvider);
    return ApiClient(dio);
  }

  /// 加载第一页
  Future<void> loadHistory() async {
    state = state.copyWith(isLoading: true, error: null, page: 1);

    try {
      final response = await _apiClient.getHistory(1, state.pageSize);

      final items = (response['items'] as List<dynamic>)
          .map((e) => HistoryItem.fromJson(e as Map<String, dynamic>))
          .toList();
      final total = response['total'] as int;
      final totalPages = response['totalPages'] as int;

      state = state.copyWith(
        isLoading: false,
        items: items,
        total: total,
        page: 1,
        hasMore: 1 < totalPages,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 加载更多
  Future<void> loadMore() async {
    if (state.isLoading || !state.hasMore) return;

    final nextPage = state.page + 1;
    state = state.copyWith(isLoading: true);

    try {
      final response = await _apiClient.getHistory(nextPage, state.pageSize);

      final newItems = (response['items'] as List<dynamic>)
          .map((e) => HistoryItem.fromJson(e as Map<String, dynamic>))
          .toList();
      final totalPages = response['totalPages'] as int;

      state = state.copyWith(
        isLoading: false,
        items: [...state.items, ...newItems],
        page: nextPage,
        hasMore: nextPage < totalPages,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 刷新
  Future<void> refresh() async {
    state = const HistoryListState();
    await loadHistory();
  }
}

/// 会话详情状态
@freezed
abstract class HistoryDetailState with _$HistoryDetailState {
  const factory HistoryDetailState({
    HistoryItem? session,
    @Default([]) List<PracticeLog> logs,
    @Default(false) bool isLoading,
    String? error,
  }) = _HistoryDetailState;
}

/// 历史详情加载函数
Future<HistoryDetailState> _loadHistoryDetail(String sessionId, Ref ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final apiClient = ApiClient(dio);
    final response = await apiClient.getHistoryDetail(sessionId);

    final session = HistoryItem.fromJson(
      response['session'] as Map<String, dynamic>,
    );
    final logs = (response['logs'] as List<dynamic>)
        .map((e) => PracticeLog.fromJson(e as Map<String, dynamic>))
        .toList();

    return HistoryDetailState(isLoading: false, session: session, logs: logs);
  } catch (e) {
    return HistoryDetailState(isLoading: false, error: e.toString());
  }
}

/// Provider (Riverpod 3.x pattern)
final historyControllerProvider =
    NotifierProvider<HistoryController, HistoryListState>(
      HistoryController.new,
    );

/// Family Provider 支持带参数的详情页 (使用 FutureProvider.family)
final historyDetailProvider = FutureProvider.autoDispose
    .family<HistoryDetailState, String>(
      (ref, sessionId) => _loadHistoryDetail(sessionId, ref),
    );
