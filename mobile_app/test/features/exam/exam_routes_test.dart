import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/navigation/app_nav.dart';
import 'package:mobile_app/features/exam/data/exam_repository.dart';

import '../../support/fake_providers.dart';
import '../../support/fakes_exam.dart';
import '../../support/pump_router_misc.dart';

/// 路由接线的冒烟用例。
///
/// 三个入口各自落在哪一屏，只有走生产路由（`buildAppRouter`）才测得到：
/// 屏级用例用的是临时路由表，路径写错（例如 `/exam/paper/:id` 少一层）照样绿。
void main() {
  setUpAll(useFakeSecureStorage);

  Future<void> pumpAt(WidgetTester tester, String location) async {
    final adapter = ExamStubAdapter((options) {
      if (options.path.contains('/exam/attempts/')) {
        return examJson(
          examAttemptDetailJson(
            questions: <Map<String, dynamic>>[
              examQuestionJson(id: 1, content: '路由冒烟题'),
            ],
          ),
        );
      }
      if (options.path.contains('/exam/papers/')) {
        return examJson(examPaperDetailJson());
      }
      return examJson(examPaperPageJson(papers: <Map<String, dynamic>>[]));
    });
    await pumpRouter(
      tester,
      initialLocation: location,
      overrides: <Object>[
        examRepositoryProvider.overrideWithValue(examRepositoryWith(adapter)),
      ],
    );
    await settleRouter(tester);
  }

  testWidgets('AppRoutes.exam 落在试卷列表', (tester) async {
    await pumpAt(tester, AppRoutes.exam);

    expect(find.text('还没有试卷'), findsOneWidget);
  });

  testWidgets('AppRoutes.examPaper(id) 落在预览页并带上 id', (tester) async {
    await pumpAt(tester, AppRoutes.examPaper(3));

    expect(find.text('试卷预览'), findsOneWidget);
    expect(find.text('教综模考 11月20日'), findsOneWidget);
    expect(find.textContaining('开始作答'), findsOneWidget);
  });

  testWidgets('AppRoutes.examSession(id) 落在作答页（深链接无 extra）', (tester) async {
    await pumpAt(tester, AppRoutes.examSession('9'));

    expect(find.text('路由冒烟题'), findsOneWidget);
    expect(find.text('第 1 / 1 题'), findsOneWidget);
  });
}
