import 'dart:async';

import 'package:confetti/confetti.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/compat/contract_compat.dart';
import 'package:mobile_app/core/compat/contract_meta.dart';
import 'package:mobile_app/core/compat/contract_meta_repository.dart';
import 'package:mobile_app/core/navigation/app_nav.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_screen.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/presentation/practice_provider.dart';
import 'package:mobile_app/features/practice/presentation/result_screen.dart';
import 'package:mobile_app/features/wrong_book/domain/wrong_question.dart';

import '../../../support/fake_providers.dart';
import '../../../support/fakes_misc.dart';
import '../../../support/pump_router_misc.dart';
import '../../../support/pump_screen.dart';
import '../../../support/recording_adapter.dart';

/// 结果页：守的是**统计口径、庆祝档位、以及「返回首页」的清栈语义**。
///
/// 判卷/统计的源头不在这里测（`results` 是练习过程的产物，`PracticeController`
/// 的单测已覆盖）。这里注入一份作答结果，断言屏把它算对、显示对、点击后落到
/// 哪一屏——删掉任何一条分支（60/80 档位、reset、replace 而非 pop），对应用例
/// 必须变红。
///
/// 结果页在计划的 375×667 窗口下实测 **RenderFlex 溢出 64px**（已作为缺陷
/// 单独回报，不改 lib/）。契约用例放到 375×812 跑，保证断言的是行为而不是
/// 「小屏放不下」；不写「锁死溢出」的用例，那等于把缺陷固化成预期。
const Size resultViewport = Size(375, 812);

void main() {
  setUpAll(useFakeSecureStorage);

  PracticeSessionState resultState(List<bool> correct) {
    final ids = <String>[for (var i = 0; i < correct.length; i++) '${i + 1}'];
    return PracticeSessionState(
      sessionId: 'session_1',
      questions: <Question>[for (final id in ids) fakeQuestion(id: id)],
      results: <String, bool>{
        for (var i = 0; i < ids.length; i++) ids[i]: correct[i],
      },
    );
  }

  /// 结果页 initState 里有一个 500ms 的「延迟庆祝」Timer；不把它走完，
  /// widget 测试收尾会报「Timer is still pending」。固定推过去，不用
  /// `pumpAndSettle`：命中 80% 时 confetti 是 3 秒动画，settle 会一直等。
  Future<void> drainCelebrationDelay(WidgetTester tester) async {
    await tester.pump(const Duration(milliseconds: 600));
  }

  testWidgets('统计渲染：正确率按截断取整，总数/正确/错误分别显示', (tester) async {
    final practice = FakePracticeController(
      resultState(<bool>[true, true, false, false]),
    );
    final resume = FakePracticeResumeController();

    await pumpScreen(
      tester,
      const ResultScreen(),
      overrides: <Object>[
        ...fakeResult(controller: practice),
        ...fakePracticeResume(controller: resume),
        ...fakePreferences(),
      ],
      size: resultViewport,
    );
    await drainCelebrationDelay(tester);
    await tester.pump();

    expect(resume.clearCalls, 1, reason: '进结果页就作废续练断点');
    expect(practice.resetCalls, 0, reason: '只是进来看看结果，不该清会话');
    expect(find.text('50'), findsOneWidget, reason: '2/4 正确 → 50%');
    expect(find.text('%'), findsOneWidget);
    expect(find.text('总题数'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(find.text('正确'), findsOneWidget);
    expect(find.text('错误'), findsOneWidget);
    // 正确 2、错误 2：同一个「2」在两处出现，正好证明是两个独立统计项
    expect(find.text('2'), findsNWidgets(2));
    expect(find.text('继续加油！'), findsOneWidget, reason: '50% 应走 <60 档文案');
    expect(find.text('💪'), findsOneWidget);
    expectNoLayoutError(tester);
  });

  testWidgets('60–79 档：标题与图标切换', (tester) async {
    final practice = FakePracticeController(
      resultState(<bool>[true, true, true, false, false]),
    );

    await pumpScreen(
      tester,
      const ResultScreen(),
      overrides: <Object>[
        ...fakeResult(controller: practice),
        ...fakePracticeResume(),
        ...fakePreferences(),
      ],
      size: resultViewport,
    );
    await drainCelebrationDelay(tester);
    await tester.pump();

    expect(find.text('60'), findsOneWidget);
    expect(find.text('不错哦！'), findsOneWidget);
    expect(find.text('👍'), findsOneWidget);
    expect(find.byType(ConfettiWidget), findsOneWidget);
    expectNoLayoutError(tester);
  });

  testWidgets('≥80%：庆祝组件存在并真的播放（不比对像素）', (tester) async {
    final practice = FakePracticeController(
      resultState(<bool>[true, true, true]),
    );

    await pumpScreen(
      tester,
      const ResultScreen(),
      overrides: <Object>[
        ...fakeResult(controller: practice),
        ...fakePracticeResume(),
        ...fakePreferences(),
      ],
      size: resultViewport,
    );
    await drainCelebrationDelay(tester);
    // 庆祝播放后推几帧，验证动画帧不会抛异常；不做像素断言。
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('100'), findsOneWidget);
    expect(find.text('太棒了！'), findsOneWidget);
    expect(find.text('🎉'), findsOneWidget);
    expect(find.byType(ConfettiWidget), findsOneWidget);
    expectNoLayoutError(tester);
  });

  testWidgets('「返回首页」清栈落到 dashboard，并 reset 本场会话', (tester) async {
    final adapter = RecordingAdapter(
      handler: (options) {
        final path = options.uri.path;
        if (path.endsWith('/recall/queue')) {
          return jsonBody(<String, dynamic>{
            'ids': <int>[],
            'due': 0,
            'fresh': 0,
            'total': 0,
            'estimatedMinutes': 0,
            'streakDays': 0,
          });
        }
        if (path.endsWith('/history')) {
          return jsonBody(<String, dynamic>{
            'items': <Map<String, dynamic>>[],
            'total': 0,
            'totalPages': 0,
          });
        }
        return jsonBody(const <String, dynamic>{});
      },
    );
    final practice = FakePracticeController(
      resultState(<bool>[true, true, false, false]),
    );

    final router = await pumpRouter(
      tester,
      initialLocation: AppRoutes.history,
      size: resultViewport,
      overrides: <Object>[
        dioProvider.overrideWithValue(fakeDio(adapter)),
        ...fakeResult(controller: practice),
        ...fakePracticeResume(),
        ...fakeStats(stats: fakeLearningStats()),
        ...fakeWrongBook(stats: const WrongBookStats(total: 0)),
        ...fakePreferences(),
        contractDecisionProvider.overrideWith(
          (ref) async => const ContractDecision(
            status: ContractCompat.ok,
            meta: ContractMeta(
              contractVersion: 1,
              features: <String>{'recall'},
            ),
          ),
        ),
      ],
    );
    unawaited(router.push(AppRoutes.result));
    await settleRouter(tester);
    await drainCelebrationDelay(tester);
    await tester.pump();

    expect(find.byType(ResultScreen), findsOneWidget);
    expect(router.canPop(), isTrue, reason: '结果页是压在历史页上的一层');

    await tester.tap(find.text('返回首页'));
    // 路由切换有页面转场动画：固定推几帧走完，不用 pumpAndSettle。
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.byType(DashboardScreen), findsOneWidget);
    expect(find.byType(ResultScreen), findsNothing);
    expect(
      router.canPop(),
      isFalse,
      reason: '「返回首页」必须清栈，否则返回键会退回结果页',
    );
    expect(practice.resetCalls, 1, reason: '离开结果页要作废本场会话');
  });
}
