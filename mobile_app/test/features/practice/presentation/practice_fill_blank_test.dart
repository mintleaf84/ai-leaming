// 填空题在练习流程里可作答（`type == 'fill_blank'`）。
//
// 跑真控制器 + 假仓库（与 `practice_screen_test.dart` 同一套路）：填空题的关键
// 行为是「渲染几个空 → 逐空写回 state → 填完才提交 → 提交串按中文分号 join」，
// 这四步跨了题面区、底部导航与控制器，只测其中一层证明不了闭环。
//
// 空数与提交串的**口径**本身在 `test/features/practice/domain/fill_blank_answer_test.dart`
// 里钉；这里只守它接上了界面。
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/presentation/practice_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

/// 两道填空题：一道带答案（离线续练的题面形态），一道不带（出题接口的形态）。
Question _fillBlankWithAnswer({
  String id = '1',
  String content = '素质教育强调人的____和____。',
  String answer = '主体性；全体性',
}) {
  return fakeQuestion(
    id: id,
    content: content,
    type: 'fill_blank',
    options: const <String>[],
    answer: answer,
  );
}

Future<void> settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump();
}

Future<void> openPractice(
  WidgetTester tester,
  FakePracticeRepository repository,
) async {
  await pumpScreen(
    tester,
    const PracticeScreen(),
    overrides: fakePractice(repository: repository),
  );
  await settle(tester);
}

