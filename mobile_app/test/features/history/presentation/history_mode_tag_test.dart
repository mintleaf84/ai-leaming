import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/core/theme/app_colors.dart';
import 'package:mobile_app/features/history/presentation/history_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/fakes_history_tags.dart';
import '../../../support/fakes_misc.dart';
import '../../../support/pump_screen.dart';
import '../../../support/recording_adapter.dart';

/// 练习历史的模式标签：`practice_mode` 的每个取值都要说人话，
/// 未知取值必须是中性「其它练习」，**不能**回落成「随机练习」。
void main() {
  setUpAll(useFakeSecureStorage);

  Future<void> pumpHistory(
    WidgetTester tester,
    List<Map<String, dynamic>> items, {
    double textScale = 1.0,
  }) async {
    final adapter = RecordingAdapter(
      handler: (options) => jsonBody(<String, dynamic>{
        'items': items,
        'total': items.length,
        'totalPages': 1,
      }),
    );

    await pumpScreen(
      tester,
      const HistoryScreen(),
      // 列表要一屏放下 9 张卡，否则 ListView 只建可视区内的条目
      size: const Size(400, 1800),
      textScale: textScale,
      overrides: <Object>[
        dioProvider.overrideWithValue(fakeDio(adapter)),
        ...fakePreferences(),
      ],
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('七种已知模式各有中文标签，不出现内部词', (tester) async {
    await pumpHistory(tester, <Map<String, dynamic>>[
      historyItemJson(id: 'm_random', practiceMode: 'random'),
      historyItemJson(id: 'm_wrong', practiceMode: 'wrong'),
      historyItemJson(id: 'm_tag', practiceMode: 'tag'),
      historyItemJson(id: 'm_exam', practiceMode: 'exam'),
      historyItemJson(id: 'm_import', practiceMode: 'import'),
      historyItemJson(id: 'm_agent', practiceMode: 'agent_set'),
      historyItemJson(id: 'm_review', practiceMode: 'review'),
    ]);

    expect(find.text('随机练习'), findsOneWidget);
    expect(find.text('错题复习'), findsOneWidget);
    expect(find.text('专项练习'), findsOneWidget);
    expect(find.text('模拟考试'), findsOneWidget);
    expect(find.text('外部导入'), findsOneWidget);
    expect(find.text('AI 题集'), findsOneWidget);
    expect(find.text('记忆复习'), findsOneWidget);

    for (final raw in <String>[
      'random',
      'wrong',
      'tag',
      'exam',
      'import',
      'agent_set',
      'review',
    ]) {
      expect(
        find.text(raw),
        findsNothing,
        reason: '「$raw」是数据库里的内部取值，界面不能直接露出来',
      );
    }
  });

  testWidgets('未知模式与缺失模式显示中性「其它练习」，不冒充随机练习', (tester) async {
    await pumpHistory(tester, <Map<String, dynamic>>[
      historyItemJson(id: 'm_random', practiceMode: 'random'),
      historyItemJson(id: 'm_unknown', practiceMode: 'flashcard_v2'),
      // 老会话可能没有这个字段
      historyItemJson(id: 'm_missing'),
    ]);

    expect(
      find.text('随机练习'),
      findsOneWidget,
      reason: '只有真正 random 的那一场才配「随机练习」',
    );
    expect(find.text('其它练习'), findsNWidgets(2));

    // 中性配色：取自主题的灰阶，而不是任何语义色
    final tag = tester.widget<Container>(
      find
          .ancestor(
            of: find.text('其它练习').first,
            matching: find.byType(Container),
          )
          .first,
    );
    expect((tag.decoration! as BoxDecoration).color, AppColors.light.surfaceAlt);
    final label = tester.widget<Text>(find.text('其它练习').first);
    expect(label.style?.color, AppColors.light.textSecondary);
  });

  testWidgets('1.3 倍字号下标签不溢出', (tester) async {
    await pumpHistory(
      tester,
      <Map<String, dynamic>>[
        historyItemJson(id: 'm_exam', practiceMode: 'exam'),
        historyItemJson(id: 'm_import', practiceMode: 'import'),
        historyItemJson(id: 'm_agent', practiceMode: 'agent_set'),
        historyItemJson(id: 'm_unknown', practiceMode: 'flashcard_v2'),
      ],
      textScale: 1.3,
    );

    expectNoLayoutError(tester, reason: '大字号下模式标签不能把卡片标题行挤爆');
    expect(find.text('模拟考试'), findsOneWidget);
    expect(find.text('其它练习'), findsOneWidget);
  });
}
