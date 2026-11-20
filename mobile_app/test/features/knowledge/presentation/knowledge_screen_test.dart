import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skeletonizer/skeletonizer.dart';

import 'package:mobile_app/features/knowledge/presentation/knowledge_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/fakes_knowledge.dart';
import '../../../support/pump_screen.dart';
import '../../../support/recording_adapter.dart';

/// 知识卡片屏：三态 + 筛选/刷新发出去的参数 + 新建对话框的三条出口
/// （校验拦下 / 提交失败留在框里 / 提交成功清空筛选）。
///
/// 断言请求而不是文案快照；控制器跑真的，假的是 Dio 适配器。这样「新建成功后
/// 列表真的刷了一次」是状态机行为，而不是测试自己摆出来的样子。
void main() {
  setUpAll(useFakeSecureStorage);

  late RecordingAdapter adapter;

  setUp(() {
    adapter = RecordingAdapter();
  });

  final skeleton = find.byWidgetPredicate((widget) => widget is Skeletonizer);

  /// 请求链路上有多跳异步（microtask → retrofit → dio → 状态落地）。
  ///
  /// 必须带时长地 pump：dio 内部用零延时定时器推进请求，纯 `pump()` 只跑微任务，
  /// 请求会永远停在「已发起」而到不了适配器（表现为骨架不消失）。
  /// 也不用 `pumpAndSettle`：骨架 shimmer 是无限动画。
  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 50));
  }

  /// 取某个分类 chip 当前的选中状态（筛选有没有被真的清掉就靠它）。
  ChoiceChip chipOf(WidgetTester tester, String label) {
    return tester.widget<ChoiceChip>(
      find.ancestor(
        of: find.text(label),
        matching: find.byType(ChoiceChip),
      ),
    );
  }

  Future<void> pumpKnowledge(WidgetTester tester) {
    return pumpScreen(
      tester,
      const KnowledgeScreen(),
      overrides: <Object>[...fakeKnowledgeApi(adapter)],
    );
  }

  testWidgets('加载中先出骨架，数据到位后渲染卡片与分类筛选', (tester) async {
    final gate = Completer<void>();
    adapter.handler = (options) async {
      await gate.future;
      return jsonBody(
        fakeKnowledgeListJson(
          cards: <Map<String, dynamic>>[
            fakeKnowledgeCardJson(id: 1, front: '最近发展区'),
          ],
          categories: <String>['教育心理学', '学习理论'],
        ),
      );
    };

    await pumpKnowledge(tester);
    await settle(tester);

    expect(skeleton, findsOneWidget, reason: '请求未回时用骨架撑住版式');
    expect(find.text('最近发展区'), findsNothing);

    gate.complete();
    await settle(tester);

    expect(skeleton, findsNothing);
    expect(find.text('最近发展区'), findsOneWidget);
    expect(find.widgetWithText(ChoiceChip, '教育心理学'), findsOneWidget);
    expect(find.widgetWithText(ChoiceChip, '全部'), findsOneWidget);
    expect(adapter.gets.single.queryParameters['limit'], 100);
  });

  testWidgets('没有卡片时给出空态而不是白屏', (tester) async {
    adapter.responseBody = fakeKnowledgeListJson();

    await pumpKnowledge(tester);
    await settle(tester);

    expect(find.text('暂无知识卡片'), findsOneWidget);
    expect(skeleton, findsNothing);
    // 没有分类时不渲染筛选条，避免一条空白的 chip 行。
    expect(find.byType(ChoiceChip), findsNothing);
  });

  testWidgets('加载失败可重试，重试真的再发一次请求', (tester) async {
    adapter.statusCode = 500;
    adapter.responseBody = <String, dynamic>{'message': 'boom'};

    await pumpKnowledge(tester);
    await settle(tester);

    expect(find.text('加载失败'), findsOneWidget);
    expect(adapter.gets, hasLength(1));

    adapter.statusCode = 200;
    adapter.responseBody = fakeKnowledgeListJson(
      cards: <Map<String, dynamic>>[
        fakeKnowledgeCardJson(id: 2, front: '重试回来的卡片'),
      ],
    );
    await tester.tap(find.text('重试'));
    await settle(tester);

    expect(adapter.gets, hasLength(2), reason: '点「重试」必须真的重发请求');
    expect(find.text('加载失败'), findsNothing);
    expect(find.text('重试回来的卡片'), findsOneWidget);
  });

  testWidgets('切分类带 category 请求，刷新沿用当前分类', (tester) async {
    adapter.responseBody = fakeKnowledgeListJson(
      cards: <Map<String, dynamic>>[
        fakeKnowledgeCardJson(id: 1, front: '卡片一', category: '教育学'),
      ],
      categories: <String>['教育心理学', '学习理论'],
    );

    await pumpKnowledge(tester);
    await settle(tester);

    expect(
      adapter.gets.single.queryParameters.containsKey('category'),
      isFalse,
      reason: '「全部」不该发一个空的 category=',
    );

    await tester.tap(find.widgetWithText(ChoiceChip, '学习理论'));
    await settle(tester);

    expect(adapter.gets, hasLength(2));
    expect(adapter.gets.last.queryParameters['category'], '学习理论');
    expect(chipOf(tester, '学习理论').selected, isTrue);
    expect(chipOf(tester, '全部').selected, isFalse);

    await tester.tap(find.byTooltip('刷新知识卡片'));
    await settle(tester);

    expect(adapter.gets, hasLength(3));
    expect(
      adapter.gets.last.queryParameters['category'],
      '学习理论',
      reason: '刷新要沿用当前筛选，否则一刷新就跳回全部分类',
    );
  });

  testWidgets('新建对话框：空字段在本地拦下，提交失败留在框里', (tester) async {
    adapter.handler = (options) {
      if (options.method == 'POST') {
        return jsonBody(<String, dynamic>{'message': 'boom'}, statusCode: 500);
      }
      return jsonBody(
        fakeKnowledgeListJson(
          cards: <Map<String, dynamic>>[
            fakeKnowledgeCardJson(id: 1, front: '原有卡片'),
          ],
        ),
      );
    };

    await pumpKnowledge(tester);
    await settle(tester);

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('新建知识卡片'), findsOneWidget);

    await tester.tap(find.widgetWithText(ElevatedButton, '保存'));
    await tester.pump();
    expect(find.text('正面和背面不能为空'), findsOneWidget);
    expect(
      adapter.posts,
      isEmpty,
      reason: '空字段必须在本地拦下，不该给服务端发一个空载荷',
    );

    await tester.enterText(find.byType(TextField).at(0), '什么是最近发展区');
    await tester.enterText(find.byType(TextField).at(1), '现有水平与潜在水平之间');
    await tester.tap(find.widgetWithText(ElevatedButton, '保存'));
    await settle(tester);

    expect(adapter.posts, hasLength(1));
    expect(find.text('创建失败，请检查网络后重试'), findsOneWidget);
    expect(
      find.text('新建知识卡片'),
      findsOneWidget,
      reason: '提交失败要留在对话框里，让用户改完再提交（关掉就等于让他重输一遍）',
    );
  });

  testWidgets('新建成功：载荷正确、列表刷新、筛选被清空', (tester) async {
    var created = false;
    adapter.handler = (options) {
      if (options.method == 'POST') {
        created = true;
        return jsonBody(<String, dynamic>{'id': 3});
      }
      final cards = <Map<String, dynamic>>[
        fakeKnowledgeCardJson(id: 1, front: '原有卡片', category: '教育学'),
        if (created) fakeKnowledgeCardJson(id: 3, front: '最近发展区'),
      ];
      return jsonBody(
        fakeKnowledgeListJson(
          cards: cards,
          categories: <String>['教育心理学', '学习理论'],
        ),
      );
    };

    await pumpKnowledge(tester);
    await settle(tester);

    await tester.tap(find.widgetWithText(ChoiceChip, '学习理论'));
    await settle(tester);
    expect(chipOf(tester, '学习理论').selected, isTrue);
    expect(find.text('最近发展区'), findsNothing);

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    await tester.enterText(find.byType(TextField).at(0), '最近发展区');
    await tester.enterText(find.byType(TextField).at(1), '现有水平与潜在水平之间');
    await tester.tap(find.widgetWithText(ElevatedButton, '保存'));
    await settle(tester);
    // 对话框退场动画还没跑完时，里面的输入框仍在树上（会跟列表里的同名卡片
    // 撞 finder），所以多推一段固定时长，不用 pumpAndSettle。
    await tester.pump(const Duration(milliseconds: 400));

    expect(adapter.posts.single.path, '/knowledge/cards');
    expect(adapter.posts.single.data, <String, dynamic>{
      'title': '最近发展区',
      'front': '最近发展区',
      'back': '现有水平与潜在水平之间',
      'category': '未分类',
      'tags': <String>[],
    });

    expect(
      adapter.gets,
      hasLength(3),
      reason: '初始加载 + 切分类 + 创建成功后刷新，缺一次说明新建完列表没刷新',
    );
    expect(
      adapter.gets.last.queryParameters.containsKey('category'),
      isFalse,
      reason: '创建后刷新的是全量列表',
    );
    expect(find.text('最近发展区'), findsOneWidget);
    expect(find.text('知识卡片创建成功'), findsOneWidget);
    expect(
      chipOf(tester, '全部').selected,
      isTrue,
      reason: '新建后必须清空筛选，否则用户看不到自己刚建的卡片',
    );
    expect(chipOf(tester, '学习理论').selected, isFalse);
  });
}
