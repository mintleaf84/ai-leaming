import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/questions/domain/question_draft.dart';
import 'package:mobile_app/features/questions/presentation/drafts_screen.dart';

import '../../../support/pump_screen.dart';
import '../fake_question_editor_repository.dart';
import 'draft_fixtures.dart';

/// 草稿列表：状态与条数必须一眼可见。
///
/// 「识别中」尤其重要——AI 识别是服务端异步跑的，列表上如果不显示这个状态，
/// 用户会以为上传失败反复重拍。
void main() {
  testWidgets('列表显示每种状态与条数', (tester) async {
    final repository = FakeQuestionEditorRepository(
      drafts: <QuestionDraftSummary>[
        fakeDraftSummary(
          id: 'd1',
          status: DraftStatus.ready,
          itemCount: 3,
          confirmedCount: 1,
        ),
        fakeDraftSummary(
          id: 'd2',
          status: DraftStatus.failed,
          errorCode: 'AI_TIMEOUT',
          itemCount: 0,
        ),
        fakeDraftSummary(id: 'd3', status: DraftStatus.analyzing),
        fakeDraftSummary(
          id: 'd4',
          status: DraftStatus.confirmed,
          itemCount: 5,
          confirmedCount: 5,
        ),
      ],
    );

    await pumpScreen(
      tester,
      const DraftsScreen(),
      overrides: <Object>[
        questionEditorRepositoryOverride(repository),
      ],
    );
    await tester.pump();

    expect(find.text('待校对'), findsOneWidget);
    expect(find.text('共 3 条'), findsOneWidget);
    expect(find.text('待校对 · 已确认 1 条'), findsOneWidget);

    expect(find.text('识别失败'), findsOneWidget);
    expect(find.text('识别失败（AI_TIMEOUT），点开可重试'), findsOneWidget);

    expect(find.text('识别中'), findsOneWidget);
    expect(find.text('正在识别，可以稍后回来查看'), findsOneWidget);

    expect(find.text('已入库'), findsOneWidget);
    expect(find.text('已入库 5 条'), findsOneWidget);
  });

  testWidgets('没有草稿时给出空态而不是白屏', (tester) async {
    final repository = FakeQuestionEditorRepository();

    await pumpScreen(
      tester,
      const DraftsScreen(),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    expect(find.text('暂无草稿'), findsOneWidget);
    expect(repository.listCalls, 1, reason: '进入列表就该拉一次');
  });

  testWidgets('加载失败显示错误并可重试', (tester) async {
    final repository = FakeQuestionEditorRepository()
      ..loadError = Exception('boom');

    await pumpScreen(
      tester,
      const DraftsScreen(),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    expect(find.text('加载失败'), findsOneWidget);

    repository.loadError = null;
    repository.drafts = <QuestionDraftSummary>[
      fakeDraftSummary(id: 'd1', status: DraftStatus.ready, itemCount: 2),
    ];

    await tester.tap(find.text('重试'));
    await tester.pump();
    await tester.pump();

    expect(repository.listCalls, 2);
    expect(find.text('共 2 条'), findsOneWidget);
  });

  testWidgets('下拉刷新会重新请求列表', (tester) async {
    final repository = FakeQuestionEditorRepository(
      drafts: <QuestionDraftSummary>[
        fakeDraftSummary(id: 'd1', status: DraftStatus.ready, itemCount: 1),
      ],
    );

    await pumpScreen(
      tester,
      const DraftsScreen(),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    await tester.fling(find.text('共 1 条'), const Offset(0, 300), 1000);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(repository.listCalls, greaterThanOrEqualTo(2));
  });
}
