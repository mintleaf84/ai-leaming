import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_app/features/exam/data/exam_repository.dart';
import 'package:mobile_app/features/exam/presentation/exam_list_screen.dart';

import '../../../support/fakes_exam.dart';
import '../../../support/pump_router.dart';

/// 试卷列表屏：空态、数据态、组卷请求形状、组卷失败留在表单里、重试。
///
/// 组卷成功后的落点用真实路由断言：生成一张卷却停在列表页，用户会以为没成功，
/// 于是再点一次，凭空多出一张重复的卷子。
void main() {
  Future<void> settle(WidgetTester tester) async {
    for (var index = 0; index < 6; index++) {
      await tester.pump(const Duration(milliseconds: 120));
    }
  }

  /// 底部表单比一屏高：点之前先滚到可见处，否则 tap 会打在屏幕外。
  Future<void> tapVisible(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.pump();
    await tester.tap(finder);
    await tester.pump();
  }

  Future<GoRouter> pumpList(
    WidgetTester tester,
    ExamStubAdapter adapter,
  ) async {
    final router = await pumpRouter(
      tester,
      initialLocation: '/exam',
      routes: <String, WidgetBuilder>{
        '/exam': (_) => const ExamListScreen(),
        '/exam/paper/:id': (_) => const Scaffold(body: Text('预览页')),
      },
      overrides: <Object>[
        examRepositoryProvider.overrideWithValue(examRepositoryWith(adapter)),
      ],
    );
    await settle(tester);
    return router;
  }

  testWidgets('空列表：给「还没有试卷」和组卷入口，不是错误态', (tester) async {
    final adapter = ExamStubAdapter(
      (_) => examJson(
        examPaperPageJson(papers: <Map<String, dynamic>>[], total: 0),
      ),
    );

    await pumpList(tester, adapter);

    expect(find.text('还没有试卷'), findsOneWidget);
    expect(find.text('自动组卷'), findsOneWidget);
    expect(find.text('加载失败'), findsNothing);
    expect(find.text('我的试卷'), findsNothing);
  });

  testWidgets('有试卷：题量 / 时限 / 最好成绩 / 作答次数都来自服务端', (tester) async {
    final adapter = ExamStubAdapter(
      (_) => examJson(
        examPaperPageJson(
          papers: <Map<String, dynamic>>[
            examPaperJson(
              id: 1,
              title: '限时小卷',
              kind: 'timed',
              durationMinutes: 30,
              attemptCount: 2,
              bestScore: 0.8,
              lastAttemptAt: DateTime.now().toIso8601String(),
            ),
            examPaperJson(
              id: 2,
              title: '固定小卷',
              kind: 'fixed',
              durationMinutes: null,
              source: 'manual',
              attemptCount: 0,
            ),
          ],
          total: 2,
        ),
      ),
    );

    await pumpList(tester, adapter);

    expect(find.text('限时小卷'), findsOneWidget);
    expect(find.text('固定小卷'), findsOneWidget);
    expect(find.text('限时 30 分钟'), findsOneWidget);
    expect(find.text('固定题量'), findsOneWidget);
    expect(find.text('80'), findsOneWidget);
    expect(find.text('做过 2 次'), findsOneWidget);
    expect(find.text('未作答'), findsOneWidget);
    expect(find.text('开始第一场'), findsOneWidget);
    expect(find.text('自动'), findsOneWidget);
    expect(find.text('手工'), findsOneWidget);
    expect(find.textContaining('最近作答 今天'), findsOneWidget);
    expect(find.text('2 份'), findsNWidgets(2), reason: '概览卡与「我的试卷」各一处');
  });

  testWidgets('点试卷卡片进入预览页', (tester) async {
    final adapter = ExamStubAdapter((_) => examJson(examPaperPageJson()));
    await pumpList(tester, adapter);

    await tester.tap(find.text('教综模考 11月20日'));
    await settle(tester);

    expect(find.text('预览页'), findsOneWidget);
  });

  testWidgets('自动组卷：表单选择落到请求体，成功后直接进预览', (tester) async {
    final adapter = ExamStubAdapter((options) {
      if (options.path.endsWith('/exam/papers/generate')) {
        return examJson(
          examPaperDetailJson(
            paper: examPaperJson(id: 7, title: '新卷', kind: 'fixed'),
          ),
        );
      }
      return examJson(examPaperPageJson());
    });
    await pumpList(tester, adapter);

    await tester.tap(find.text('自动组卷'));
    await settle(tester);
    expect(find.text('生成试卷'), findsOneWidget);

    await tapVisible(tester, find.text('10 题'));
    await tapVisible(tester, find.text('不限时'));
    await tapVisible(tester, find.text('重错题'));
    // 表单里两个输入框：卷名在前、考点在后。
    await tester.ensureVisible(find.byType(TextField).at(1));
    await tester.enterText(find.byType(TextField).at(1), '教育学，心理学');
    await settle(tester);

    await tapVisible(tester, find.text('生成试卷'));
    await settle(tester);

    final post = adapter.posts.single;
    final body = post.data! as Map<String, dynamic>;
    expect(post.path, '/exam/papers/generate');
    expect(body['count'], 10);
    expect(body['kind'], 'fixed');
    expect(body.containsKey('durationMinutes'), isFalse);
    expect(body['tags'], <String>['教育学', '心理学']);
    expect(body['weights'], <String, double>{
      'wrong': 0.5,
      'weak': 0.3,
      'fresh': 0.2,
    });
    expect(find.text('预览页'), findsOneWidget);
  });

  testWidgets('题量凑不满：错误留在表单里，用户填的内容不丢', (tester) async {
    final adapter = ExamStubAdapter((options) {
      if (options.path.endsWith('/exam/papers/generate')) {
        return examJson(<String, dynamic>{
          'requested': 20,
          'available': 8,
          'shortfall': 12,
        }, statusCode: 400);
      }
      return examJson(examPaperPageJson(papers: <Map<String, dynamic>>[]));
    });
    await pumpList(tester, adapter);

    await tester.tap(find.text('自动组卷'));
    await settle(tester);
    await tapVisible(tester, find.text('生成试卷'));
    await settle(tester);

    expect(find.textContaining('只有 8 道'), findsOneWidget);
    expect(find.text('生成试卷'), findsOneWidget, reason: '失败不该关掉表单');
    expect(find.text('20 题'), findsOneWidget, reason: '用户选的题量还在');
  });

  testWidgets('首屏失败：错误态可重试，重试成功后显示列表', (tester) async {
    var fail = true;
    final adapter = ExamStubAdapter((_) {
      if (fail) {
        return examJson(<String, dynamic>{'message': '炸了'}, statusCode: 500);
      }
      return examJson(examPaperPageJson());
    });
    await pumpList(tester, adapter);

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.textContaining('500'), findsOneWidget);

    fail = false;
    await tester.tap(find.text('重试'));
    await settle(tester);

    expect(find.text('教综模考 11月20日'), findsOneWidget);
    expect(find.text('加载失败'), findsNothing);
  });
}
