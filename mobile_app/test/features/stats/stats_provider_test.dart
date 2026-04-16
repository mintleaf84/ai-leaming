import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile_app/features/stats/domain/learning_stats.dart';
import 'package:mobile_app/features/stats/presentation/stats_provider.dart';
import 'package:mobile_app/shared/datasources/api_client.dart';
import 'package:mobile_app/core/network/dio_client.dart';

/// Mock Dio，绕过真实 HTTP 请求
class MockDio extends Mock implements Dio {}

/// Fake ApiClient，用于直接注入返回值
class FakeApiClient extends Fake implements ApiClient {
  final dynamic Function() _getStatsImpl;

  FakeApiClient(this._getStatsImpl);

  @override
  Future<dynamic> getStats() => Future.value(_getStatsImpl());
}

/// 工厂函数：创建注入了 FakeApiClient 的 ProviderContainer
ProviderContainer makeContainer(FakeApiClient fakeClient) {
  // 重写 dioProvider，使其返回 MockDio，
  // 然后在 StatsController 里我们用 FakeApiClient 替代真实 ApiClient。
  // 这里用更简单的方式：override statsControllerProvider 本身并不合适，
  // 因为它是 Notifier。
  //
  // 采用 override dioProvider + 在测试中手动 stub 的方式更简洁：
  // 实际上最简单的方式是直接 override statsControllerProvider with a fake,
  // 但这需要额外包装。
  //
  // 这里采用 integration 测试风格，mock dioProvider 即可。
  // 下面用 ProviderContainer 直接覆盖整个 Notifier 会更清晰。
  final container = ProviderContainer();
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('LearningStats fromJson 单元测试', () {
    test('正常 JSON 反序列化', () {
      final json = {
        'todayCount': 5,
        'todayCorrect': 4,
        'todayAccuracy': 0.8,
        'totalCount': 100,
        'totalCorrect': 75,
        'overallAccuracy': 0.75,
        'streakDays': 3,
        'totalSessions': 12,
      };

      final stats = LearningStats.fromJson(json);

      expect(stats.todayCount, 5);
      expect(stats.todayCorrect, 4);
      expect(stats.todayAccuracy, closeTo(0.8, 0.001));
      expect(stats.totalCount, 100);
      expect(stats.totalCorrect, 75);
      expect(stats.overallAccuracy, closeTo(0.75, 0.001));
      expect(stats.streakDays, 3);
      expect(stats.totalSessions, 12);
    });

    test('数字类型为 int 时也能正确解析（API 可能返回整数 0 不是 0.0）', () {
      final json = {
        'todayCount': 0,
        'todayCorrect': 0,
        'todayAccuracy': 0, // int 而非 double
        'totalCount': 10,
        'totalCorrect': 8,
        'overallAccuracy': 0, // int 而非 double
        'streakDays': 0,
        'totalSessions': 2,
      };

      final stats = LearningStats.fromJson(json);

      expect(stats.todayAccuracy, 0.0);
      expect(stats.overallAccuracy, 0.0);
    });

    test('LearningStats.empty 初始值全为 0', () {
      const stats = LearningStats.empty;
      expect(stats.todayCount, 0);
      expect(stats.streakDays, 0);
      expect(stats.overallAccuracy, 0.0);
    });
  });

  group('StatsState copyWith 测试', () {
    test('更新 stats 字段', () {
      const initial = StatsState();
      const newStats = LearningStats(
        todayCount: 5,
        todayCorrect: 4,
        todayAccuracy: 0.8,
        totalCount: 100,
        totalCorrect: 75,
        overallAccuracy: 0.75,
        streakDays: 3,
        totalSessions: 12,
      );

      final updated = initial.copyWith(stats: newStats);

      expect(updated.stats.todayCount, 5);
      expect(updated.isLoading, false);
      expect(updated.error, isNull);
    });

    test('isLoading 状态切换', () {
      const initial = StatsState();
      final loading = initial.copyWith(isLoading: true);

      expect(loading.isLoading, true);
      expect(loading.stats, equals(LearningStats.empty));
    });

    test('error 字段更新', () {
      const initial = StatsState();
      final withError = initial.copyWith(error: '网络错误');

      expect(withError.error, '网络错误');
    });
  });
}
