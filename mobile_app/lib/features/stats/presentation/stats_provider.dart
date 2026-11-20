import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/foundation.dart';
import '../../../core/error/user_message.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/datasources/api_client.dart';
import '../domain/learning_stats.dart';

/// 统计状态
class StatsState {
  final LearningStats stats;
  final bool isLoading;
  final String? error;

  const StatsState({
    this.stats = LearningStats.empty,
    this.isLoading = false,
    this.error,
  });

  StatsState copyWith({
    LearningStats? stats,
    bool? isLoading,
    String? error,
  }) {
    return StatsState(
      stats: stats ?? this.stats,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

/// 统计控制器
class StatsController extends Notifier<StatsState> {
  @override
  StatsState build() => const StatsState();

  ApiClient get _apiClient {
    final dio = ref.watch(dioProvider);
    return ApiClient(dio);
  }

  /// 加载学习统计数据
  Future<void> load() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final response = await _apiClient.getStats();
      final stats = LearningStats.fromJson(response as Map<String, dynamic>);
      state = state.copyWith(isLoading: false, stats: stats);
    } catch (e) {
      debugPrint('[Stats] 加载统计数据失败: $e');
      state = state.copyWith(isLoading: false, error: userMessageOf(e));
    }
  }
}

final statsControllerProvider =
    NotifierProvider<StatsController, StatsState>(StatsController.new);
