import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/network/server_config.dart';
import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/features/agent_sets/presentation/agent_set_inbox_provider.dart';
import 'package:mobile_app/features/agent_sets/presentation/agent_set_notifier.dart';

import '../../../support/fake_preferences_store.dart';
import '../../../support/recording_adapter.dart';
import '../../../support/fakes_agent_sets.dart';
import '../../../support/pump_screen.dart';

/// 未读汇总与通知：拉一次列表算未读、只在「变多」时发通知、失败不清零角标。
///
/// 通知去重靠一个持久化游标（`PreferencesKeys.agentSetUnreadSeen`）：契约 §6 明说
/// 不做服务端推送，如果每次启动都对同一批未读弹一次，用户第一次就会把通知关掉。
void main() {
  AgentSetsStubAdapter pageAdapter({
    int unread1 = 3,
    int unread2 = 2,
    int pending1 = 2,
  }) {
    return AgentSetsStubAdapter(
      (_) => agentSetsJson(
        agentSetPageJson(
          sets: <Map<String, dynamic>>[
            agentSetJson(
              id: 1,
              title: '教育目的专项',
              unreadCount: unread1,
              pendingCount: pending1,
            ),
            agentSetJson(
              id: 2,
              title: '心理学基础',
              unreadCount: unread2,
              pendingCount: 0,
            ),
          ],
        ),
      ),
    );
  }

  ProviderContainer makeContainer(
    AgentSetsStubAdapter adapter, {
    FakeAgentSetNotifier? notifier,
    FakePreferencesStore? store,
  }) {
    final container = ProviderContainer(
      retry: (_, _) => null,
      overrides: <Object>[
        ...fakeAgentSets(adapter),
        agentSetNotifierProvider.overrideWithValue(
          notifier ?? FakeAgentSetNotifier(),
        ),
        preferencesStoreProvider.overrideWithValue(
          store ?? FakePreferencesStore(),
        ),
      ].cast(),
    );
    addTearDown(container.dispose);
    return container;
  }

  test('未读变多：发一条通知（带新题数与题集名），并把游标推到最新的未读数', () async {
    final notifier = FakeAgentSetNotifier();
    final store = FakePreferencesStore(
      initial: <String, String>{PreferencesKeys.agentSetUnreadSeen: '1'},
    );
    final container = makeContainer(
      pageAdapter(),
      notifier: notifier,
      store: store,
    );

    await container.read(agentSetInboxProvider.notifier).refresh();

    final state = container.read(agentSetInboxProvider);
    expect(state.loaded, isTrue);
    expect(state.unreadCount, 5);
    expect(state.inbox?.pendingCount, 2);
    expect(notifier.sent, hasLength(1));
    expect(notifier.sent.single.title, 'AI 题集');
    expect(notifier.sent.single.body, '有 4 道新题等你做 · 《教育目的专项》');
    expect(store.values[PreferencesKeys.agentSetUnreadSeen], '5');
  });

  test('未读没变：不发通知，也不写游标', () async {
    final notifier = FakeAgentSetNotifier();
    final store = FakePreferencesStore(
      initial: <String, String>{PreferencesKeys.agentSetUnreadSeen: '5'},
    );
    final container = makeContainer(
      pageAdapter(),
      notifier: notifier,
      store: store,
    );

    await container.read(agentSetInboxProvider.notifier).refresh();

    expect(container.read(agentSetInboxProvider).unreadCount, 5);
    expect(notifier.sent, isEmpty);
    expect(store.writes, isEmpty);
  });

  test('未读变少（去做了）：不发通知，但游标跟着下调', () async {
    final notifier = FakeAgentSetNotifier();
    final store = FakePreferencesStore(
      initial: <String, String>{PreferencesKeys.agentSetUnreadSeen: '9'},
    );
    final container = makeContainer(
      pageAdapter(),
      notifier: notifier,
      store: store,
    );

    await container.read(agentSetInboxProvider.notifier).refresh();

    expect(notifier.sent, isEmpty);
    expect(store.values[PreferencesKeys.agentSetUnreadSeen], '5');
  });

  test('通知没送达（如用户拒权）：不推进游标，下次回前台还能再试', () async {
    final notifier = FakeAgentSetNotifier(delivered: false);
    final store = FakePreferencesStore(
      initial: <String, String>{PreferencesKeys.agentSetUnreadSeen: '1'},
    );
    final container = makeContainer(
      pageAdapter(),
      notifier: notifier,
      store: store,
    );

    await container.read(agentSetInboxProvider.notifier).refresh();

    expect(notifier.sent, hasLength(1));
    expect(store.values[PreferencesKeys.agentSetUnreadSeen], '1');
  });

  test('读游标失败：按 0 处理（顶多多发一条，不会漏）', () async {
    final notifier = FakeAgentSetNotifier();
    final store = FakePreferencesStore()..readError = Exception('磁盘坏了');
    final container = makeContainer(
      pageAdapter(),
      notifier: notifier,
      store: store,
    );

    await container.read(agentSetInboxProvider.notifier).refresh();

    expect(notifier.sent, hasLength(1));
    expect(notifier.sent.single.body, startsWith('有 5 道新题'));
  });

  test('请求失败：保留上一次的未读（断网不把角标清零），并记下原因', () async {
    var offline = false;
    final adapter = AgentSetsStubAdapter((options) {
      if (offline) {
        offlineException(options);
      }
      return agentSetsJson(
        agentSetPageJson(
          sets: <Map<String, dynamic>>[agentSetJson(id: 1, unreadCount: 4)],
        ),
      );
    });
    final container = makeContainer(adapter);

    final controller = container.read(agentSetInboxProvider.notifier);
    await controller.refresh();
    expect(container.read(agentSetInboxProvider).unreadCount, 4);

    offline = true;
    await controller.refresh();

    final state = container.read(agentSetInboxProvider);
    expect(state.unreadCount, 4, reason: '失败不能把「有 4 道未读」抹成 0');
    expect(state.errorMessage, isNotNull);
    expect(state.loading, isFalse);
  });

  testWidgets('启动拉一次、回前台再拉一次；并发触发时只算一次', (tester) async {
    final adapter = pageAdapter();
    await pumpScreen(
      tester,
      const AgentSetInboxWatcher(child: SizedBox.shrink()),
      overrides: <Object>[
        ...fakeAgentSets(adapter),
        ...fakeAgentSetNotify(),
        initialServerBaseUrlProvider.overrideWithValue(
          'http://10.0.2.2:3000/api',
        ),
      ],
    );
    for (var index = 0; index < 4; index++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(adapter.gets, hasLength(1), reason: '挂载即拉一次');

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    for (var index = 0; index < 4; index++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(adapter.gets, hasLength(2), reason: '回前台再拉一次');
  });

  testWidgets('没有服务器地址：启动时不发请求（不制造必然失败的调用）', (tester) async {
    final adapter = pageAdapter();
    await pumpScreen(
      tester,
      const AgentSetInboxWatcher(child: SizedBox.shrink()),
      overrides: <Object>[...fakeAgentSets(adapter), ...fakeAgentSetNotify()],
    );
    for (var index = 0; index < 4; index++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(adapter.requests, isEmpty);
  });
}
