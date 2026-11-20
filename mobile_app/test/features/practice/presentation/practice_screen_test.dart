import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:skeletonizer/skeletonizer.dart';

import 'package:mobile_app/core/theme/app_icons.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/presentation/practice_screen.dart';
import 'package:mobile_app/features/practice/presentation/widgets/question_material_card.dart';
import 'package:mobile_app/shared/widgets/animated_option_card.dart';
import 'package:mobile_app/shared/widgets/state_views.dart';

import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

/// 练习屏冒烟：只守**渲染与状态切换**，不守判卷逻辑（那是
/// `test/features/practice/practice_provider_test.dart` 的事）。
///
/// 为什么这里要跑真控制器：练习屏的三态（骨架 / 作答 / 失败）全部由
/// `PracticeSessionState` 派生。塞一个假状态进去只能证明「屏会读 state」，
/// 证明不了「仓库慢的时候真的出骨架、提交炸了真的停在原题」。所以这里假的是
/// 仓库，控制器用真的。
void main() {
  setUpAll(useFakeSecureStorage);

  /// `Skeletonizer` 是抽象类 + 工厂构造（真实类型是私有的 `_Skeletonizer`），
  /// `find.byType` 比的是 runtimeType，永远找不到。用类型谓词代替。
  final skeleton = find.byWidgetPredicate((widget) => widget is Skeletonizer);

  /// 首帧之后还有「读 token → 建会话 → 落状态」两跳异步，多推两帧到稳态。
  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump();
  }

  /// 点选项卡片。
  ///
  /// 卡片外面套了 `Transform.scale`，`tap(finder)` 的「命中校验」认不到这层
  /// 代理（它会提示 would not hit test），于是用 tapAt + getCenter：
  /// 命中的仍是卡片内部的 GestureDetector，只是跳过了那层无意义的校验。
  Future<void> tapCard(WidgetTester tester, Finder finder) async {
    await tester.tapAt(tester.getCenter(finder));
    await tester.pump();
  }

  testWidgets('加载中：骨架撑住整题版式，不先闪一下空题库', (tester) async {
    final gate = Completer<void>();
    final repository = FakePracticeRepository(createGate: gate);

    await pumpScreen(
      tester,
      const PracticeScreen(),
      overrides: fakePractice(repository: repository),
    );
    await settle(tester);

    expect(repository.createCalls, 1);
    // 骨架用的是**真实版式**（Skeletonizer 把假数据涂成骨块），所以这里
    // 能看到选项卡片是正常的；关键是骨架层在、空态不在。
    expect(skeleton, findsOneWidget);
    expect(find.byType(AppEmptyView), findsNothing);

    gate.complete();
    await settle(tester);

    // 骨架换成真题目：同一套版式，只是数据到位了
    expect(skeleton, findsNothing);
    expect(find.byType(AnimatedOptionCard), findsNWidgets(4));
  });

  testWidgets('作答中：题干与选项渲染，点选项切换选中态（单选覆盖）', (tester) async {
    final question = fakeQuestion(content: '题干甲：下列说法正确的是？');
    final repository = FakePracticeRepository(questions: <Question>[question]);

    await pumpScreen(
      tester,
      const PracticeScreen(),
      overrides: fakePractice(repository: repository),
    );
    await settle(tester);

    expect(find.text(question.content), findsOneWidget);
    final cards = find.byType(AnimatedOptionCard);
    expect(cards, findsNWidgets(question.options.length));

    // 初始没有任何选中
    for (final card in tester.widgetList<AnimatedOptionCard>(cards)) {
      expect(card.isSelected, isFalse);
    }

    await tapCard(tester, cards.first);
    expect(
      tester.widget<AnimatedOptionCard>(cards.first).isSelected,
      isTrue,
      reason: '点第一项后它应当是选中态',
    );

    // 单选：点第二项后第一项必须让位（不是多选那种累加）
    await tapCard(tester, cards.at(1));
    expect(tester.widget<AnimatedOptionCard>(cards.first).isSelected, isFalse);
    expect(tester.widget<AnimatedOptionCard>(cards.at(1)).isSelected, isTrue);
  });

  testWidgets('提交失败：停在当前题，确认入口还能再点（不弹结果、不跳题）', (tester) async {
    final question = fakeQuestion(content: '题干乙：下列说法正确的是？');
    final repository = FakePracticeRepository(
      questions: <Question>[question],
      submitError: StateError('network down'),
    );

    await pumpScreen(
      tester,
      const PracticeScreen(),
      overrides: fakePractice(repository: repository),
    );
    await settle(tester);

    await tapCard(tester, find.byType(AnimatedOptionCard).first);

    // 未提交时中间的圆形按钮是 AppIcons.check（提交/确认）
    expect(find.byIcon(AppIcons.check), findsOneWidget);
    await tester.tap(find.byIcon(AppIcons.check));
    await settle(tester);

    expect(repository.submitCalls, 1);
    // 仍停在这道题：题干还在、选项还是可点的、确认入口还在
    expect(find.text(question.content), findsOneWidget);
    expect(find.byIcon(AppIcons.check), findsOneWidget);
    expect(
      tester
          .widget<AnimatedOptionCard>(find.byType(AnimatedOptionCard).first)
          .isSelected,
      isTrue,
      reason: '提交失败不能把用户已经选好的答案清掉',
    );

    // 再点一次就是「重试」：同一个入口，不需要额外的重试按钮
    await tester.tap(find.byIcon(AppIcons.check));
    await settle(tester);
    expect(repository.submitCalls, 2);
  });

  testWidgets('建会话失败：错误视图 + 重试出口能再发一次请求', (tester) async {
    final repository = FakePracticeRepository(
      createError: StateError('offline'),
    );

    await pumpScreen(
      tester,
      const PracticeScreen(),
      overrides: fakePractice(repository: repository),
    );
    await settle(tester);

    expect(find.byType(AppErrorView), findsOneWidget);
    expect(find.byType(AnimatedOptionCard), findsNothing);

    // 重试按钮是 `ElevatedButton.icon`（私有子类，find.byType(ElevatedButton)
    // 匹配不到），按图标找：错误视图里只有一个刷新图标。
    final retry = find.descendant(
      of: find.byType(AppErrorView),
      matching: find.byIcon(AppIcons.refresh),
    );
    expect(retry, findsOneWidget);

    await tester.tap(retry);
    await settle(tester);
    expect(repository.createCalls, 2);
  });

  testWidgets('题库为空：走空态而不是错误态', (tester) async {
    final repository = FakePracticeRepository(questions: <Question>[]);

    await pumpScreen(
      tester,
      const PracticeScreen(),
      overrides: fakePractice(repository: repository),
    );
    await settle(tester);

    expect(find.byType(AppEmptyView), findsOneWidget);
    expect(find.byType(AppErrorView), findsNothing);
  });

  // ---------------------------------------------------------------------
  // 材料题（服务端 practice.ts 的 material / material_html）
  // ---------------------------------------------------------------------

  /// 材料卡折叠判定要等「布局 → post-frame 回报高度 → setState」这一跳，
  /// `settle()` 只推两帧有时不够，多推一帧到稳态。
  Future<void> settleMaterial(WidgetTester tester) async {
    await settle(tester);
    await tester.pump();
    await tester.pump();
  }

  testWidgets('材料题：有 material_html 时渲染「材料」卡与富文本', (tester) async {
    final question = fakeQuestion(
      content: '根据材料，下列说法正确的是？',
      material: '材料纯文本兜底',
      materialHtml: '<p>材料<b>富文本</b>正文</p>',
    );
    final repository = FakePracticeRepository(questions: <Question>[question]);

    await pumpScreen(
      tester,
      const PracticeScreen(),
      overrides: fakePractice(repository: repository),
    );
    await settleMaterial(tester);

    expect(find.byType(QuestionMaterialCard), findsOneWidget);
    expect(find.text('材料'), findsOneWidget);
    // HTML 优先：卡片里出现的是富文本的内容，不是纯文本兜底
    expect(find.text('材料富文本正文', findRichText: true), findsOneWidget);
    expect(find.text('材料纯文本兜底'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('材料题：只有纯文本 material 时也能渲染材料卡', (tester) async {
    final question = fakeQuestion(
      material: '只有纯文本的材料正文。',
    );
    final repository = FakePracticeRepository(questions: <Question>[question]);

    await pumpScreen(
      tester,
      const PracticeScreen(),
      overrides: fakePractice(repository: repository),
    );
    await settleMaterial(tester);

    expect(find.byType(QuestionMaterialCard), findsOneWidget);
    expect(find.text('材料'), findsOneWidget);
    expect(find.text('只有纯文本的材料正文。'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('非材料题：无 material / material_html 时材料卡不占位', (tester) async {
    final question = fakeQuestion(content: '普通单选题：没有材料。');
    final repository = FakePracticeRepository(questions: <Question>[question]);

    await pumpScreen(
      tester,
      const PracticeScreen(),
      overrides: fakePractice(repository: repository),
    );
    await settleMaterial(tester);

    // 卡片本身在树里（统一入口），但渲染成 SizedBox.shrink，不占任何高度
    expect(find.byType(QuestionMaterialCard), findsOneWidget);
    expect(find.text('材料'), findsNothing);
    expect(find.text('展开'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('材料题：超长材料 + 1.3 倍字号不溢出，折叠后可展开', (tester) async {
    // 400 字 × 18.2 字号，在 375 宽下必然超过 6 行 → 触发折叠
    final longMaterial = List<String>.generate(
      20,
      (index) => '第${index + 1}段材料：教学过程中教师应遵循直观性原则、'
          '启发性原则与循序渐进原则，并结合学生身心发展规律组织课堂。',
    ).join('\n');
    final question = fakeQuestion(material: longMaterial);
    final repository = FakePracticeRepository(questions: <Question>[question]);

    await pumpScreen(
      tester,
      const PracticeScreen(),
      overrides: fakePractice(repository: repository),
      textScale: 1.3,
    );
    await settleMaterial(tester);

    // 关键：长材料 + 大字号不能抛 RenderFlex/Overflow 异常
    expect(tester.takeException(), isNull);
    expect(find.text('材料'), findsOneWidget);
    // 超过 6 行 → 折叠，出现「展开」出口
    expect(find.text('展开'), findsOneWidget);

    await tester.tap(find.text('展开'));
    await settleMaterial(tester);
    expect(find.text('收起'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
