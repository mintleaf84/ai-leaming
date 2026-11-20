import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_app/features/exam/data/exam_repository.dart';
import 'package:mobile_app/features/exam/domain/exam_attempt.dart';
import 'package:mobile_app/features/exam/presentation/exam_session_screen.dart';

import '../../../support/fakes_exam.dart';
import '../../../support/pump_router.dart';

/// 作答屏：控件、交卷载荷、答题卡、超时自动交卷、离开确认、成绩单。
///
/// 守的四条线：
/// 1. 交卷只带**答了**的题（未答由服务端 skipped），字段名与契约一致；
/// 2. 超时自动交卷**只触发一次**（反复 tick 不会重复 POST）；
/// 3. 未答 N 题必须在确认框里说出来；
/// 4. 成绩单只用服务端结果渲染，不本地重算分数。
void main() {
  Future<void> settle(WidgetTester tester) async {
    for (var index = 0; index < 8; index++) {
      await tester.pump(const Duration(milliseconds: 110));
    }
  }

  List<Map<String, dynamic>> fourQuestions() {
    return <Map<String, dynamic>>[
      examQuestionJson(
        id: 1,
        content: '教育目的的核心是什么？',
        options: const <String>['培养人', '传授知识', '选拔人才'],
      ),
      examQuestionJson(
        id: 2,
        type: 'multi',
        content: '以下属于教育功能的有？',
        options: const <String>['个体功能', '社会功能', '经济功能'],
      ),
      examQuestionJson(
        id: 3,
        type: 'truefalse',
        content: '教育具有相对独立性。',
        options: const <String>[],
      ),
      examQuestionJson(
        id: 4,
        type: 'fill_blank',
        content: '教育目的的核心是＿＿。',
        options: const <String>[],
      ),
    ];
  }

  ExamAttempt attemptWith({
    String? deadlineAt,
    String sessionId = '9',
    List<Map<String, dynamic>>? questions,
  }) {
    return ExamAttempt.fromJson(
      examAttemptJson(
        sessionId: sessionId,
        deadlineAt: deadlineAt,
        questions: questions ?? fourQuestions(),
      ),
    );
  }

  Future<GoRouter> pumpSession(
    WidgetTester tester,
    ExamStubAdapter adapter, {
    ExamAttempt? attempt,
  }) async {
    final router = await pumpRouter(
      tester,
      initialLocation: '/exam/session/9',
      routes: <String, WidgetBuilder>{
        '/exam/session/:id': (_) =>
            ExamSessionScreen(sessionId: '9', initialAttempt: attempt),
        '/dashboard': (_) => routeStub('/dashboard'),
        '/practice': (_) => routeStub('/practice'),
      },
      overrides: <Object>[
        examRepositoryProvider.overrideWithValue(examRepositoryWith(adapter)),
      ],
    );
    await settle(tester);
    return router;
  }

  Finder dialogAction(String label) =>
      find.descendant(of: find.byType(AlertDialog), matching: find.text(label));

  testWidgets('单选/多选/判断/填空都能答，交卷载荷只带答了的题', (tester) async {
    final adapter = ExamStubAdapter(
      (_) => examJson(
        examSubmitResultJson(
          score: 0.5,
          correctCount: 2,
          totalQuestions: 4,
          perQuestion: <Map<String, dynamic>>[
            <String, dynamic>{
              'questionId': 1,
              'isCorrect': true,
              'correctAnswer': 'A',
              'explanation': '教育以培养人为核心。',
            },
            <String, dynamic>{
              'questionId': 2,
              'isCorrect': false,
              'correctAnswer': 'AB',
            },
            <String, dynamic>{
              'questionId': 3,
              'isCorrect': true,
              'correctAnswer': 'A',
            },
            <String, dynamic>{
              'questionId': 4,
              'isCorrect': false,
              'correctAnswer': '培养人',
            },
          ],
        ),
      ),
    );
    await pumpSession(tester, adapter, attempt: attemptWith());

    // 第 1 题：单选
    expect(find.text('教育目的的核心是什么？'), findsOneWidget);
    expect(find.text('第 1 / 4 题'), findsOneWidget);
    await tester.tap(find.textContaining('培养人'));
    await settle(tester);
    expect(find.text('已答 1'), findsOneWidget);

    // 第 2 题：多选（少选/多选都不算对）
    await tester.tap(find.text('下一题'));
    await settle(tester);
    expect(find.text('以下属于教育功能的有？'), findsOneWidget);
    expect(find.text('少选、多选都不算对'), findsOneWidget);
    await tester.tap(find.textContaining('个体功能'));
    await tester.tap(find.textContaining('社会功能'));
    await settle(tester);
    expect(find.text('已答 2'), findsOneWidget);

    // 第 3 题：判断题没有选项时回落「正确/错误」
    await tester.tap(find.text('下一题'));
    await settle(tester);
    expect(find.text('教育具有相对独立性。'), findsOneWidget);
    await tester.tap(find.text('A. 正确'));
    await settle(tester);

    // 第 4 题：填空
    await tester.tap(find.text('下一题'));
    await settle(tester);
    expect(find.text('最后一题'), findsNothing);
    expect(find.text('交卷'), findsWidgets, reason: '最后一题底部主操作变成交卷');
    await tester.enterText(find.byType(TextFormField), '培养人');
    await settle(tester);
    expect(find.text('已答 4'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, '交卷'));
    await settle(tester);
    expect(find.text('全部答完了。交卷后不能修改，确定交卷吗？'), findsOneWidget);
    await tester.tap(dialogAction('交卷'));
    await settle(tester);

    final post = adapter.posts.single;
    expect(post.path, '/exam/attempts/9/submit');
    final body = post.data! as Map<String, dynamic>;
    expect(body['clientKey'], isA<String>());
    final answers = body['answers']! as List<Map<String, dynamic>>;
    expect(answers.map((item) => item['questionId']), <int>[
      1,
      2,
      3,
      4,
    ], reason: '四道题都答了，按题序上送');
    expect(answers[0]['userAnswer'], 'A');
    expect(answers[1]['userAnswer'], 'AB', reason: '多选按字母排序拼成 AB');
    expect(answers[2]['userAnswer'], 'A', reason: '判断题的「正确」是 A 选项');
    expect(answers[3]['userAnswer'], '培养人');
    expect(answers[0]['durationMs'], isA<int>());
    expect(jsonEncode(answers[0]).contains('userAnswer'), isTrue);
  });

  testWidgets('未答先交：确认框说明还有 N 题，载荷里只有已答的题', (tester) async {
    final adapter = ExamStubAdapter(
      (_) => examJson(
        examSubmitResultJson(totalQuestions: 4, perQuestion: const []),
      ),
    );
    await pumpSession(tester, adapter, attempt: attemptWith());

    await tester.tap(find.widgetWithText(TextButton, '交卷'));
    await settle(tester);
    expect(find.textContaining('还有 4 道题没作答'), findsOneWidget);

    await tester.tap(dialogAction('再检查一下'));
    await settle(tester);
    expect(adapter.posts, isEmpty, reason: '取消不该发请求');

    await tester.tap(find.widgetWithText(TextButton, '交卷'));
    await settle(tester);
    await tester.tap(dialogAction('交卷'));
    await settle(tester);

    final body = adapter.posts.single.data! as Map<String, dynamic>;
    expect(body['answers'], isEmpty, reason: '未答由服务端按 skipped 处理，不传空答案');
  });

  testWidgets('答题卡：已答数量与跳题', (tester) async {
    final adapter = ExamStubAdapter((_) => examJson(examSubmitResultJson()));
    await pumpSession(tester, adapter, attempt: attemptWith());

    await tester.tap(find.textContaining('培养人'));
    await settle(tester);
    await tester.tap(find.text('答题卡'));
    await settle(tester);

    expect(find.text('已答 1 / 4'), findsOneWidget);
    expect(find.textContaining('还有 3 道没答'), findsOneWidget);

    await tester.tap(find.text('3'));
    await settle(tester);

    expect(find.text('第 3 / 4 题'), findsOneWidget);
    expect(find.text('教育具有相对独立性。'), findsOneWidget);
  });

  testWidgets('超时自动交卷只触发一次，成绩单展示超时', (tester) async {
    var calls = 0;
    final adapter = ExamStubAdapter((_) {
      calls += 1;
      return examJson(
        examSubmitResultJson(
          score: 1,
          correctCount: 4,
          totalQuestions: 4,
          overtime: true,
          overtimeMs: 35000,
          durationMs: 95000,
        ),
      );
    });
    await pumpSession(
      tester,
      adapter,
      attempt: attemptWith(
        deadlineAt: DateTime.now()
            .add(const Duration(seconds: 1))
            .toIso8601String(),
      ),
    );

    expect(find.textContaining('00:0'), findsWidgets, reason: '限时卷显示倒计时');

    // 第一次 tick 归零 → 自动交卷
    await tester.pump(const Duration(milliseconds: 1100));
    await settle(tester);

    expect(adapter.posts, hasLength(1));
    expect(find.text('成绩单'), findsOneWidget);
    expect(find.textContaining('超时 35 秒'), findsOneWidget);

    // 再等几秒：计时器已停，不能重复 POST
    await tester.pump(const Duration(seconds: 3));
    await settle(tester);
    expect(adapter.posts, hasLength(1), reason: '自动交卷必须只触发一次');
    expect(calls, 1);
  });

  testWidgets('自动交卷失败：弹一次说明并保留答案，不自动重试', (tester) async {
    final adapter = ExamStubAdapter(
      (options) => throw DioException(
        requestOptions: options,
        type: DioExceptionType.receiveTimeout,
      ),
    );
    await pumpSession(
      tester,
      adapter,
      attempt: attemptWith(
        deadlineAt: DateTime.now()
            .add(const Duration(seconds: 1))
            .toIso8601String(),
      ),
    );

    await tester.pump(const Duration(milliseconds: 1100));
    await settle(tester);

    expect(find.text('时间到了'), findsOneWidget);
    expect(find.textContaining('自动交卷没有成功'), findsOneWidget);
    expect(adapter.posts, hasLength(1));

    await tester.pump(const Duration(seconds: 3));
    expect(adapter.posts, hasLength(1), reason: '失败后也不该在后台反复重试');

    await tester.tap(find.text('稍后'));
    await settle(tester);
    expect(find.textContaining('交卷没成功'), findsOneWidget);
    expect(find.textContaining('答案已锁定'), findsOneWidget);
  });

  testWidgets('离开确认：继续作答留在本页，离开回首页', (tester) async {
    final adapter = ExamStubAdapter((_) => examJson(examSubmitResultJson()));
    final router = await pumpSession(tester, adapter, attempt: attemptWith());

    await tester.tap(find.byTooltip('离开作答'));
    await settle(tester);
    expect(find.text('离开作答？'), findsOneWidget);

    await tester.tap(find.text('继续作答'));
    await settle(tester);
    expect(find.text('离开作答？'), findsNothing);
    expect(currentLocation(router), '/exam/session/9');

    await tester.tap(find.byTooltip('离开作答'));
    await settle(tester);
    await tester.tap(find.text('离开'));
    await settle(tester);

    expect(currentLocation(router), '/dashboard');
    expect(adapter.posts, isEmpty, reason: '离开不交卷');
  });

  testWidgets('深链接已交卷：直接出成绩单，不再作答', (tester) async {
    final adapter = ExamStubAdapter(
      (_) => examJson(
        examAttemptDetailJson(
          result: examSubmitResultJson(
            duplicate: true,
            overtime: true,
            overtimeMs: 80000,
            score: 0.5,
          ),
        ),
      ),
    );
    await pumpSession(tester, adapter);

    expect(adapter.gets.single.path, '/exam/attempts/9');
    expect(find.text('成绩单'), findsOneWidget);
    expect(find.textContaining('重复提交'), findsOneWidget);
    expect(find.textContaining('超时 1 分 20 秒'), findsOneWidget);
    expect(find.text('交卷'), findsNothing, reason: '已交卷不再提供交卷入口');
  });

  testWidgets('深链接作答中：回填已答题，落在第一道未答题', (tester) async {
    final adapter = ExamStubAdapter(
      (_) => examJson(
        examAttemptDetailJson(
          questions: fourQuestions(),
          answers: <Map<String, dynamic>>[
            <String, dynamic>{'questionId': 1, 'userAnswer': 'A'},
            <String, dynamic>{'questionId': 2, 'userAnswer': 'AB'},
          ],
        ),
      ),
    );
    await pumpSession(tester, adapter);

    expect(find.text('第 3 / 4 题'), findsOneWidget);
    expect(find.text('已答 2'), findsOneWidget);
    expect(find.text('教育具有相对独立性。'), findsOneWidget);
  });

  testWidgets('作答态取不到：错误态可重试', (tester) async {
    var fail = true;
    final adapter = ExamStubAdapter((_) {
      if (fail) {
        return examJson(<String, dynamic>{'message': '挂了'}, statusCode: 500);
      }
      return examJson(examAttemptDetailJson(questions: fourQuestions()));
    });
    await pumpSession(tester, adapter);

    expect(find.text('加载失败'), findsOneWidget);

    fail = false;
    await tester.tap(find.text('重试'));
    await settle(tester);

    expect(find.text('第 1 / 4 题'), findsOneWidget);
  });

  testWidgets('成绩单「错题重练」走错题模式练习', (tester) async {
    final adapter = ExamStubAdapter(
      (_) => examJson(
        examSubmitResultJson(
          score: 0.5,
          correctCount: 1,
          totalQuestions: 2,
          perQuestion: <Map<String, dynamic>>[
            <String, dynamic>{
              'questionId': 1,
              'isCorrect': true,
              'correctAnswer': 'A',
            },
            <String, dynamic>{
              'questionId': 2,
              'isCorrect': false,
              'correctAnswer': 'AB',
              'explanation': '两个选项都成立。',
            },
          ],
        ),
      ),
    );
    final router = await pumpSession(tester, adapter, attempt: attemptWith());

    await tester.tap(find.widgetWithText(TextButton, '交卷'));
    await settle(tester);
    await tester.tap(dialogAction('交卷'));
    await settle(tester);

    expect(find.text('成绩单'), findsOneWidget);
    expect(find.text('逐题回顾'), findsOneWidget);
    expect(find.text('两个选项都成立。'), findsOneWidget);
    expect(find.text('50'), findsOneWidget, reason: '分数按服务端 score 归一成百分制');

    await tester.tap(find.text('错题重练'));
    await settle(tester);

    expect(currentLocation(router), '/practice');
  });
}
