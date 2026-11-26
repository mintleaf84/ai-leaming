import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/profile/domain/user_profile.dart';
import 'package:mobile_app/features/profile/presentation/profile_provider.dart';

import '../../support/fakes_misc.dart';
import '../../support/recording_adapter.dart';

/// `/profile` 的一份合法响应（两个 group 共用：copyWith 也要一个真 profile）。
Map<String, dynamic> profileJson({
  String username = 'tester',
  String role = 'student',
  int totalSessions = 12,
  int totalAnswered = 240,
  int totalCorrect = 190,
  double overallAccuracy = 0.79,
  int knowledgeCardCount = 33,
  int wrongBookCount = 8,
}) {
  return <String, dynamic>{
    'id': 1,
    'username': username,
    'role': role,
    'createdAt': '2026-01-01T00:00:00.000Z',
    'stats': <String, dynamic>{
      'totalSessions': totalSessions,
      'totalAnswered': totalAnswered,
      'totalCorrect': totalCorrect,
      'overallAccuracy': overallAccuracy,
      'knowledgeCardCount': knowledgeCardCount,
      'wrongBookCount': wrongBookCount,
    },
  };
}

void main() {
  group('UserProfile fromJson 单元测试', () {
    final sampleJson = {
      'id': 1,
      'username': 'testuser',
      'role': 'student',
      'createdAt': '2024-01-01T00:00:00.000Z',
      'stats': {
        'totalSessions': 10,
        'totalAnswered': 100,
        'totalCorrect': 80,
        'overallAccuracy': 0.8,
        'knowledgeCardCount': 20,
        'wrongBookCount': 5,
      },
    };

    test('正常 JSON 反序列化', () {
      final profile = UserProfile.fromJson(sampleJson);

      expect(profile.id, 1);
      expect(profile.username, 'testuser');
      expect(profile.role, 'student');
      expect(profile.createdAt, '2024-01-01T00:00:00.000Z');
      expect(profile.stats.totalSessions, 10);
      expect(profile.stats.totalAnswered, 100);
      expect(profile.stats.totalCorrect, 80);
      expect(profile.stats.overallAccuracy, closeTo(0.8, 0.001));
      expect(profile.stats.knowledgeCardCount, 20);
      expect(profile.stats.wrongBookCount, 5);
    });

    test('overallAccuracy 为整数 0 时也能正确解析', () {
      final json = {
        ...sampleJson,
        'stats': {
          ...sampleJson['stats'] as Map<String, dynamic>,
          'overallAccuracy': 0, // 整数
        },
      };
      final profile = UserProfile.fromJson(json);
      expect(profile.stats.overallAccuracy, 0.0);
    });

    test('role 为 admin 时正确解析', () {
      final json = {...sampleJson, 'role': 'admin'};
      final profile = UserProfile.fromJson(json);
      expect(profile.role, 'admin');
    });
  });

  group('UserProfileStats fromJson 测试', () {
    test('各字段正确映射', () {
      final json = {
        'totalSessions': 5,
        'totalAnswered': 50,
        'totalCorrect': 40,
        'overallAccuracy': 0.8,
        'knowledgeCardCount': 15,
        'wrongBookCount': 3,
      };

      final stats = UserProfileStats.fromJson(json);

      expect(stats.totalSessions, 5);
      expect(stats.wrongBookCount, 3);
    });
  });

  group('ProfileState copyWith 测试', () {
    test('更新 profile', () {
      const initial = ProfileState();
      final profile = UserProfile.fromJson({
        'id': 1,
        'username': 'u',
        'role': 'student',
        'createdAt': '2024-01-01',
        'stats': {
          'totalSessions': 0,
          'totalAnswered': 0,
          'totalCorrect': 0,
          'overallAccuracy': 0,
          'knowledgeCardCount': 0,
          'wrongBookCount': 0,
        }
      });

      final updated = initial.copyWith(profile: profile);

      expect(updated.profile?.username, 'u');
      expect(updated.isLoading, false);
    });

    test('error 字段更新不影响其他字段', () {
      const initial = ProfileState();
      final withError = initial.copyWith(error: '请求超时');

      expect(withError.error, '请求超时');
      expect(withError.profile, isNull);
    });

    test('copyWith：不传的字段沿用旧值，profile 会保留', () {
      final first = const ProfileState().copyWith(
        profile: UserProfile.fromJson(profileJson(username: 'first')),
      );

      final loading = first.copyWith(isLoading: true);
      expect(loading.isLoading, isTrue);
      expect(loading.profile?.username, 'first');

      final done = loading.copyWith(isLoading: false, error: 'boom');
      expect(done.isLoading, isFalse);
      expect(done.error, 'boom');
      expect(done.profile?.username, 'first');
    });
  });

  // ---------------------------------------------------------------------------
  // 控制器状态机：真控制器 + 假 Dio（不打网络）
  //
  // 个人中心屏的三种状态全由这个控制器决定，所以这里钉住：
  // 1. **只有拿到对象才算成功**：`/profile` 返回数组或 `{profile: {...}}` 时必须
  //    可见地失败。静默成功会让界面停在 `SizedBox.shrink()`（空白页），用户
  //    不知道是没登录还是坏了。
  // 2. **失败不清空已有 profile**：一次失败的刷新不该把已上屏的头像卡抹掉。
  // 3. **重新加载清掉上一次的 error**：从子页面返回会自动再 `load()`（见
  //    `profile_screen` 的 `onReturn`），错误挂着就再也洗不掉了。
  // 4. **错误文案走 `userMessageOf`**：界面不回显 URL、状态码之外的原始载荷。
  // ---------------------------------------------------------------------------
  group('ProfileController 加载状态机', () {
    late RecordingAdapter adapter;

    setUp(() {
      adapter = RecordingAdapter();
    });

    ProviderContainer makeProfileContainer() {
      final container = ProviderContainer(
        retry: (_, _) => null,
        overrides: [dioProvider.overrideWithValue(fakeDio(adapter))],
      );
      addTearDown(container.dispose);
      return container;
    }

    test('初始状态：无 profile、非加载中、无错误，且不发请求', () {
      final container = makeProfileContainer();

      final state = container.read(profileControllerProvider);

      expect(state.profile, isNull);
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
      expect(adapter.requests, isEmpty, reason: 'build() 不该顺手发请求');
    });

    test('成功：打 /profile，解析出账号与统计', () async {
      adapter.responseBody = profileJson(username: ' teacher84 ');
      final container = makeProfileContainer();

      await container.read(profileControllerProvider.notifier).load();

      final request = adapter.requests.single;
      expect(request.method, 'GET');
      expect(request.path, '/profile');

      final state = container.read(profileControllerProvider);
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
      expect(state.profile?.username, ' teacher84 ');
      expect(state.profile?.role, 'student');
      expect(state.profile?.stats.knowledgeCardCount, 33);
      expect(state.profile?.stats.overallAccuracy, closeTo(0.79, 0.001));
    });

    test('加载中：请求未回来时 isLoading 为真，回来后落回数据态', () async {
      final gate = Completer<ResponseBody>();
      adapter.handler = (options) => gate.future;
      final container = makeProfileContainer();

      final loading = container.read(profileControllerProvider.notifier).load();
      expect(container.read(profileControllerProvider).isLoading, isTrue);

      gate.complete(jsonBody(profileJson()));
      await loading;

      final state = container.read(profileControllerProvider);
      expect(state.isLoading, isFalse);
      expect(state.profile?.username, 'tester');
    });

    test('服务端 500：可读错误，保留已有 profile', () async {
      final container = makeProfileContainer();
      adapter.responseBody = profileJson();
      await container.read(profileControllerProvider.notifier).load();

      adapter.statusCode = 500;
      adapter.responseBody = <String, dynamic>{'message': 'boom'};
      await container.read(profileControllerProvider.notifier).load();

      final state = container.read(profileControllerProvider);
      expect(state.error, '服务器出了点问题（500），请稍后重试');
      expect(state.isLoading, isFalse);
      expect(
        state.profile?.username,
        'tester',
        reason: '一次失败不该把头像卡换成错误页',
      );
      expect(adapter.requests, hasLength(2));
    });

    test('断网：连接错误翻成「网络好像断了」，不带原始异常', () async {
      adapter.handler = (options) => offlineException(options);
      final container = makeProfileContainer();

      await container.read(profileControllerProvider.notifier).load();

      expect(
        container.read(profileControllerProvider).error,
        '网络好像断了，请检查网络后重试',
      );
    });

    test('契约变化：响应是数组而非对象 → 报告无法解析，不崩', () async {
      adapter.responseBody = <Map<String, dynamic>>[profileJson()];
      final container = makeProfileContainer();

      await container.read(profileControllerProvider.notifier).load();

      final state = container.read(profileControllerProvider);
      expect(state.error, '服务器返回的内容无法解析，请稍后重试');
      expect(state.isLoading, isFalse);
      expect(state.profile, isNull);
    });

    test('重试：上一次的 error 被清掉，成功后不再挂错误', () async {
      final container = makeProfileContainer();
      adapter.statusCode = 500;
      await container.read(profileControllerProvider.notifier).load();
      expect(container.read(profileControllerProvider).error, isNotNull);

      adapter.statusCode = 200;
      adapter.responseBody = profileJson(username: 'after-retry');
      await container.read(profileControllerProvider.notifier).load();

      final state = container.read(profileControllerProvider);
      expect(state.error, isNull, reason: 'load() 开头重置 error');
      expect(state.profile?.username, 'after-retry');
    });

    test('字段类型不符（stats 缺失）：落到「无法解析」而不是抛到界面外', () async {
      adapter.responseBody = <String, dynamic>{
        'id': 1,
        'username': 'no-stats',
        'role': 'student',
        'createdAt': '2026-01-01T00:00:00.000Z',
      };
      final container = makeProfileContainer();

      await container.read(profileControllerProvider.notifier).load();

      final state = container.read(profileControllerProvider);
      expect(state.error, '服务器返回的内容无法解析，请稍后重试');
      expect(state.profile, isNull);
    });
  });
}
