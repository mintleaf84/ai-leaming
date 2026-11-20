import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skeletonizer/skeletonizer.dart';

import 'package:mobile_app/features/practice/data/practice_repository_impl.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/presentation/question_list_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/fakes_qbank.dart';
import '../../../support/pump_screen.dart';

/// 全量题库屏：只守**屏自己的契约**——三态、搜索/翻页发出去的参数、预览弹层。
///
/// 判题、解析、组卷都不在这里测（那些在 `practice_provider_test.dart` /
/// `questions_provider_test.dart` 已覆盖）。这里假的是仓库，控制器跑真的，
/// 所以「慢请求→骨架」「失败→重试真的重发」是状态机真跑出来的结果。
void main() {
  setUpAll(useFakeSecureStorage);

  /// `Skeletonizer` 是抽象类 + 工厂构造，`find.byType` 永远找不到（见计划 §6.1）。
  final skeleton = find.byWidgetPredicate((widget) => widget is Skeletonizer);

  /// 请求链路上有多跳异步（microtask → 仓库 → 状态落地），统一推到稳态。
  /// 不用 `pumpAndSettle`：列表尾部的分页 spinner 是无限动画，settle 会超时。
  /// 带时长地 pump 一轮，顺带把 dio 内部零延时定时器推过去。
  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 50));
  }

  Question question(
    int n, {
    String type = 'single',
    String? dimension,
    String? explanation,
  }) {
    return Question(
      id: '$n',
      content: '第 $n 题：下列说法正确的是？',
      options: const <String>['选项甲', '选项乙', '选项丙', '选项丁'],
      type: type,
      tags: const <String>['教育学'],
      dimension: dimension,
      explanation: explanation,
    );
  }

  Future<void> pumpList(WidgetTester tester, FakeQbankRepository repository) {
    return pumpScreen(
      tester,
      const QuestionListScreen(),
      overrides: <Object>[
        practiceRepositoryProvider.overrideWithValue(repository),
      ],
    );
  }

  testWidgets('加载中先出骨架，数据到位后骨架消失并渲染题目', (tester) async {
    final gate = Completer<void>();
    final repository = FakeQbankRepository(
      questions: <Question>[
        question(1, type: 'multi', dimension: '教育心理学'),
      ],
      listGate: gate,
    );

    await pumpList(tester, repository);
    await settle(tester);

    expect(
      skeleton,
      findsOneWidget,
      reason: '请求还没回来就该用骨架撑住版式，而不是先闪一下空列表',
    );
    expect(find.textContaining('第 1 题'), findsNothing);

    gate.complete();
    await settle(tester);

    expect(skeleton, findsNothing);
    expect(find.textContaining('第 1 题'), findsOneWidget);
    expect(find.text('多选'), findsOneWidget, reason: '非单选题型要显示「多选」标签');
    expect(find.text('教育心理学'), findsOneWidget);
    expect(repository.listCalls, 1, reason: '进屏只该拉一次第一页');
  });

  testWidgets('空结果：退出骨架、不显示失败，也不留分页 spinner', (tester) async {
    final repository = FakeQbankRepository(
      questions: const <Question>[],
      total: 0,
    );

    await pumpList(tester, repository);
    await settle(tester);

    expect(skeleton, findsNothing, reason: '空结果是稳态，不能一直挂在「加载中」');
    expect(find.textContaining('加载失败'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(repository.listCalls, 1);
    expect(
      find.text('这里还没有题目'),
      findsOneWidget,
      reason: '列表空着不写字就是一片白，用户分不清「没有题」和「还没加载完」',
    );
    expect(find.text('清空搜索'), findsNothing, reason: '没有搜索词时不该出现「清空搜索」');
  });

  testWidgets('搜索没有结果：给空态与「清空搜索」，点了回到全部题目', (tester) async {
    final all = <Question>[question(1), question(2)];
    final repository = FakeQbankRepository(
      responder: (request) => request.search == null
          ? (items: all, total: all.length)
          : (items: const <Question>[], total: 0),
    );

    await pumpList(tester, repository);
    await settle(tester);

    await tester.enterText(find.byType(TextField), '不存在的词');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await settle(tester);

    expect(repository.requests.last.search, '不存在的词');
    expect(
      find.text('没有找到相关题目'),
      findsOneWidget,
      reason: '搜索无结果必须说清是「没搜到」，而不是当成题库为空',
    );
    expect(find.text('这里还没有题目'), findsNothing);

    await tester.tap(find.text('清空搜索'));
    await settle(tester);

    expect(
      repository.requests.last.search,
      isNull,
      reason: '清空搜索要真的按「不带关键词」重新检索，而不是只改文案',
    );
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller?.text,
      isEmpty,
      reason: '输入框也得清空，否则框里还是旧词、列表却是全部',
    );
    expect(find.textContaining('第 1 题'), findsOneWidget);
    expect(find.text('没有找到相关题目'), findsNothing);
  });

  testWidgets('加载失败可重试，重试真的再发一次请求', (tester) async {
    final repository = FakeQbankRepository()
      ..listError = Exception('socket closed');

    await pumpList(tester, repository);
    await settle(tester);

    expect(find.textContaining('加载失败'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);
    expect(repository.listCalls, 1);

    repository
      ..listError = null
      ..questions = <Question>[question(2)];
    await tester.tap(find.text('重试'));
    await settle(tester);

    expect(repository.listCalls, 2, reason: '点「重试」必须真的重发请求，而不是只清掉错误文案');
    expect(find.textContaining('加载失败'), findsNothing);
    expect(find.textContaining('第 2 题'), findsOneWidget);
  });

  testWidgets('搜索提交按关键词重新检索（断言请求参数而不是列表文案）', (tester) async {
    final all = <Question>[question(1), question(2)];
    final matched = <Question>[question(9, dimension: '心理学')];
    final repository = FakeQbankRepository(
      responder: (request) => request.search == null
          ? (items: all, total: all.length)
          : (items: matched, total: matched.length),
    );

    await pumpList(tester, repository);
    await settle(tester);

    expect(repository.requests.single.search, isNull);
    expect(repository.requests.single.limit, 20);

    await tester.enterText(find.byType(TextField), ' 心理学 ');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await settle(tester);

    expect(repository.requests, hasLength(2));
    expect(
      repository.requests.last.search,
      '心理学',
      reason: '关键词要去掉首尾空白后进 query，否则后端会拿带空格的词查空',
    );
    expect(repository.requests.last.page, 1, reason: '换关键词必须从第 1 页重新开始');
    // 换词后旧列表必须被换掉，不能把上一次的结果留在屏上。
    expect(find.textContaining('第 9 题'), findsOneWidget);
    expect(find.textContaining('第 1 题'), findsNothing);
  });

  testWidgets('滑到底部翻下一页，到底之后不再重复请求', (tester) async {
    final page1 = <Question>[for (var i = 1; i <= 20; i++) question(i)];
    final page2 = <Question>[for (var i = 21; i <= 40; i++) question(i)];
    final nextPageGate = Completer<void>();
    final repository = FakeQbankRepository(
      responder: (request) => (request.page ?? 1) == 1
          ? (items: page1, total: 40)
          : (items: page2, total: 40),
      nextPageGate: nextPageGate,
    );

    await pumpList(tester, repository);
    await settle(tester);

    expect(repository.requests.single.page, 1);

    await tester.drag(find.byType(ListView), const Offset(0, -4000));
    await tester.pump();

    expect(
      find.byType(CircularProgressIndicator),
      findsOneWidget,
      reason: '还有下一页时列表末尾要有加载指示，否则用户以为已经到底',
    );

    nextPageGate.complete();
    await settle(tester);

    expect(repository.requests, hasLength(2));
    expect(repository.requests.last.page, 2, reason: '滚到底要翻第 2 页，而不是重发第 1 页');
    expect(repository.requests.last.search, isNull);

    // 已经到底（hasMore=false），再滑不该继续发请求。
    await tester.drag(find.byType(ListView), const Offset(0, -4000));
    await settle(tester);

    expect(repository.listCalls, 2);
    expect(find.textContaining('第 40 题'), findsOneWidget);
    expect(
      find.byType(CircularProgressIndicator),
      findsNothing,
      reason: '到底之后不该还挂着「加载更多」指示',
    );
  });

  testWidgets('点卡片打开预览弹层：选项与解析可见，加入练习给出提示', (tester) async {
    final repository = FakeQbankRepository(
      questions: <Question>[
        const Question(
          id: '7',
          content: '第 7 题：材料分析',
          options: <String>['选项甲', '选项乙'],
          tags: <String>['教育学'],
          explanation: '这是解析正文',
        ),
      ],
    );

    await pumpList(tester, repository);
    await settle(tester);

    await tester.tap(find.textContaining('第 7 题'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('A. 选项甲'), findsOneWidget);
    expect(find.text('B. 选项乙'), findsOneWidget);
    expect(find.text('解析'), findsOneWidget);
    expect(find.text('关闭'), findsOneWidget);

    await tester.tap(find.text('加入练习'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('单题练习跳转功能准备接管...'), findsOneWidget);
    expect(find.text('加入练习'), findsNothing, reason: '点了之后弹层应关闭，不该叠在列表上');
  });
}
