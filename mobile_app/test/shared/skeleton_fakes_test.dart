import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skeletonizer/skeletonizer.dart';

import 'package:mobile_app/shared/skeletons/skeleton_fakes.dart';

/// 骨架屏假数据的护栏（见 docs/mobile-ui-kit.md D-2 / M-06）。
///
/// 假数据唯一的严重风险是「被当成真数据接进链路」，其次是 Hero tag 重复导致
/// 骨架一渲染就抛异常。这两点都在这里卡住。
void main() {
  group('骨架假数据', () {
    test('列表项 id 随 index 变化（Hero tag 不能重复）', () {
      expect(
        fakeHistoryItem(index: 0).id,
        isNot(equals(fakeHistoryItem(index: 1).id)),
      );
      expect(
        fakeWrongQuestion(index: 0).questionId,
        isNot(equals(fakeWrongQuestion(index: 1).questionId)),
      );
      expect(
        fakeQuestion(index: 0).id,
        isNot(equals(fakeQuestion(index: 1).id)),
      );
      expect(
        fakeKnowledgeCard(index: 0).id,
        isNot(equals(fakeKnowledgeCard(index: 1).id)),
      );
    });

    test('字段值是明显假值，不会被误当成真实内容', () {
      expect(fakeHistoryItem().sessionName, kSkeletonText);
      expect(fakeKnowledgeCard().title, kSkeletonText);
      expect(fakeWrongQuestion().questionContent, kSkeletonText);
      expect(fakeQuestion().content, kSkeletonText);
      expect(fakePracticeLog().questionContent, kSkeletonText);
      expect(fakePracticeSessionState().questions, isNotEmpty);
      expect(fakePracticeSessionState().questions.length, 3);
    });

    test('练习骨架状态不带账号/会话的真实标识', () {
      final state = fakePracticeSessionState();
      expect(state.sessionId, 'skeleton-session');
      expect(state.userAnswers, isEmpty);
      expect(state.results, isEmpty);
    });

    test('首页统计假数据能撑起进度卡（首页骨架用）', () {
      final stats = fakeStatsSummary();
      expect(stats.todayCount, 20);
      expect(stats.todayCorrect, 15);
      expect(stats.todayAccuracy, 0.75);
      expect(stats.totalSessions, 16);
      expect(stats.streakDays, 3);
    });
  });

  testWidgets('Skeletonizer 开启后骨骼可渲染且不抛异常', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Skeletonizer(
          enabled: true,
          child: ListView(
            children: const <Widget>[
              Bone.text(words: 6),
              SizedBox(height: 8),
              Bone.text(words: 4),
            ],
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    // Bone 是抽象基类，具体实现是私有子类，byType 匹配不到，用谓词找。
    expect(
      find.byWidgetPredicate((Widget widget) => widget is Bone),
      findsAtLeastNWidgets(2),
    );

  });

  testWidgets('关闭时骨骼替换为真实子组件', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Skeletonizer(
          enabled: false,
          child: Text('真实内容'),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(find.text('真实内容'), findsOneWidget);
  });
}
