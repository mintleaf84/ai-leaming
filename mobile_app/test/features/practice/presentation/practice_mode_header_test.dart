import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/presentation/practice_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

/// 练习屏面包屑显示的是**这一场真实的模式**（审计后遗症 1）。
///
/// 之前面包屑是写死的「综合练习 / 随机模式」：从错题本、AI 题集、试卷进来的
/// 练习也照写随机。这里用真控制器 + 假仓库，从入口配置一路走到渲染，
/// 断言的是「界面拿到的是状态里的模式」，而不是某张文案表。
void main() {
  setUpAll(useFakeSecureStorage);

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump();
  }

  Future<void> pumpPractice(
    WidgetTester tester, {
    required Map<String, dynamic> config,
    FakePracticeRepository? repository,
  }) async {
    final repo =
        repository ??
        FakePracticeRepository(questions: <Question>[fakeQuestion()]);
    await pumpScreen(
      tester,
      PracticeScreen(config: config),
      overrides: fakePractice(repository: repo),
    );
    await settle(tester);
  }

  const expected = <String, String>{
    'random': '随机练习',
    'wrong': '错题复习',
    'tag': '专项练习',
    'exam': '模拟考试',
    'import': '外部导入',
    'agent_set': 'AI 题集',
    'review': '记忆复习',
  };

  // 每种模式一条用例：同一棵树上重复 pump 会复用 State，initState 不再跑，
  // 模式根本不会重新下发——那测的就不是「入口配置 → 渲染」这条链了。
  expected.forEach((mode, label) {
    testWidgets('mode=$mode：面包屑是「$label」，不露内部取值', (tester) async {
      await pumpPractice(tester, config: <String, dynamic>{'mode': mode});

      expect(find.text(label), findsOneWidget);
      expect(
        find.text(mode),
        findsNothing,
        reason: '「$mode」是数据库里的内部取值，不能出现在界面',
      );
    });
  });


  testWidgets('从错题本进来（mode=review）：不出现「随机」字样', (tester) async {
    // 错题本入口传的是 sessionId + mode，走 loadSession 而不是 createSession
    final repository = FakePracticeRepository(
      questions: <Question>[fakeQuestion()],
      sessionId: 'session_review',
      sessionMode: 'review',
    );
    await pumpPractice(
      tester,
      config: <String, dynamic>{'sessionId': 'session_review', 'mode': 'review'},
      repository: repository,
    );

    expect(repository.loadedSessions, <String>['session_review']);
    expect(find.text('记忆复习'), findsOneWidget);
    expect(
      find.textContaining('随机'),
      findsNothing,
      reason: '错题本练习被标成随机会让用户以为系统记错了',
    );
  });

  testWidgets('未知模式（老会话）是中性「其它练习」，不冒充随机', (tester) async {
    await pumpPractice(
      tester,
      config: <String, dynamic>{'mode': 'flashcard_v2'},
    );

    expect(find.text('其它练习'), findsOneWidget);
    expect(find.textContaining('随机'), findsNothing);
  });

  testWidgets('会话自带模式优先于入口传的模式（服务端为准）', (tester) async {
    final repository = FakePracticeRepository(
      questions: <Question>[fakeQuestion()],
      sessionId: 'session_exam',
      sessionMode: 'exam',
    );
    await pumpPractice(
      tester,
      // 入口如果传错模式，界面也不能跟着错：会话记录才是这一场的事实
      config: <String, dynamic>{
        'sessionId': 'session_exam',
        'mode': 'random',
      },
      repository: repository,
    );

    expect(find.text('模拟考试'), findsOneWidget);
    expect(find.text('随机练习'), findsNothing);
  });
}
