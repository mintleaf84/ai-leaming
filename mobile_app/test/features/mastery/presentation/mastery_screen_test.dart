import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/mastery/presentation/mastery_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/fakes_misc.dart';
import '../../../support/pump_screen.dart';
import '../../../support/recording_adapter.dart';

/// 掌握度屏：树渲染（含父子缩进层级）、空树、失败与重试。
///
/// 掌握度分数只是展示，不做加权换算；这里守的是「树结构真的按 children
/// 递归渲染」和「三种状态彼此不冒充」。
void main() {
  setUpAll(useFakeSecureStorage);

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  List<Map<String, dynamic>> treeJson() => <Map<String, dynamic>>[
    masteryNodeJson(
      name: '教育学',
      path: 'edu',
      score: 85,
      level: 0,
      children: <Map<String, dynamic>>[
        masteryNodeJson(
          name: '课程理论',
          path: 'edu.course',
          score: 40,
          level: 1,
        ),
      ],
    ),
  ];

  testWidgets('树渲染：根节点与子节点都上屏，分数带一位小数', (tester) async {
    final adapter = RecordingAdapter(
      handler: (options) => jsonBody(treeJson()),
    );

    await pumpScreen(
      tester,
      const MasteryScreen(),
      overrides: <Object>[dioProvider.overrideWithValue(fakeDio(adapter))],
    );
    await settle(tester);

    expect(adapter.requests.single.path, '/mastery/tree');
    expect(find.text('教育学'), findsOneWidget);
    expect(find.text('85.0%'), findsOneWidget);
    expect(find.text('层级: 0'), findsOneWidget);
    // 子节点（level >= 1）作为父节点 children 被递归渲染：它的标题与分数
    // 都在树上，证明用的不是「只渲染根节点」的平铺实现。
    expect(find.text('课程理论'), findsOneWidget);
    expect(find.text('40.0%'), findsOneWidget);
    expect(find.text('层级: 1'), findsOneWidget);
  });

  testWidgets('空树：显示「暂无数据」，不是一直转圈', (tester) async {
    final adapter = RecordingAdapter(handler: (options) => jsonBody(<dynamic>[]));

    await pumpScreen(
      tester,
      const MasteryScreen(),
      overrides: <Object>[dioProvider.overrideWithValue(fakeDio(adapter))],
    );
    await settle(tester);

    expect(find.text('暂无数据'), findsOneWidget);
    expect(find.text('加载失败'), findsNothing);
  });

  testWidgets('失败：给出可读提示，点重试重新拉取并渲染出树', (tester) async {
    final adapter = RecordingAdapter();
    var attempts = 0;
    adapter.handler = (options) {
      attempts++;
      if (attempts == 1) {
        return jsonBody(<String, dynamic>{'message': 'boom'}, statusCode: 500);
      }
      return jsonBody(treeJson());
    };

    await pumpScreen(
      tester,
      const MasteryScreen(),
      overrides: <Object>[dioProvider.overrideWithValue(fakeDio(adapter))],
    );
    await settle(tester);

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.text('请检查网络后重试'), findsOneWidget);
    expect(adapter.requests, hasLength(1));

    await tester.tap(find.text('重试'));
    await settle(tester);

    expect(adapter.requests, hasLength(2), reason: '重试必须真的再发一次请求');
    expect(find.text('教育学'), findsOneWidget);
    expect(find.text('加载失败'), findsNothing);
  });
}
