import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/features/wrong_book/domain/wrong_question.dart';
import 'package:mobile_app/features/wrong_book/presentation/wrong_book_provider.dart';
import 'package:mobile_app/features/wrong_book/presentation/wrong_book_screen.dart';
import 'package:mobile_app/shared/widgets/state_views.dart';

import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

/// 错题本冒烟。
///
/// 这屏有三个视图（列表 / 按知识点 / 已掌握），底部操作栏**只在列表视图且
/// 有题目时**存在——这条件写错了就会出现「按知识点视图里点了开始练习却选了
/// 一堆看不见的题」。所以这里既验视图切换后的内容，也验操作栏的存亡。
///
/// 选中集合用 `ProviderScope.containerOf` 直接读控制器状态：比断言
/// 「开始练习 (1)」这类文案稳，改文案不会把测试改红。
void main() {
  List<WrongQuestion> twoQuestions() => <WrongQuestion>[
    fakeWrongQuestion(questionId: '1', content: '错题甲：下列说法正确的是？'),
    fakeWrongQuestion(questionId: '2', content: '错题乙：下列说法正确的是？'),
  ];

  testWidgets('列表：题目都渲染，未选中时「开始练习」不可点', (tester) async {
    final questions = twoQuestions();
    await pumpScreen(
      tester,
      const WrongBookScreen(),
      overrides: fakeWrongBook(questions: questions),
    );
    await tester.pump();

    expect(find.text('错题甲：下列说法正确的是？'), findsOneWidget);
    expect(find.text('错题乙：下列说法正确的是？'), findsOneWidget);

    final startButton = find.byType(ElevatedButton);
    expect(startButton, findsOneWidget);
    expect(
      tester.widget<ElevatedButton>(startButton).onPressed,
      isNull,
      reason: '一个都没选时不能开练习',
    );
  });

  testWidgets('多选：点卡片累加选中数，选中后「开始练习」变可用', (tester) async {
    final questions = twoQuestions();
    await pumpScreen(
      tester,
      const WrongBookScreen(),
      overrides: fakeWrongBook(questions: questions),
    );
    await tester.pump();

    final container = ProviderScope.containerOf(
      tester.element(find.byType(WrongBookScreen)),
    );

    Future<void> tapCard(String content) async {
      await tester.tapAt(tester.getCenter(find.text(content)));
      await tester.pump();
    }

    await tapCard('错题甲：下列说法正确的是？');
    expect(
      container.read(wrongBookControllerProvider).selectedIds,
      hasLength(1),
    );
    expect(
      tester.widget<ElevatedButton>(find.byType(ElevatedButton)).onPressed,
      isNotNull,
    );

    await tapCard('错题乙：下列说法正确的是？');
    expect(
      container.read(wrongBookControllerProvider).selectedIds,
      hasLength(2),
    );

    // 再点一次取消：选中数是减的，不是只增
    await tapCard('错题甲：下列说法正确的是？');
    expect(container.read(wrongBookControllerProvider).selectedIds, <String>{
      '2',
    });
  });

  testWidgets('按知识点：切过去后分组内容可见，底部操作栏消失', (tester) async {
    final questions = twoQuestions();
    final grouped = <WrongQuestionsByTag>[
      WrongQuestionsByTag(tag: '教育学', count: 2, questions: questions),
    ];

    await pumpScreen(
      tester,
      const WrongBookScreen(),
      overrides: fakeWrongBook(questions: questions, groupedByTag: grouped),
    );
    await tester.pump();

    expect(find.byType(ElevatedButton), findsOneWidget);

    // 标签页是这屏唯一的视图开关，只能按文案定位（不作为断言使用）
    await tester.tap(find.text('按知识点'));
    await tester.pump();

    final container = ProviderScope.containerOf(
      tester.element(find.byType(WrongBookScreen)),
    );
    expect(
      container.read(wrongBookControllerProvider).viewMode,
      WrongBookViewMode.byTag,
    );
    // 分组标题（知识点名）+ 组内题量
    expect(find.text('教育学'), findsOneWidget);
    expect(find.textContaining('2'), findsWidgets);
    // 非列表视图没有底部操作栏：不能让人选看不见的题
    expect(find.byType(ElevatedButton), findsNothing);
  });

  testWidgets('加载失败：错误视图 + 重试真的重新拉数据', (tester) async {
    final repository = FakeWrongBookRepository()
      ..questions = twoQuestions()
      ..loadError = StateError('boom');

    await pumpScreen(
      tester,
      const WrongBookScreen(),
      overrides: fakeWrongBook(repository: repository),
    );
    await tester.pump();

    expect(find.byType(AppErrorView), findsOneWidget);
    expect(repository.loadCalls, 1);

    // 修好之后重试应当拿到数据（证明按钮不是摆设）
    repository.loadError = null;
    await tester.tap(
      find.descendant(of: find.byType(AppErrorView), matching: find.text('重试')),
    );
    await tester.pump();
    await tester.pump();

    expect(repository.loadCalls, 2);
    expect(find.byType(AppErrorView), findsNothing);
    expect(find.text('错题甲：下列说法正确的是？'), findsOneWidget);
  });
}