/// 点中间的「确认」。禁用态下它仍然可命中，只是不会触发提交。
Future<void> tapConfirm(WidgetTester tester) async {
  await tester.tap(
    find
        .ancestor(of: find.text('确认'), matching: find.byType(GestureDetector))
        .first,
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(useFakeSecureStorage);

  group('空数：题面里几个空就渲染几个输入框', () {
    testWidgets('答案里的 `；` 决定空数，半角分号不额外加空', (tester) async {
      await openPractice(
        tester,
        FakePracticeRepository(
          questions: <Question>[_fillBlankWithAnswer(answer: '甲；乙;丙')],
        ),
      );

      expect(find.text('填空题'), findsOneWidget);
      // 判分只按 `；` 切（服务端 answer-check.ts），这里必须同样切两刀：
      // 半角分号是第二空的文本「乙;丙」，不是第三个空。
      expect(find.byType(TextFormField), findsNWidgets(2));
      expect(find.text('空 1'), findsOneWidget);
      expect(find.text('空 2'), findsOneWidget);
      expect(find.text('空 3'), findsNothing);
      // 填空没有选项，不再按单选渲染空卡片让用户白挨一个错。
      expect(find.text('此题型需要更新 App 后才能练习'), findsNothing);
      expectNoLayoutError(tester);
    });

    testWidgets('出题接口不带答案：按题干里画出的下划线渲染空位', (tester) async {
      await openPractice(
        tester,
        FakePracticeRepository(
          questions: <Question>[
            _fillBlankWithAnswer(answer: '', content: '第一空____，第二空____。'),
          ],
        ),
      );

      expect(find.byType(TextFormField), findsNWidgets(2));
    });

    testWidgets('既没有答案也没有下划线：一个输入框（不是零个）', (tester) async {
      await openPractice(
        tester,
        FakePracticeRepository(
          questions: <Question>[
            _fillBlankWithAnswer(answer: '', content: '「猫」的英文怎么拼？'),
          ],
        ),
      );

      expect(find.byType(TextFormField), findsOneWidget);
    });
  });

  group('提交：填完才送，送的是按中文分号拼的串', () {
    testWidgets('有空没填时确认不可用，填完才提交', (tester) async {
      final repository = FakePracticeRepository(
        questions: <Question>[_fillBlankWithAnswer()],
      );
      await openPractice(tester, repository);

      // 一个空都没填：确认不触发提交。
      await tapConfirm(tester);
      expect(repository.submitCalls, 0, reason: '没填完没有可提交的东西');

      // 只填一空：仍然不提交（少一空送去必然被按「空数不一致」判错）。
      await tester.enterText(find.byType(TextFormField).first, '主体性');
      await tester.pump();
      await tapConfirm(tester);
      expect(repository.submitCalls, 0);

      // 填完两空：提交，且拼成服务端要的形状。
      await tester.enterText(find.byType(TextFormField).at(1), '全体性');
      await tester.pump();
      await tapConfirm(tester);

      expect(repository.submitCalls, 1);
      expect(repository.submittedAnswers, <String>['主体性；全体性']);
    });

    testWidgets('混用分号的答案：按界面填两空提交 `甲；乙;丙` 判对', (tester) async {
      // 钉的是「渲染切法 == 判分切法」这条闭环：端上渲染两空（半角分号属于第二空
      // 的文本），用户照着填就该判对。若渲染多切一刀，这里会多要一个空而判错。
      final repository = FakePracticeRepository(
        questions: <Question>[
          _fillBlankWithAnswer(
            content: '第一空____，第二空____。',
            answer: '甲；乙;丙',
          ),
        ],
        submitResponse: const <String, dynamic>{
          'isCorrect': true,
          'correctAnswer': '甲；乙;丙',
        },
      );
      await openPractice(tester, repository);

      expect(find.byType(TextFormField), findsNWidgets(2));
      await tester.enterText(find.byType(TextFormField).first, '甲');
      await tester.enterText(find.byType(TextFormField).at(1), '乙;丙');
      await tester.pump();
      await tapConfirm(tester);

      expect(repository.submitCalls, 1);
      expect(repository.submittedAnswers, <String>['甲；乙;丙']);
      expect(find.text('正确答案：空 1：甲\n空 2：乙;丙'), findsOneWidget);
      expect(find.text('你的答案：空 1：甲\n空 2：乙;丙'), findsOneWidget);
      expectNoLayoutError(tester);
    });

    testWidgets('判分后输入框只读，解析面板按空序列出双方答案', (tester) async {
      final repository = FakePracticeRepository(
        questions: <Question>[_fillBlankWithAnswer()],
        submitResponse: const <String, dynamic>{
          'isCorrect': false,
          'correctAnswer': '主体性；全体性',
        },
        detail: fakeQuestion(id: '1', explanation: '这是权威解析'),
      );
      await openPractice(tester, repository);

      await tester.enterText(find.byType(TextFormField).first, '主体性');
      await tester.enterText(find.byType(TextFormField).at(1), '个别性');
      await tester.pump();
      await tapConfirm(tester);

      expect(repository.submitCalls, 1);
      // 正确答案与已提交答案都按空序逐行，才看得出是哪一空偏了。
      expect(find.text('正确答案：空 1：主体性\n空 2：全体性'), findsOneWidget);
      expect(find.text('你的答案：空 1：主体性\n空 2：个别性'), findsOneWidget);
      expect(find.text('这是权威解析'), findsOneWidget);

      // 已提交的作答不能再改：改一处就会出现两个版本的「你的答案」。
      // （断的是内层 TextField：TextFormField 把 readOnly 转交给它自己持有。）
      for (final field in tester.widgetList<TextField>(
        find.byType(TextField),
      )) {
        expect(field.readOnly, isTrue);
      }
      expectNoLayoutError(tester);
    });
  });

  group('换题与回到上一题：文本跟着这场练习走', () {
    testWidgets('下一题换一套空，上一题回来还带着填过的文本', (tester) async {
      final repository = FakePracticeRepository(
        questions: <Question>[
          _fillBlankWithAnswer(id: '1', answer: '主体性；全体性'),
          _fillBlankWithAnswer(
            id: '2',
            content: '新课型的核心理念是____。',
            answer: 'eko',
          ),
        ],
      );
      await openPractice(tester, repository);

      await tester.enterText(find.byType(TextFormField).first, '主体性');
      await tester.pump();

      await tester.tap(find.text('下一题'));
      await tester.pump();
      await tester.pump();

      // 换题后是一个新空，不带着上一题的文本。
      expect(find.byType(TextFormField), findsOneWidget);
      expect(
        tester
            .widget<TextFormField>(find.byType(TextFormField).first)
            .controller
            ?.text,
        isEmpty,
      );

      await tester.tap(find.text('上一题'));
      await tester.pump();
      await tester.pump();

      // 回到上一题：两个空都在，第一空还带着填过的文本。
      expect(find.byType(TextFormField), findsNWidgets(2));
      expect(
        tester
            .widget<TextFormField>(find.byType(TextFormField).first)
            .controller
            ?.text,
        '主体性',
      );
      expectNoLayoutError(tester);
    });
  });
}
