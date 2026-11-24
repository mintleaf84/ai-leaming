// 未知题型的作答护栏（与 domain 层的 question_practicability_test.dart 配对）：
// - 题目区：不渲染选项，给「更新 App」提示——用户至少知道为什么不能作答；
// - 底部导航：确认按钮不可用，防止任何路径把「App 不认识」提交成「用户答错」。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/features/practice/presentation/practice_session_state.dart';
import 'package:mobile_app/features/practice/presentation/widgets/practice_bottom_nav.dart';
import 'package:mobile_app/features/practice/presentation/widgets/practice_question_content.dart';
import 'package:mobile_app/shared/domain/question.dart';
import 'package:mobile_app/shared/widgets/animated_option_card.dart';

import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

PracticeSessionState _stateWith(Question question) => PracticeSessionState(
  sessionId: 'session_unknown_type',
  questions: <Question>[question],
);

void main() {
  group('PracticeQuestionContent：未知题型不可作答', () {
    testWidgets('契约内但未实现的题型（fill_blank）：显示提示，不渲染选项', (
      tester,
    ) async {
      await pumpScreen(
        tester,
        PracticeQuestionContent(
          state: _stateWith(fakeQuestion(id: 'q-1', type: 'fill_blank')),
        ),
      );

      expect(find.text('此题型需要更新 App 后才能练习'), findsOneWidget);
      expect(find.text('未知题型'), findsOneWidget);
      expect(find.byType(AnimatedOptionCard), findsNothing);
      expectNoLayoutError(tester);
    });

    testWidgets('即使带了选项也不渲染（契约外新题型不伪装成选择题）', (
      tester,
    ) async {
      await pumpScreen(
        tester,
        PracticeQuestionContent(
          state: _stateWith(
            fakeQuestion(id: 'q-2', type: 'drag_match', options: const <String>[
              '甲',
              '乙',
            ]),
          ),
        ),
      );

      expect(find.byType(AnimatedOptionCard), findsNothing);
      expect(find.text('此题型需要更新 App 后才能练习'), findsOneWidget);
    });

    testWidgets('已支持的单选题照常渲染选项（护栏没有误伤）', (tester) async {
      await pumpScreen(
        tester,
        PracticeQuestionContent(
          state: _stateWith(fakeQuestion(id: 'q-3', type: 'single')),
        ),
      );

      expect(find.byType(AnimatedOptionCard), findsNWidgets(4));
      expect(find.text('此题型需要更新 App 后才能练习'), findsNothing);
      expect(find.text('单选题'), findsOneWidget);
    });
  });

  group('PracticeBottomNav：未知题型不能提交', () {
    testWidgets('即使有选中项，确认按钮也不触发提交', (tester) async {
      var confirmed = 0;
      final question = fakeQuestion(id: 'q-4', type: 'fill_blank');
      final state = _stateWith(question).copyWith(
        userAnswers: <String, List<String>>{question.id: <String>['A']},
      );

      await pumpScreen(
        tester,
        PracticeBottomNav(
          state: state,
          selectedAnswers: const <String>['A'],
          result: null,
          onConfirm: () => confirmed++,
        ),
      );

      await tester.tap(
        find
            .ancestor(
              of: find.text('确认'),
              matching: find.byType(GestureDetector),
            )
            .first,
      );
      await tester.pump();
      expect(confirmed, 0, reason: '不可作答的题没有可提交的东西');
    });

    testWidgets('正常单选题选中后确认可触发（对照组）', (tester) async {
      var confirmed = 0;
      final question = fakeQuestion(id: 'q-5', type: 'single');
      final state = _stateWith(question).copyWith(
        userAnswers: <String, List<String>>{question.id: <String>['A']},
      );

      await pumpScreen(
        tester,
        PracticeBottomNav(
          state: state,
          selectedAnswers: const <String>['A'],
          result: null,
          onConfirm: () => confirmed++,
        ),
      );

      await tester.tap(
        find
            .ancestor(
              of: find.text('确认'),
              matching: find.byType(GestureDetector),
            )
            .first,
      );
      await tester.pump();
      expect(confirmed, 1);
    });
  });
}
