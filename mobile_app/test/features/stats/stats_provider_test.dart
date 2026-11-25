import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/stats/domain/learning_stats.dart';
import 'package:mobile_app/features/stats/presentation/stats_provider.dart';
import 'package:mobile_app/shared/datasources/api_client.dart';

import '../../support/fakes_misc.dart';
import '../../support/recording_adapter.dart';

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

  // ---------------------------------------------------------------------------
  // 控制器状态机：真控制器 + 假 Dio（不打网络）
  //
  // 守的是首页/统计页能看见的那几条契约：
  // 1. 只有拿到对象才算成功（后端换成 `{stats: {...}}` 必须可见地失败，
  //    而不是静默显示全 0——全 0 在界面上等于「你一道题都没做过」）；
  // 2. 失败不清空已有数据（一次失败的刷新不该把上屏的数字抹掉）；
  // 3. 重新加载会清掉上一次的 error（`copyWith` 里 error 是无条件覆盖的），
  //    否则错误提示会一直挂着；
  // 4. 错误文案走 `userMessageOf`，界面不回显 URL / 服务端载荷。
  // ---------------------------------------------------------------------------
  group('StatsController 加载状态机', () {
    late RecordingAdapter adapter;

    setUp(() {
      adapter = RecordingAdapter();
    });

    Map<String, dynamic> statsJson({
      int todayCount = 12,
      int todayCorrect = 9,
      double todayAccuracy = 0.75,
      int totalCount = 240,
      int totalCorrect = 190,
      double overallAccuracy = 0.79,
      int streakDays = 5,
      int totalSessions = 24,
    }) {
      return <String, dynamic>{
        'todayCount': todayCount,
        'todayCorrect': todayCorrect,
        'todayAccuracy': todayAccuracy,
        'totalCount': totalCount,
        'totalCorrect': totalCorrect,
        'overallAccuracy': overallAccuracy,
        'streakDays': streakDays,
        'totalSessions': totalSessions,
      };
    }

    ProviderContainer makeStatsContainer() {
      final container = ProviderContainer(
        retry: (_, _) => null,
        overrides: [dioProvider.overrideWithValue(fakeDio(adapter))],
      );
      addTearDown(container.dispose);
      return container;
    }

    test('初始状态：全 0、非加载中、无错误，且不发请求', () {
      final container = makeStatsContainer();

      final state = container.read(statsControllerProvider);

      expect(state.stats, equals(LearningStats.empty));
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
      expect(adapter.requests, isEmpty, reason: 'build() 不该顺手发请求');
    });

    test('成功：打 /stats，解析出今日与累计数据，error 为空', () async {
      adapter.responseBody = statsJson();
      final container = makeStatsContainer();

      await container.read(statsControllerProvider.notifier).load();

      final request = adapter.requests.single;
      expect(request.method, 'GET');
      expect(request.path, '/stats');

      final state = container.read(statsControllerProvider);
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
      expect(state.stats.todayCount, 12);
      expect(state.stats.todayAccuracy, closeTo(0.75, 0.001));
      expect(state.stats.totalCount, 240);
      expect(state.stats.overallAccuracy, closeTo(0.79, 0.001));
      expect(state.stats.streakDays, 5);
    });

    test('加载中：请求未回来时 isLoading 为真，回来后落回数据态', () async {
      final gate = Completer<ResponseBody>();
      adapter.handler = (options) => gate.future;
      final container = makeStatsContainer();

      final loading = container.read(statsControllerProvider.notifier).load();
      await null;
      expect(container.read(statsControllerProvider).isLoading, isTrue);

      gate.complete(jsonBody(statsJson(totalSessions: 7)));
      await loading;

      final state = container.read(statsControllerProvider);
      expect(state.isLoading, isFalse);
      expect(state.stats.totalSessions, 7);
    });

    test('服务端 500：可读错误，保留已有数据，不回到全 0', () async {
      final container = makeStatsContainer();
      adapter.responseBody = statsJson();
      await container.read(statsControllerProvider.notifier).load();

      adapter.statusCode = 500;
      adapter.responseBody = <String, dynamic>{'message': 'boom'};
      await container.read(statsControllerProvider.notifier).load();

      final state = container.read(statsControllerProvider);
      expect(
        state.error,
        '服务器出了点问题（500），请稍后重试',
        reason: '文案必须是 userMessageOf 的产物，不带 URL/载荷',
      );
      expect(state.isLoading, isFalse);
      expect(state.stats.totalCount, 240, reason: '一次失败不该抹掉上屏数据');
      expect(adapter.requests, hasLength(2));
    });

    test('断网：连接错误翻成「网络好像断了」，而不是原始异常', () async {
      adapter.handler = (options) => offlineException(options);
      final container = makeStatsContainer();

      await container.read(statsControllerProvider.notifier).load();

      final state = container.read(statsControllerProvider);
      expect(state.error, '网络好像断了，请检查网络后重试');
      expect(state.stats, equals(LearningStats.empty));
    });

    test('契约变化：响应是数组而非对象 → 报告无法解析，不崩', () async {
      adapter.responseBody = <Map<String, dynamic>>[statsJson()];
      final container = makeStatsContainer();

      await container.read(statsControllerProvider.notifier).load();

      final state = container.read(statsControllerProvider);
      expect(state.error, '服务器返回的内容无法解析，请稍后重试');
      expect(state.isLoading, isFalse);
    });

    test('重试：上一次的 error 被清掉，成功后界面不再挂错误', () async {
      final container = makeStatsContainer();
      adapter.statusCode = 500;
      await container.read(statsControllerProvider.notifier).load();
      expect(container.read(statsControllerProvider).error, isNotNull);

      adapter.statusCode = 200;
      adapter.responseBody = statsJson(totalCount: 300);
      await container.read(statsControllerProvider.notifier).load();

      final state = container.read(statsControllerProvider);
      expect(state.error, isNull, reason: 'load() 开头重置 error');
      expect(state.stats.totalCount, 300);
    });
  });
}
