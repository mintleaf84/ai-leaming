import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skeletonizer/skeletonizer.dart';

import 'package:mobile_app/core/navigation/app_nav.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/history/presentation/history_detail_screen.dart';
import 'package:mobile_app/features/history/presentation/history_screen.dart';
import 'package:mobile_app/shared/widgets/empty_state.dart';

import '../../../support/fake_providers.dart';
import '../../../support/fakes_misc.dart';
import '../../../support/pump_router_misc.dart';
import '../../../support/pump_screen.dart';
import '../../../support/recording_adapter.dart';

/// 练习历史屏：三态（骨架/空/失败）、失败重试真的重发、触底翻页、
/// 以及「点条目进的是这一场详情」。
///
/// 用**真控制器 + Dio 桩**而不是假控制器：三态与分页全部由
/// `HistoryListState` 派生，塞状态只能证明「屏会读 state」；真控制器才能
/// 证明「请求慢时出骨架、失败后可重试、滚到底真的请求了第 2 页」。
void main() {
  setUpAll(useFakeSecureStorage);

  final skeleton = find.byWidgetPredicate((widget) => widget is Skeletonizer);

  Map<String, dynamic> itemJson(String id, {int accuracy = 80}) {
    return <String, dynamic>{
      'id': id,
      'sessionName': '综合练习',
      'totalQuestions': 10,
      'correctCount': accuracy ~/ 10,
      'createdAt': '2026-11-20T09:30:00.000Z',
      'accuracy': accuracy,
      'practiceMode': 'random',
    };
  }

  Map<String, dynamic> pageJson(
    List<Map<String, dynamic>> items, {
    required int totalPages,
  }) {
    return <String, dynamic>{
      'items': items,
      'total': items.length,
      'totalPages': totalPages,
    };
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('加载中出骨架，不先闪「暂无练习记录」', (tester) async {
    final gate = Completer<void>();
    final adapter = RecordingAdapter();
    adapter.handler = (options) async {
      await gate.future;
      return jsonBody(pageJson(<Map<String, dynamic>>[
        itemJson('session_1', accuracy: 80),
      ], totalPages: 1));
    };

    await pumpScreen(
      tester,
      const HistoryScreen(),
      overrides: <Object>[
        dioProvider.overrideWithValue(fakeDio(adapter)),
        ...fakePreferences(),
      ],
    );
    await settle(tester);

    expect(skeleton, findsOneWidget, reason: '首屏加载应铺骨架撑住版式');
    expect(find.byType(EmptyState), findsNothing);

    gate.complete();
    await settle(tester);

    expect(skeleton, findsNothing);
    expect(find.text('80%'), findsOneWidget);
  });

  testWidgets('空列表：出引导空态，且不显示骨架', (tester) async {
    final adapter = RecordingAdapter(
      handler: (options) => jsonBody(
        pageJson(<Map<String, dynamic>>[], totalPages: 0),
      ),
    );

    await pumpScreen(
      tester,
      const HistoryScreen(),
      overrides: <Object>[
        dioProvider.overrideWithValue(fakeDio(adapter)),
        ...fakePreferences(),
      ],
    );
    await settle(tester);

    expect(find.byType(EmptyState), findsOneWidget);
    expect(find.text('暂无练习记录'), findsOneWidget);
    expect(find.text('开始练习'), findsOneWidget);
    expect(skeleton, findsNothing);
  });

  testWidgets('失败：显示「加载失败」不冒充空态，点重试真的再发一次', (tester) async {
    final adapter = RecordingAdapter();
    var attempts = 0;
    adapter.handler = (options) {
      attempts++;
      if (attempts == 1) {
        return jsonBody(<String, dynamic>{'message': 'boom'}, statusCode: 500);
      }
      return jsonBody(pageJson(<Map<String, dynamic>>[
        itemJson('session_2', accuracy: 90),
      ], totalPages: 1));
    };

    await pumpScreen(
      tester,
      const HistoryScreen(),
      overrides: <Object>[
        dioProvider.overrideWithValue(fakeDio(adapter)),
        ...fakePreferences(),
      ],
    );
    await settle(tester);

    expect(find.text('加载失败'), findsOneWidget);
    expect(
      find.byType(EmptyState),
      findsNothing,
      reason: '失败不能显示成「暂无练习记录」，否则用户以为数据丢了',
    );
    expect(adapter.requests, hasLength(1));

    await tester.tap(find.text('重试'));
    await settle(tester);

    expect(adapter.requests, hasLength(2), reason: '重试必须真的重发请求');
    expect(find.text('90%'), findsOneWidget);
    expect(find.text('加载失败'), findsNothing);
  });

  testWidgets('滚动触底：请求第 2 页并把新条目追加到列表', (tester) async {
    final adapter = RecordingAdapter();
    adapter.handler = (options) {
      final page = '${options.queryParameters['page']}';
      if (page == '2') {
        return jsonBody(pageJson(<Map<String, dynamic>>[
          itemJson('session_9', accuracy: 55),
        ], totalPages: 2));
      }
      return jsonBody(pageJson(<Map<String, dynamic>>[
        for (var i = 1; i <= 8; i++) itemJson('session_$i', accuracy: 80),
      ], totalPages: 2));
    };

    await pumpScreen(
      tester,
      const HistoryScreen(),
      overrides: <Object>[
        dioProvider.overrideWithValue(fakeDio(adapter)),
        ...fakePreferences(),
      ],
    );
    await settle(tester);

    // ListView.builder 只建可视区内的条目，不能断言 8 个全部在树上。
    expect(find.text('80%'), findsAtLeastNWidgets(1));
    expect(adapter.requests, hasLength(1));

    await tester.drag(find.byType(ListView), const Offset(0, -900));
    await settle(tester);

    final pages = adapter.requests
        .map((request) => '${request.queryParameters['page']}')
        .toList();
    expect(pages, <String>['1', '2'], reason: '触底应只追加下一页，不跳页');
    expect(find.text('55%'), findsOneWidget, reason: '第 2 页条目要拼到列表尾部');
  });

  testWidgets('点击条目：进入这一场的详情页（带 sessionId）', (tester) async {
    final adapter = RecordingAdapter();
    adapter.handler = (options) {
      final path = options.uri.path;
      if (path.endsWith('/history')) {
        return jsonBody(pageJson(<Map<String, dynamic>>[
          itemJson('session_9', accuracy: 80),
        ], totalPages: 1));
      }
      if (path.endsWith('/history/session_9')) {
        return jsonBody(<String, dynamic>{
          'session': itemJson('session_9', accuracy: 80),
          'logs': <Map<String, dynamic>>[],
        });
      }
      return jsonBody(const <String, dynamic>{});
    };

    final router = await pumpRouter(
      tester,
      initialLocation: AppRoutes.history,
      overrides: <Object>[
        dioProvider.overrideWithValue(fakeDio(adapter)),
        ...fakePreferences(),
      ],
    );
    await settle(tester);

    expect(find.text('80%'), findsOneWidget);
    await tester.tap(find.text('80%'));
    await settle(tester);

    expect(find.byType(HistoryDetailScreen), findsOneWidget);
    expect(router.canPop(), isTrue, reason: '详情页压在列表之上，返回可回列表');
    expect(
      adapter.requests.map((request) => request.uri.path),
      contains('/api/history/session_9'),
      reason: '点的是哪一条就要带上它的 id',
    );
  });
}
