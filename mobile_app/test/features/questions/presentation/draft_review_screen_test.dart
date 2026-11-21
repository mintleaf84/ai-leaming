import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_app/core/navigation/app_nav.dart';
import 'package:mobile_app/features/questions/domain/question_draft.dart';
import 'package:mobile_app/features/questions/presentation/draft_review_screen.dart';

import '../../../support/pump_router.dart';
import '../../../support/pump_screen.dart';
import '../fake_question_editor_repository.dart';
import 'draft_fixtures.dart';

/// 校对页（§34.3）的四条关键路径：
///
/// - `ready`：每一条都能改、能删、能逐条勾选确认；
/// - `confirm`：结果里的 `created` / `skipped` 必须显示出来；
/// - `failed`：错误码可见，且「重新识别」真的重发请求；
/// - `analyzing`：可以离开再回来（重新 GET），不能显示一张空白页。
void main() {
  testWidgets('ready：改题干后保存，发的是这一条的 PATCH 载荷', (tester) async {
    final repository = FakeQuestionEditorRepository(
      draft: fakeDraft(
        items: <QuestionDraftItem>[
          fakeDraftItem(idx: 0, content: 'AI 识别的题干甲', confirmed: true),
          fakeDraftItem(idx: 1, content: 'AI 识别的题干乙'),
        ],
      ),
    );

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    expect(find.text('第 1 条'), findsOneWidget);
    expect(find.text('第 2 条'), findsOneWidget);
    expect(find.text('已勾选 1 条待入库'), findsOneWidget);

    await tester.enterText(
      find.byKey(DraftReviewKeys.itemContent(0)),
      '人工改过的题干甲',
    );
    await tester.ensureVisible(find.byKey(DraftReviewKeys.itemSave(0)));
    await tester.tap(find.byKey(DraftReviewKeys.itemSave(0)));
    await tester.pump();
    await tester.pump();

    expect(repository.itemPatches, hasLength(1));
    final (draftId, idx, patch) = repository.itemPatches.single;
    expect(draftId, 'd1');
    expect(idx, 0);
    expect(patch['content'], '人工改过的题干甲');
    expect(patch['confirmed'], isTrue, reason: '保存不能把已勾选的确认状态冲掉');
    expect(patch['options'], <String>['选项甲', '选项乙']);
  });

  testWidgets('删除单条走同一个 PATCH 端点（deleted）', (tester) async {
    final repository = FakeQuestionEditorRepository(
      draft: fakeDraft(
        items: <QuestionDraftItem>[fakeDraftItem(idx: 0), fakeDraftItem(idx: 1)],
      ),
    );

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    await tester.ensureVisible(find.byKey(DraftReviewKeys.itemDelete(0)));
    await tester.tap(find.byKey(DraftReviewKeys.itemDelete(0)));
    await tester.pump();
    await tester.pump();

    expect(repository.deletedItems, <int>[0]);
  });

  testWidgets('全部确认入库后显示 created / skipped', (tester) async {
    final repository = FakeQuestionEditorRepository(
      draft: fakeDraft(
        items: <QuestionDraftItem>[
          fakeDraftItem(idx: 0, confirmed: true),
          fakeDraftItem(idx: 1, confirmed: true),
        ],
      ),
      confirmResult: const DraftConfirmResult(created: 2, skipped: 1),
    );

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    expect(find.text('已勾选 2 条待入库'), findsOneWidget);

    await tester.tap(find.byKey(DraftReviewKeys.confirmAll));
    await tester.pump();
    await tester.pump();

    expect(repository.confirmedDrafts, <String>['d1']);
    expect(find.text('已入库 2 题，跳过 1 题'), findsOneWidget);
  });

  testWidgets('一条都没勾选时确认按钮不可点', (tester) async {
    final repository = FakeQuestionEditorRepository(
      draft: fakeDraft(
        items: <QuestionDraftItem>[fakeDraftItem(idx: 0, confirmed: false)],
      ),
    );

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    expect(find.text('先勾选要入库的条目'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.byKey(DraftReviewKeys.confirmAll))
          .onPressed,
      isNull,
      reason: 'confirmed 为空的 confirm 只会得到 created=0，不该让用户白点',
    );
  });

  testWidgets('failed：显示错误码，「重试」重新触发识别', (tester) async {
    final repository = FakeQuestionEditorRepository(
      draft: fakeDraft(status: DraftStatus.failed, errorCode: 'AI_TIMEOUT'),
      analyzeResult: fakeDraft(
        status: DraftStatus.ready,
        items: <QuestionDraftItem>[fakeDraftItem(idx: 0, content: '重试后的题干')],
      ),
    );

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    expect(find.text('识别失败'), findsOneWidget);
    expect(find.text('识别失败（AI_TIMEOUT），可以重新尝一次'), findsOneWidget);

    await tester.tap(find.text('重试'));
    await tester.pump();
    await tester.pump();

    expect(repository.analyzedDrafts, <String>['d1']);
    expect(find.text('第 1 条'), findsOneWidget, reason: '识别成功后直接进入校对');
  });

  testWidgets('analyzing：说明可以离开，并能手动刷新状态', (tester) async {
    final repository = FakeQuestionEditorRepository(
      draft: fakeDraft(status: DraftStatus.analyzing, items: <QuestionDraftItem>[]),
    );

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    expect(find.text('AI 正在识别这部分内容'), findsOneWidget);
    expect(find.text('可以先离开，稍后回来自动重新加载'), findsOneWidget);

    final before = repository.fetchDraftCalls;
    await tester.tap(find.text('刷新状态'));
    await tester.pump();
    await tester.pump();

    expect(repository.fetchDraftCalls, before + 1);
  });

  testWidgets('识别结果为空时不显示确认按钮', (tester) async {
    final repository = FakeQuestionEditorRepository(
      draft: fakeDraft(status: DraftStatus.ready, items: <QuestionDraftItem>[]),
    );

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    expect(find.text('没有识别出题目'), findsOneWidget);
    expect(find.byKey(DraftReviewKeys.confirmAll), findsNothing);
  });

  testWidgets('加载失败整页报错，可重试', (tester) async {
    final repository = FakeQuestionEditorRepository()..loadError = Exception('x');

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    expect(find.text('加载失败'), findsOneWidget);

    repository
      ..loadError = null
      ..draft = fakeDraft(items: <QuestionDraftItem>[fakeDraftItem(idx: 0)]);

    await tester.tap(find.text('重试'));
    await tester.pump();
    await tester.pump();

    expect(find.text('第 1 条'), findsOneWidget);
  });

  testWidgets('1.3 倍字号下长文本不溢出', (tester) async {
    final repository = FakeQuestionEditorRepository(
      draft: fakeDraft(
        items: <QuestionDraftItem>[
          fakeDraftItem(
            idx: 0,
            content: '很长很长的题干：${'我国教育目的的理论基础是什么？' * 6}',
            explanation: '很长很长的解析：${'教育目的受社会条件制约。' * 6}',
            confirmed: true,
          ),
        ],
      ),
    );

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
      textScale: 1.3,
    );
    await tester.pump();

    expectNoLayoutError(tester);
    expect(find.byKey(DraftReviewKeys.itemCard(0)), findsOneWidget);
  });

  // ---------------------------------------------------------------------
  // 其余状态分支：导航（返回/丢弃/次要出口）、页内错误条、discarded、
  // confirmed/unknown、单条勾选、确认中的 spinner
  // ---------------------------------------------------------------------

  /// 挂在 `/drafts` 之上再 push 校对页：这样 `backOrHome` 才有上一页可回，
  /// 能区分「回列表」和「回首页」。
  Future<GoRouter> pumpPushedDraft(
    WidgetTester tester,
    FakeQuestionEditorRepository repository,
  ) async {
    final router = await pumpRouter(
      tester,
      initialLocation: AppRoutes.drafts,
      routes: <String, WidgetBuilder>{
        AppRoutes.drafts: (context) => routeStub(AppRoutes.drafts),
        AppRoutes.draftDetail('d1'): (context) =>
            const DraftReviewScreen(draftId: 'd1'),
      },
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    router.push(AppRoutes.draftDetail('d1'));
    await tester.pumpAndSettle();
    return router;
  }

  testWidgets('返回按钮：栈里有上一页就回草稿列表', (tester) async {
    final repository = FakeQuestionEditorRepository(draft: fakeDraft());
    final router = await pumpPushedDraft(tester, repository);

    expect(find.text('草稿校对'), findsOneWidget);

    await tester.tap(find.byTooltip('返回'));
    await tester.pumpAndSettle();

    expectLocation(router, AppRoutes.drafts);
  });

  testWidgets('右上菜单「丢弃」成功后回草稿列表', (tester) async {
    final repository = FakeQuestionEditorRepository(draft: fakeDraft());
    final router = await pumpPushedDraft(tester, repository);

    // 菜单项是按需构建的：不点开就拿不到「丢弃」这一项
    await tester.tap(find.byKey(DraftReviewKeys.discard));
    await tester.pumpAndSettle();
    expect(find.text('丢弃这份草稿'), findsOneWidget);

    await tester.tap(find.text('丢弃这份草稿'));
    await tester.pumpAndSettle();

    expect(repository.discardedDrafts, <String>['d1']);
    expectLocation(router, AppRoutes.drafts);
  });

  testWidgets('首屏加载失败：次要出口「返回草稿列表」回列表', (tester) async {
    final repository = FakeQuestionEditorRepository()..loadError = Exception('x');
    final router = await pumpPushedDraft(tester, repository);

    expect(find.text('加载失败'), findsOneWidget);

    await tester.tap(find.text('返回草稿列表'));
    await tester.pumpAndSettle();

    expectLocation(router, AppRoutes.drafts);
  });

  testWidgets('单条保存失败：页内红条提示，已上屏内容不清空', (tester) async {
    final repository = FakeQuestionEditorRepository(
      draft: fakeDraft(
        items: <QuestionDraftItem>[
          fakeDraftItem(idx: 0, content: 'AI 识别的题干'),
        ],
      ),
    );

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    repository.saveError = Exception('x');
    await tester.enterText(
      find.byKey(DraftReviewKeys.itemContent(0)),
      '人工改过的题干',
    );
    await tester.ensureVisible(find.byKey(DraftReviewKeys.itemSave(0)));
    await tester.tap(find.byKey(DraftReviewKeys.itemSave(0)));
    await tester.pump();
    await tester.pump();

    // 失败不清空已上屏的条目，只加一条可关闭前一直可见的提示
    expect(find.text('出了点问题，请重试'), findsOneWidget);
    expect(find.text('第 1 条'), findsOneWidget);

    // 修好后再保存一次，红条应当随 copyWith 清空
    repository.saveError = null;
    await tester.tap(find.byKey(DraftReviewKeys.itemSave(0)));
    await tester.pump();
    await tester.pump();

    expect(find.text('出了点问题，请重试'), findsNothing);
    expect(repository.itemPatches, hasLength(1));
  });

  testWidgets('discarded 状态：空态 +「返回草稿列表」回列表', (tester) async {
    final repository = FakeQuestionEditorRepository(
      draft: fakeDraft(status: DraftStatus.discarded, items: <QuestionDraftItem>[]),
    );
    final router = await pumpPushedDraft(tester, repository);

    expect(find.text('这份草稿已丢弃'), findsOneWidget);

    await tester.tap(find.text('返回草稿列表'));
    await tester.pumpAndSettle();

    expectLocation(router, AppRoutes.drafts);
  });

  testWidgets('confirmed 状态照样进校对视图（不能因已入库就白屏）', (tester) async {
    final repository = FakeQuestionEditorRepository(
      draft: fakeDraft(
        status: DraftStatus.confirmed,
        items: <QuestionDraftItem>[fakeDraftItem(idx: 0, confirmed: true)],
      ),
    );

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    expect(find.text('第 1 条'), findsOneWidget);
    expect(find.text('已勾选 1 条待入库'), findsOneWidget);
  });

  testWidgets('unknown 状态照样进校对视图（未知状态不能变成空白页）', (tester) async {
    final repository = FakeQuestionEditorRepository(
      draft: fakeDraft(
        status: DraftStatus.unknown,
        items: <QuestionDraftItem>[fakeDraftItem(idx: 0)],
      ),
    );

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    expect(find.text('第 1 条'), findsOneWidget);
    expect(find.text('先勾选要入库的条目'), findsOneWidget);
  });

  testWidgets('勾选单条「确认入库」只发 confirmed 字段', (tester) async {
    final repository = FakeQuestionEditorRepository(
      draft: fakeDraft(
        items: <QuestionDraftItem>[fakeDraftItem(idx: 0, confirmed: false)],
      ),
    );

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    expect(find.text('先勾选要入库的条目'), findsOneWidget);

    await tester.ensureVisible(find.byKey(DraftReviewKeys.itemConfirmed(0)));
    await tester.tap(find.byKey(DraftReviewKeys.itemConfirmed(0)));
    await tester.pump();
    await tester.pump();

    final (draftId, idx, patch) = repository.itemPatches.single;
    expect(draftId, 'd1');
    expect(idx, 0);
    expect(patch, <String, dynamic>{'confirmed': true});
  });

  testWidgets('确认入库进行中：按钮里是 spinner，结果回来才显示 created/skipped', (
    tester,
  ) async {
    final gate = Completer<void>();
    final repository =
        FakeQuestionEditorRepository(
          draft: fakeDraft(
            items: <QuestionDraftItem>[fakeDraftItem(idx: 0, confirmed: true)],
          ),
          confirmResult: const DraftConfirmResult(created: 1, skipped: 0),
        )..confirmGate = gate;

    await pumpScreen(
      tester,
      const DraftReviewScreen(draftId: 'd1'),
      overrides: <Object>[questionEditorRepositoryOverride(repository)],
    );
    await tester.pump();

    await tester.tap(find.byKey(DraftReviewKeys.confirmAll));
    await tester.pump();

    // 请求还没回来：按钮不可再点，里面是 spinner，且没有提前宣布结果
    expect(
      find.descendant(
        of: find.byKey(DraftReviewKeys.confirmAll),
        matching: find.byType(CircularProgressIndicator),
      ),
      findsOneWidget,
    );
    expect(repository.confirmedDrafts, isEmpty);

    gate.complete();
    await tester.pump();
    await tester.pump();
    await tester.pump();

    expect(find.text('已入库 1 题'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(DraftReviewKeys.confirmAll),
        matching: find.byType(CircularProgressIndicator),
      ),
      findsNothing,
    );
  });
}
