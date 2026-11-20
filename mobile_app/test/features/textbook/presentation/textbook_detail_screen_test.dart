import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/features/textbook/domain/textbook.dart';
import 'package:mobile_app/features/textbook/presentation/textbook_detail_screen.dart';
import 'package:mobile_app/features/textbook/presentation/textbook_provider.dart';

import '../../../support/fake_providers.dart';
import '../../../support/fakes_misc.dart';
import '../../../support/pump_screen.dart';

/// 教材详情：章节树（根 + 子章节缩进）、空章节、两种失败表达。
///
/// 失败在这个屏有两条路径：provider 自己 catch 后写 `state.error`
/// （断网/5xx 走这条），以及 provider 本身抛成 `AsyncError`。两条都必须
/// 给出可读反馈，否则用户看到的是白屏。
///
/// 已知缺口（不改 lib/，只回报）：这个屏**没有重试入口**——失败后只能靠
/// 返回键回列表再点一遍。用例只锁「失败可见」，不假装能重试。
void main() {
  setUpAll(useFakeSecureStorage);

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('章节列表：根章节与子章节都渲染，头部信息齐全', (tester) async {
    final detail = TextbookDetail(
      textbook: fakeTextbook(id: 7, title: '教育学教材', author: '张三', chapterCount: 3),
      chapters: <TextbookChapter>[
        fakeChapter(id: 1, textbookId: 7, title: '第一章 教育', orderIndex: 1),
        fakeChapter(
          id: 2,
          textbookId: 7,
          title: '1.1 教育的概念',
          orderIndex: 2,
          parentId: 1,
          level: 1,
        ),
        fakeChapter(id: 3, textbookId: 7, title: '第二章 课程', orderIndex: 3),
      ],
    );

    await pumpScreen(
      tester,
      const TextbookDetailScreen(textbookId: 7),
      overrides: fakeTextbookDetail(
        7,
        state: TextbookDetailState(detail: detail),
      ),
    );
    await settle(tester);

    expect(find.text('共 3 章'), findsOneWidget);
    expect(find.text('作者：张三'), findsOneWidget);
    expect(find.text('教材简介正文'), findsOneWidget);
    expect(find.text('章节目录'), findsOneWidget);
    expect(find.text('第一章 教育'), findsOneWidget);
    expect(find.text('1.1 教育的概念'), findsOneWidget, reason: '子章节按 parentId 挂到根下');
    expect(find.text('第二章 课程'), findsOneWidget);
    expect(find.text('暂无章节内容'), findsNothing);
  });

  testWidgets('空章节：给出「暂无章节内容」，不留下空白区域', (tester) async {
    final detail = TextbookDetail(
      textbook: fakeTextbook(id: 7, chapterCount: 0),
      chapters: const <TextbookChapter>[],
    );

    await pumpScreen(
      tester,
      const TextbookDetailScreen(textbookId: 7),
      overrides: fakeTextbookDetail(
        7,
        state: TextbookDetailState(detail: detail),
      ),
    );
    await settle(tester);

    expect(find.text('暂无章节内容'), findsOneWidget);
    expect(find.text('共 0 章'), findsOneWidget);
  });

  testWidgets('失败（状态字段）：显示错误文案，不冒充「暂无章节内容」', (tester) async {
    await pumpScreen(
      tester,
      const TextbookDetailScreen(textbookId: 7),
      overrides: fakeTextbookDetail(
        7,
        state: const TextbookDetailState(error: '请求失败（500）'),
      ),
    );
    await settle(tester);

    // 统一错误态后不再把原始异常铺在屏上，只给可读文案 + 重试入口
    expect(find.text('教材内容没加载出来'), findsOneWidget);
    expect(find.text('请求失败（500）'), findsNothing);
    expect(find.text('重试'), findsOneWidget);
    expect(find.text('暂无章节内容'), findsNothing);
  });

  testWidgets('失败（AsyncError）：显示「加载失败」，不白屏', (tester) async {
    await pumpScreen(
      tester,
      const TextbookDetailScreen(textbookId: 7),
      overrides: fakeTextbookDetail(7, error: StateError('boom')),
    );
    await settle(tester);

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.text('暂无章节内容'), findsNothing);
  });
}
