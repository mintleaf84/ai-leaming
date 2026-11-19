import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/auth/data/auth_repository_impl.dart';
import 'package:mobile_app/features/auth/domain/auth_repository.dart';
import 'package:mobile_app/features/auth/presentation/auth_provider.dart';
import 'package:mobile_app/features/history/presentation/history_provider.dart';

import '../../../support/recording_adapter.dart';

/// 只让「登出」能跑通的最小仓库：`AuthController.logout` 会读它。
///
/// 这里刻意走**真实**的 `AuthController.logout()`（而不是手写一个假的
/// 版本号自增），否则测试就绕开了「登出必须 bump 版本号」这条待验证的行为。
class _FakeAuthRepository implements AuthRepository {
  int logoutCalls = 0;

  @override
  Future<void> login(String username, String password) async {}

  @override
  Future<void> register(String username, String password) async {}

  @override
  Future<String?> getToken() async => null;

  @override
  Future<void> logout() async {
    logoutCalls++;
  }
}

/// 这个测试守的是历史列表的**分页状态机**和**失败可见性**：
///
/// 1. **加载中/失败不能冒充「没有历史」**：三种状态（loading / hasMore / error）
///    必须各自成立；失败后 `items` 不能是「成功加载的空页」，否则界面显示
///    「暂无练习记录」，用户会以为数据丢了。
/// 2. **分页不跳页、不重复追加**：`loadMore` 依据 `page/hasMore` 推进，且在
///    首页还在加载、或 `hasMore == false` 时不许发请求——否则会打出重复的第 2 页
///    或者对空页发请求。
/// 3. **刷新语义**：`refresh` 先把状态重置成初始值再拉第一页，所以刷新失败时
///    列表是空的（而不是留着旧数据冒充刷新成功）。
/// 4. **竞态**：请求序号防护——先发但后返回的旧结果（成功或失败）必须被丢弃，
///    永远由「最新发出的那次请求」决定列表内容。
/// 5. **换账号后的数据隔离**：登录态一变就重建回初始态，`loadMore` 不会把
///    新账号的第 2 页拼到旧账号的第 1 页后面。
/// 6. **详情页失败用状态字段表达**：`historyDetailProvider` 捕获异常后返回
///    `HistoryDetailState(error: ...)`，不是 AsyncError——上层靠 error 字段渲染。
void main() {
  late RecordingAdapter adapter;
  late _FakeAuthRepository authRepository;

  setUp(() {
    adapter = RecordingAdapter();
    authRepository = _FakeAuthRepository();
  });

  Dio makeDio() =>
      Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'))
        ..httpClientAdapter = adapter;

  ProviderContainer makeContainer() {
    final container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        dioProvider.overrideWithValue(makeDio()),
        authRepositoryProvider.overrideWithValue(authRepository),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  Map<String, dynamic> itemJson(String id) => <String, dynamic>{
    'id': id,
    'sessionName': '会话 $id',
    'totalQuestions': 10,
    'correctCount': 8,
    'reviewCount': 1,
    'createdAt': '2026-11-18T10:00:00.000Z',
    'accuracy': 80,
  };

  Map<String, dynamic> pageJson(
    List<String> ids, {
    int totalPages = 1,
    int total = 1,
  }) => <String, dynamic>{
    'items': ids.map(itemJson).toList(),
    'total': total,
    'totalPages': totalPages,
  };

  group('初始状态', () {
    test('首页未加载：page=1、pageSize=10、hasMore=true、非 loading、无 error', () {
      final container = makeContainer();

      final state = container.read(historyControllerProvider);

      expect(state.items, isEmpty);
      expect(state.total, 0);
      expect(state.page, 1);
      expect(state.pageSize, 10);
      expect(state.isLoading, isFalse);
      expect(state.hasMore, isTrue);
      expect(state.error, isNull);
      expect(adapter.requests, isEmpty, reason: '初始态不该自行发请求');
    });
  });

  group('loadHistory', () {
    test('成功后解析列表并退出 loading；单页时 hasMore=false', () async {
      adapter.responseBody = pageJson(['s1', 's2'], totalPages: 1, total: 2);
      final container = makeContainer();

      await container.read(historyControllerProvider.notifier).loadHistory();

      final state = container.read(historyControllerProvider);
      expect(adapter.requests.single.path, '/history');
      expect(adapter.requests.single.method, 'GET');
      expect(adapter.requests.single.queryParameters, {
        'page': 1,
        'pageSize': 10,
      });
      expect(state.items.map((e) => e.id), ['s1', 's2']);
      expect(state.total, 2);
      expect(state.page, 1);
      expect(state.hasMore, isFalse);
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
    });

    test('多页时 hasMore=true，允许继续加载', () async {
      adapter.responseBody = pageJson(['s1'], totalPages: 3, total: 3);
      final container = makeContainer();

      await container.read(historyControllerProvider.notifier).loadHistory();

      expect(container.read(historyControllerProvider).hasMore, isTrue);
    });

    test('失败：error 可读、退出 loading，且不冒充「没有历史」', () async {
      adapter.statusCode = 500;
      adapter.responseBody = {'message': 'boom'};
      final container = makeContainer();

      await container.read(historyControllerProvider.notifier).loadHistory();

      final state = container.read(historyControllerProvider);
      expect(state.isLoading, isFalse);
      expect(state.error, isNotNull);
      expect(state.error, contains('500'), reason: '错误文案要带上状态码，否则只剩「加载失败」无迹可循');
      expect(state.items, isEmpty);
    });

    test('失败后重试成功，error 被清空', () async {
      adapter.statusCode = 500;
      adapter.responseBody = {'message': 'boom'};
      final container = makeContainer();
      final notifier = container.read(historyControllerProvider.notifier);
      await notifier.loadHistory();
      expect(container.read(historyControllerProvider).error, isNotNull);

      adapter.statusCode = 200;
      adapter.responseBody = pageJson(['s1']);
      await notifier.loadHistory();

      final state = container.read(historyControllerProvider);
      expect(state.error, isNull);
      expect(state.items.single.id, 's1');
    });
  });

  group('loadMore', () {
    test('第 2 页追加在旧数据之后，页码推进；末页后 hasMore=false', () async {
      adapter.handler = (options) {
        final page = options.queryParameters['page'] as int;
        return jsonBody(pageJson(['s$page'], totalPages: 2, total: 2));
      };
      final container = makeContainer();
      final notifier = container.read(historyControllerProvider.notifier);
      await notifier.loadHistory();

      await notifier.loadMore();

      var state = container.read(historyControllerProvider);
      expect(adapter.requests.last.queryParameters, {
        'page': 2,
        'pageSize': 10,
      });
      expect(state.items.map((e) => e.id), [
        's1',
        's2',
      ], reason: '新页必须追加在旧数据之后');
      expect(state.page, 2);
      expect(state.hasMore, isFalse);

      // 已经是末页，再点加载更多不应发请求
      final requestsBefore = adapter.requests.length;
      await notifier.loadMore();
      expect(adapter.requests.length, requestsBefore);
      state = container.read(historyControllerProvider);
      expect(state.items.length, 2);
    });

    test('首页还在加载时 loadMore 直接返回，不打重复的第 2 页', () async {
      final gate = Completer<void>();
      var first = true;
      adapter.handler = (options) async {
        if (first) {
          first = false;
          await gate.future;
          return jsonBody(pageJson(['s1'], totalPages: 2, total: 2));
        }
        return jsonBody(pageJson(['s2'], totalPages: 2, total: 2));
      };
      final container = makeContainer();
      final notifier = container.read(historyControllerProvider.notifier);

      final loading = notifier.loadHistory();
      await pumpEventQueue();
      expect(container.read(historyControllerProvider).isLoading, isTrue);

      await notifier.loadMore();
      expect(
        adapter.requests.length,
        1,
        reason: '首页未回来时页码还不可信，发第 2 页会造成错页/重复页',
      );

      gate.complete();
      await loading;
      expect(container.read(historyControllerProvider).items.single.id, 's1');
    });

    test('失败：退出 loading、保留已加载的旧页并暴露 error', () async {
      var count = 0;
      adapter.handler = (options) {
        count++;
        if (count == 1) {
          return jsonBody(pageJson(['s1'], totalPages: 2, total: 2));
        }
        return jsonBody({'message': 'boom'}, statusCode: 500);
      };
      final container = makeContainer();
      final notifier = container.read(historyControllerProvider.notifier);
      await notifier.loadHistory();

      await notifier.loadMore();

      final state = container.read(historyControllerProvider);
      expect(state.isLoading, isFalse);
      expect(state.error, contains('500'));
      expect(state.items.single.id, 's1', reason: '第 2 页失败不该清空第 1 页');
      expect(state.page, 1, reason: '失败时页码不能前进，否则重试会跳过第 2 页');
    });
  });

  group('refresh', () {
    test('刷新失败时列表被清空（不会拿旧数据冒充刷新成功）', () async {
      var count = 0;
      adapter.handler = (options) {
        count++;
        if (count == 1) return jsonBody(pageJson(['s1']));
        return jsonBody({'message': 'boom'}, statusCode: 500);
      };
      final container = makeContainer();
      final notifier = container.read(historyControllerProvider.notifier);
      await notifier.loadHistory();
      expect(container.read(historyControllerProvider).items, hasLength(1));

      await notifier.refresh();

      final state = container.read(historyControllerProvider);
      expect(state.items, isEmpty);
      expect(state.error, contains('500'));
      expect(state.page, 1);
    });
  });

  group('竞态（请求序号防护）', () {
    test('并发两次 loadHistory，后发请求胜出，慢的旧结果被丢弃', () async {
      final slowGate = Completer<void>();
      var count = 0;
      adapter.handler = (options) async {
        count++;
        if (count == 1) {
          await slowGate.future;
          return jsonBody(pageJson(['old_slow']));
        }
        return jsonBody(pageJson(['new_fast']));
      };
      final container = makeContainer();
      final notifier = container.read(historyControllerProvider.notifier);

      final slow = notifier.loadHistory();
      await pumpEventQueue();
      await notifier.loadHistory();
      expect(
        container.read(historyControllerProvider).items.single.id,
        'new_fast',
        reason: '先让后发的那次落地',
      );

      slowGate.complete();
      await slow;

      final state = container.read(historyControllerProvider);
      expect(
        state.items.single.id,
        'new_fast',
        reason: '旧请求后到必须被丢弃，否则列表会闪回上一次搜索/刷新前的结果',
      );
      expect(state.isLoading, isFalse, reason: '旧请求不能把 loading 重新挂上');
    });

    test('旧请求的失败也不能盖掉新结果（error 由最新请求决定）', () async {
      final slowGate = Completer<void>();
      var count = 0;
      adapter.handler = (options) async {
        count++;
        if (count == 1) {
          await slowGate.future;
          return jsonBody({'message': 'boom'}, statusCode: 500);
        }
        return jsonBody(pageJson(['new_fast']));
      };
      final container = makeContainer();
      final notifier = container.read(historyControllerProvider.notifier);

      final slow = notifier.loadHistory();
      await pumpEventQueue();
      await notifier.loadHistory();

      slowGate.complete();
      await slow;

      final state = container.read(historyControllerProvider);
      expect(state.items.single.id, 'new_fast');
      expect(
        state.error,
        isNull,
        reason: '旧请求的 500 不该在新结果上留下一条报错（否则界面「有数据又报错」）',
      );
    });
  });

  group('账号隔离（登出即重建）', () {
    test('登出后列表清空，loadMore 不会把旧账号的数据拼进来', () async {
      var account = 'A';
      adapter.handler = (options) {
        final page = options.queryParameters['page'] as int;
        return jsonBody(
          pageJson(['${account}_p$page'], totalPages: 2, total: 2),
        );
      };
      final container = makeContainer();
      await container.read(historyControllerProvider.notifier).loadHistory();
      expect(container.read(historyControllerProvider).items.single.id, 'A_p1');

      // 登出：同一台设备、同一份 provider 状态，后端已换成 B 的数据
      account = 'B';
      await container.read(authControllerProvider.notifier).logout();
      expect(authRepository.logoutCalls, 1);

      final cleared = container.read(historyControllerProvider);
      expect(cleared.items, isEmpty, reason: '登出必须回到初始态，不能把上一个账号的历史留在屏幕上');
      expect(cleared.page, 1);
      expect(cleared.error, isNull);

      await container.read(historyControllerProvider.notifier).loadMore();

      final state = container.read(historyControllerProvider);
      expect(
        state.items.map((e) => e.id),
        isNot(contains('A_p1')),
        reason: '旧账号的第 1 页不能和新账号的第 2 页拼在一起',
      );
      expect(state.items.map((e) => e.id), ['B_p2']);
    });
  });

  group('historyDetailProvider', () {
    test('成功：返回会话与作答日志，路径带 sessionId', () async {
      adapter.responseBody = <String, dynamic>{
        'session': itemJson('sess_1'),
        'logs': [
          {
            'questionId': 101,
            'questionContent': '我国教育目的的理论基础是（ ）。',
            'options': ['A. 个人本位', 'B. 社会本位'],
            'correctAnswer': 'B',
            'userAnswer': 'A',
            'isCorrect': false,
            'duration': 32,
            'tags': ['教育目的'],
            'explanation': '解析',
          },
        ],
      };
      final container = makeContainer();

      final detail = await container.read(
        historyDetailProvider('sess_1').future,
      );

      expect(adapter.requests.single.path, '/history/sess_1');
      expect(detail.session?.id, 'sess_1');
      expect(detail.logs.single.questionId, 101);
      expect(detail.error, isNull);
      expect(detail.isLoading, isFalse);
    });

    test('失败：以 error 字段表达（不是 AsyncError），会话与日志为空', () async {
      adapter.statusCode = 404;
      adapter.responseBody = {'message': 'not found'};
      final container = makeContainer();
      final sub = container.listen(historyDetailProvider('missing'), (_, _) {});
      addTearDown(sub.close);

      final detail = await container.read(
        historyDetailProvider('missing').future,
      );

      expect(detail.session, isNull);
      expect(detail.logs, isEmpty);
      expect(detail.error, contains('404'));
      expect(
        container.read(historyDetailProvider('missing')),
        isA<AsyncData<HistoryDetailState>>(),
        reason: '实现自己 catch 了异常，provider 本身不应变成 AsyncError',
      );
    });
  });
}
