import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_app/features/exam/data/exam_repository.dart';
import 'package:mobile_app/features/exam/presentation/exam_paper_screen.dart';

import '../../../support/fakes_exam.dart';
import '../../../support/pump_router.dart';

/// 试卷预览屏：清单只显示题面、开始作答的请求形状、失败留在本页。
void main() {
  Future<void> settle(WidgetTester tester) async {
    for (var index = 0; index < 6; index++) {
      await tester.pump(const Duration(milliseconds: 120));
    }
  }

  Future<GoRouter> pumpPreview(
    WidgetTester tester,
    ExamStubAdapter adapter,
  ) async {
    final router = await pumpRouter(
      tester,
      initialLocation: '/exam/paper/3',
      routes: <String, WidgetBuilder>{
        '/exam/paper/:id': (_) => const ExamPaperScreen(paperId: 3),
        '/exam/session/:id': (_) => const Scaffold(body: Text('作答页')),
      },
      overrides: <Object>[
        examRepositoryProvider.overrideWithValue(examRepositoryWith(adapter)),
      ],
    );
    await settle(tester);
    return router;
  }

  testWidgets('清单显示题面与题型，但不显示答案和解析', (tester) async {
    final adapter = ExamStubAdapter(
      (_) => examJson(
        examPaperDetailJson(
          paper: examPaperJson(totalQuestions: 2, attemptCount: 1),
          questions: <Map<String, dynamic>>[
            examQuestionJson(
              id: 1,
              content: '第一题的题干',
              answer: 'A',
              explanation: '这段解析不该出现在预览页',
            ),
            examQuestionJson(
              id: 2,
              type: 'multi',
              content: '第二题的题干',
              answer: 'AB',
            ),
          ],
          lastAttempt: <String, dynamic>{
            'score': 0.5,
            'submittedAt': DateTime.now().toIso8601String(),
          },
        ),
      ),
    );

    await pumpPreview(tester, adapter);

    expect(find.text('教综模考 11月20日'), findsOneWidget);
    expect(find.textContaining('2 题'), findsWidgets);
    expect(find.textContaining('限时 30 分钟'), findsWidgets);
    expect(find.text('第一题的题干'), findsOneWidget);
    expect(find.text('第二题的题干'), findsOneWidget);
    expect(find.text('单选题'), findsOneWidget);
    expect(find.text('多选题'), findsOneWidget);
    expect(find.textContaining('上次作答'), findsOneWidget);
    expect(find.textContaining('50 分'), findsOneWidget);
    // 防作弊：答案与解析一个字都不该出现。
    expect(find.textContaining('这段解析'), findsNothing);
    expect(find.text('A'), findsNothing);
    expect(find.text('AB'), findsNothing);
  });

  testWidgets('开始作答：POST 开始场次并进入作答页', (tester) async {
    final adapter = ExamStubAdapter((options) {
      if (options.path.endsWith('/attempts')) {
        return examJson(examAttemptJson(sessionId: '9'));
      }
      return examJson(examPaperDetailJson());
    });
    await pumpPreview(tester, adapter);

    await tester.tap(find.textContaining('开始作答'));
    await settle(tester);

    expect(adapter.posts.single.path, '/exam/papers/3/attempts');
    expect(find.text('作答页'), findsOneWidget);
  });

  testWidgets('开始失败：错误留在本页，不跳进一个没有 sessionId 的屏', (tester) async {
    final adapter = ExamStubAdapter((options) {
      if (options.path.endsWith('/attempts')) {
        return examJson(<String, dynamic>{'message': '服务忙'}, statusCode: 503);
      }
      return examJson(examPaperDetailJson());
    });
    await pumpPreview(tester, adapter);

    await tester.tap(find.textContaining('开始作答'));
    await settle(tester);

    expect(find.textContaining('503'), findsOneWidget);
    expect(find.text('作答页'), findsNothing);
    expect(find.textContaining('开始作答'), findsOneWidget, reason: '还能再点一次');
  });

  testWidgets('服务端没回 sessionId：明确报错而不是进空作答页', (tester) async {
    final adapter = ExamStubAdapter((options) {
      if (options.path.endsWith('/attempts')) {
        return examJson(examAttemptJson(sessionId: ''));
      }
      return examJson(examPaperDetailJson());
    });
    await pumpPreview(tester, adapter);

    await tester.tap(find.textContaining('开始作答'));
    await settle(tester);

    expect(find.textContaining('没有返回作答编号'), findsOneWidget);
    expect(find.text('作答页'), findsNothing);
  });
  testWidgets('详情取不到：错误态可重试', (tester) async {
    var fail = true;
    final adapter = ExamStubAdapter((_) {
      if (fail) {
        return examJson(<String, dynamic>{'message': '坏了'}, statusCode: 500);
      }
      return examJson(examPaperDetailJson());
    });
    await pumpPreview(tester, adapter);

    expect(find.text('加载失败'), findsOneWidget);
    fail = false;
    await tester.tap(find.text('重试'));
    await settle(tester);
    expect(find.text('教综模考 11月20日'), findsOneWidget);
  });
}
