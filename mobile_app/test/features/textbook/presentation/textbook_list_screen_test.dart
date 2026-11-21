import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/navigation/app_nav.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/textbook/presentation/textbook_detail_screen.dart';
import 'package:mobile_app/features/textbook/presentation/textbook_list_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/fakes_misc.dart';
import '../../../support/pump_router_misc.dart';
import '../../../support/pump_screen.dart';
import '../../../support/recording_adapter.dart';

/// 教材库列表：空/失败/列表渲染，以及「点卡片进的是这一本」。
void main() {
  setUpAll(useFakeSecureStorage);

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('列表渲染：标题、作者、章节数上屏', (tester) async {
    final adapter = RecordingAdapter(
      handler: (options) => jsonBody(<Map<String, dynamic>>[
        textbookJson(id: 1, title: '教育学教材', author: '张三', chapterCount: 3),
        textbookJson(id: 2, title: '心理学教材', author: null, chapterCount: 5),
      ]),
    );

    await pumpScreen(
      tester,
      const TextbookListScreen(),
      overrides: <Object>[dioProvider.overrideWithValue(fakeDio(adapter))],
    );
    await settle(tester);

    expect(adapter.requests.single.path, '/textbook');
    expect(find.text('教育学教材'), findsOneWidget);
    expect(find.text('张三'), findsOneWidget);
    expect(find.text('3 章'), findsOneWidget);
    expect(find.text('心理学教材'), findsOneWidget);
    expect(find.text('5 章'), findsOneWidget);
  });

  testWidgets('空库：显示「暂无教材」与上传引导', (tester) async {
    final adapter = RecordingAdapter(handler: (options) => jsonBody(<dynamic>[]));

    await pumpScreen(
      tester,
      const TextbookListScreen(),
      overrides: <Object>[dioProvider.overrideWithValue(fakeDio(adapter))],
    );
    await settle(tester);

    expect(find.text('暂无教材'), findsOneWidget);
    expect(find.text('请联系管理员上传教材'), findsOneWidget);
    expect(find.text('加载失败'), findsNothing);
  });

  testWidgets('失败：显示错误视图，点重试重新拉取并出列表', (tester) async {
    final adapter = RecordingAdapter();
    var attempts = 0;
    adapter.handler = (options) {
      attempts++;
      if (attempts == 1) {
        return jsonBody(<String, dynamic>{'message': 'boom'}, statusCode: 500);
      }
      return jsonBody(<Map<String, dynamic>>[
        textbookJson(id: 1, title: '教育学教材'),
      ]);
    };

    await pumpScreen(
      tester,
      const TextbookListScreen(),
      overrides: <Object>[dioProvider.overrideWithValue(fakeDio(adapter))],
    );
    await settle(tester);

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.text('暂无教材'), findsNothing);
    expect(adapter.requests, hasLength(1));

    await tester.tap(find.text('重试'));
    await settle(tester);

    expect(adapter.requests, hasLength(2), reason: '重试必须真的重发请求');
    expect(find.text('教育学教材'), findsOneWidget);
    expect(find.text('加载失败'), findsNothing);
  });

  testWidgets('点击卡片：进入 /textbooks/:id 的详情页', (tester) async {
    final adapter = RecordingAdapter();
    adapter.handler = (options) {
      final path = options.uri.path;
      if (path.endsWith('/textbook')) {
        return jsonBody(<Map<String, dynamic>>[
          textbookJson(id: 7, title: '教育学教材'),
        ]);
      }
      if (path.endsWith('/textbook/7')) {
        return jsonBody(textbookDetailJson(
          textbook: textbookJson(id: 7, title: '教育学教材'),
          chapters: <Map<String, dynamic>>[chapterJson(id: 1, textbookId: 7)],
        ));
      }
      return jsonBody(const <String, dynamic>{});
    };

    final router = await pumpRouter(
      tester,
      initialLocation: AppRoutes.textbooks,
      overrides: <Object>[dioProvider.overrideWithValue(fakeDio(adapter))],
    );
    await settle(tester);

    await tester.tap(find.text('教育学教材'));
    await settle(tester);

    expect(find.byType(TextbookDetailScreen), findsOneWidget);
    expect(router.canPop(), isTrue, reason: '详情页压在列表之上，返回可回列表');
    expect(
      adapter.requests.map((request) => request.uri.path),
      contains('/api/textbook/7'),
      reason: '点的是哪一本就要请求它的 id',
    );
  });
}
