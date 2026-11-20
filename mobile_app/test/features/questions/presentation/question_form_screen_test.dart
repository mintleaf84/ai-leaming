import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:mobile_app/core/navigation/app_nav.dart';
import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/data/practice_repository_impl.dart';
import 'package:mobile_app/features/questions/data/question_editor_repository.dart';
import 'package:mobile_app/features/questions/presentation/question_form_screen.dart';

import '../../../support/fake_providers.dart';
import '../fake_question_editor_repository.dart';

/// 建题 / 改题表单的 widget 测试。
///
/// 用真 GoRouter 而不是 `home:`：保存成功后页面会 `backOrHome()`，只有挂在
/// 真路由上才能验证「确实回到了题库列表」——这也正是 `context.go/pop` 被
/// 禁掉之后唯一被允许的返回路径（见 `test/navigation_rules_test.dart`）。
///
/// 视口故意给得比设计稿高（375×1400）：表单是长列表，矮视口下 `ListView`
/// 只构建可见项，`enterText` 会找不到下面几栏。这里测的是逻辑，不是滚动。
void main() {
  late FakeQuestionEditorRepository repository;

  setUp(() {
    repository = FakeQuestionEditorRepository();
  });

  List<Object> overrides() => <Object>[
    questionEditorRepositoryProvider.overrideWithValue(repository),
    // 保存成功后会 invalidate 题库列表：换成假仓库，避免真 Dio / 本地库
    // 在测试环境里发请求。
    practiceRepositoryProvider.overrideWithValue(FakePracticeRepository()),
  ];

  Future<void> pumpForm(WidgetTester tester, {String? questionId}) async {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = const Size(375, 1400);
    addTearDown(tester.view.reset);

    final router = GoRouter(
      initialLocation: questionId == null
          ? AppRoutes.questionNew
          : AppRoutes.questionEdit(questionId),
      routes: <RouteBase>[
        GoRoute(
          path: AppRoutes.questions,
          builder: (context, state) =>
              const Scaffold(body: Center(child: Text('题库列表'))),
        ),
        GoRoute(
          path: AppRoutes.questionNew,
          builder: (context, state) => const QuestionFormScreen(),
        ),
        GoRoute(
          path: '/questions/:id/edit',
          builder: (context, state) => QuestionFormScreen(
            questionId: state.pathParameters['id'],
          ),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides().cast(),
        child: ScreenUtilInit(
          designSize: const Size(375, 667),
          builder: (context, child) => MaterialApp.router(
            theme: AppTheme.lightTheme,
            routerConfig: router,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  testWidgets('空表单点创建：三项校验报错，且不发请求', (tester) async {
    await pumpForm(tester);

    await tester.tap(find.byKey(QuestionFormScreen.saveButtonKey));
    await tester.pump();

    expect(find.text('请填写题干'), findsOneWidget);
    expect(find.text('请填写答案'), findsOneWidget);
    expect(find.text('选择题至少要有一个选项'), findsOneWidget);
    expect(repository.createdPayloads, isEmpty, reason: '校验没过就不能发请求');
  });

  testWidgets('填好必填项后创建：请求体形状正确，材料为空不报错，并返回题库列表', (
    tester,
  ) async {
    await pumpForm(tester);

    await tester.enterText(
      find.byKey(QuestionFormScreen.contentFieldKey),
      '我国教育目的的理论基础是（ ）。',
    );
    await tester.enterText(
      find.byKey(QuestionFormScreen.optionFieldKey(0)),
      '个人本位论',
    );
    await tester.enterText(
      find.byKey(QuestionFormScreen.optionFieldKey(1)),
      '社会本位论',
    );
    await tester.enterText(
      find.byKey(QuestionFormScreen.answerFieldKey),
      'B',
    );
    await tester.enterText(
      find.byKey(QuestionFormScreen.tagsFieldKey),
      '教育学，教育目的',
    );
    // 材料留空：不应出现任何错误文案，请求体里也不该有 material。

    await tester.tap(find.byKey(QuestionFormScreen.saveButtonKey));
    await tester.pump();
    await tester.pump();

    expect(find.text('请填写题干'), findsNothing);
    expect(repository.createdPayloads, hasLength(1));
    final payload = repository.createdPayloads.single;
    expect(payload['content'], '我国教育目的的理论基础是（ ）。');
    expect(payload['options'], <String>['个人本位论', '社会本位论']);
    expect(payload['answer'], 'B');
    expect(payload['type'], 'single');
    expect(payload['tags'], <String>['教育学', '教育目的']);
    expect(payload.containsKey('material'), isFalse);

    // 保存成功后返回上一页（题库列表）。
    expect(find.text('题库列表'), findsOneWidget);
  });

  testWidgets('改题：先按详情预填，保存走 PATCH /questions/{id}', (tester) async {
    repository.question = const Question(
      id: '42',
      content: '原题干',
      options: <String>['甲', '乙', '丙'],
      type: 'multi',
      tags: <String>['教育学'],
      explanation: '原解析',
      answer: 'AB',
      material: '原材料',
    );

    await pumpForm(tester, questionId: '42');
    await tester.pump();

    TextField field(Key key) => tester.widget<TextField>(find.byKey(key));

    expect(field(QuestionFormScreen.contentFieldKey).controller!.text, '原题干');
    expect(field(QuestionFormScreen.optionFieldKey(2)).controller!.text, '丙');
    expect(field(QuestionFormScreen.answerFieldKey).controller!.text, 'AB');
    expect(field(QuestionFormScreen.materialFieldKey).controller!.text, '原材料');
    expect(field(QuestionFormScreen.tagsFieldKey).controller!.text, '教育学');

    await tester.enterText(
      find.byKey(QuestionFormScreen.contentFieldKey),
      '改后的题干',
    );
    await tester.tap(find.byKey(QuestionFormScreen.saveButtonKey));
    await tester.pump();
    await tester.pump();

    expect(repository.updatedIds, <String>['42']);
    final payload = repository.updatedPayloads.single;
    expect(payload['content'], '改后的题干');
    expect(payload['type'], 'multi');
    expect(payload['material'], '原材料');
    expect(repository.createdPayloads, isEmpty, reason: '改题不能走 POST');
  });

  testWidgets('保存失败：留在表单页并给出可读原因', (tester) async {
    repository.saveError = DioException(
      requestOptions: RequestOptions(path: '/questions'),
      type: DioExceptionType.badResponse,
      response: Response<Object?>(
        requestOptions: RequestOptions(path: '/questions'),
        statusCode: 500,
      ),
    );

    await pumpForm(tester);
    await tester.enterText(
      find.byKey(QuestionFormScreen.contentFieldKey),
      '题干',
    );
    await tester.enterText(
      find.byKey(QuestionFormScreen.optionFieldKey(0)),
      '选项甲',
    );
    await tester.enterText(find.byKey(QuestionFormScreen.answerFieldKey), 'A');

    await tester.tap(find.byKey(QuestionFormScreen.saveButtonKey));
    await tester.pump();
    await tester.pump();

    expect(find.text('服务器出了点问题（500），请稍后重试'), findsOneWidget);
    expect(find.text('题库列表'), findsNothing, reason: '失败不能跳走');
    expect(
      tester.widget<FilledButton>(
        find.byKey(QuestionFormScreen.saveButtonKey),
      ).onPressed,
      isNotNull,
      reason: '失败后还能再点一次',
    );
  });

  testWidgets('题型切到填空后隐藏选项区，且不再要求选项', (tester) async {
    await pumpForm(tester);

    await tester.tap(find.text('填空'));
    await tester.pump();

    expect(find.byKey(QuestionFormScreen.optionFieldKey(0)), findsNothing);

    await tester.enterText(
      find.byKey(QuestionFormScreen.contentFieldKey),
      '教育学的概念是什么？',
    );
    await tester.enterText(
      find.byKey(QuestionFormScreen.answerFieldKey),
      '研究教育现象及其规律的科学',
    );
    await tester.tap(find.byKey(QuestionFormScreen.saveButtonKey));
    await tester.pump();
    await tester.pump();

    expect(find.text('选择题至少要有一个选项'), findsNothing);
    expect(repository.createdPayloads.single['type'], 'fill_blank');
    expect(repository.createdPayloads.single['options'], isEmpty);
  });
}
