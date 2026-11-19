import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/features/chat/presentation/chat_screen.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/presentation/practice_screen.dart';
import 'package:mobile_app/features/settings/presentation/settings_screen.dart';
import 'package:mobile_app/features/wrong_book/domain/wrong_question.dart';
import 'package:mobile_app/features/wrong_book/presentation/wrong_book_screen.dart';

import '../../support/fake_network_images.dart';
import '../../support/fake_providers.dart';
import '../../support/pump_screen.dart';

/// 溢出专项：长文本 + 1.3 倍字号（+ 真有输入框的屏再叠键盘）。
///
/// 为什么键盘只给聊天/设置：`viewInsets` 会把 body 压掉近一半，而这两屏
/// **真的会**弹输入法。练习/错题本没有输入框，给它们塞键盘等于测一个不会发生
/// 的场景——而且会撞上 `AppEmptyView` 不滚动的已知限制（见文末说明），把信号
/// 变成噪音。
///
/// 判定只有一条：`tester.takeException()` 必须为 null（RenderFlex overflow
/// 会以 FlutterError 的形式落到这里）。
///
/// 已知限制（未改 lib）：`AppEmptyView` 是 `Center` + `Column`，没有滚动容器。
/// 当它被塞进一个很矮的区域（键盘弹起 / 极短屏）时会溢出。它被用作「空态」的
/// 统一出口，正常场景下占满整屏，所以这次只把「放大字号」这一条钉住。
void main() {
  setUpAll(useFakeSecureStorage);
  setUpAll(useFakeNetworkImages);

  const longText =
      '这是一道刻意写得很长的题干，用来在窄屏与放大字号下把布局撑到极限：'
      '下列说法中，符合教育心理学关于学习迁移基本原理的是哪一项？'
      '请结合材料中的三个案例逐一判断，并说明理由。';
  const longOption = '选项正文也写得很长，模拟题库里那种一段话式的选项，验证换行后卡片高度会自己长高而不会溢出';

  testWidgets('练习屏：长题干 + 长选项 + 1.3 倍字号 + 键盘不溢出', (tester) async {
    final repository = FakePracticeRepository(
      questions: <Question>[
        fakeQuestion(
          content: longText,
          options: const <String>[
            longOption,
            longOption,
            longOption,
            longOption,
          ],
        ),
      ],
    );

    await pumpScreen(
      tester,
      const PracticeScreen(),
      overrides: fakePractice(repository: repository),
      textScale: 1.3,
      viewInsetsBottom: 300,
    );
    await tester.pump();
    await tester.pump();

    expectNoLayoutError(tester);
  });

  testWidgets('错题本：长题干 + 1.3 倍字号不溢出', (tester) async {
    await pumpScreen(
      tester,
      const WrongBookScreen(),
      overrides: fakeWrongBook(
        questions: <WrongQuestion>[
          fakeWrongQuestion(questionId: '1', content: longText),
          fakeWrongQuestion(questionId: '2', content: longText),
        ],
      ),
      textScale: 1.3,
    );
    await tester.pump();

    expectNoLayoutError(tester);
  });

  testWidgets('聊天屏：1.3 倍字号 + 键盘（真有输入框的屏）不溢出', (tester) async {
    await pumpScreen(
      tester,
      const ChatScreen(),
      overrides: fakeChat(),
      textScale: 1.3,
      viewInsetsBottom: 300,
    );
    await tester.pump();

    expectNoLayoutError(tester);
  });

  testWidgets('设置屏：1.3 倍字号 + 键盘（服务器地址输入框）不溢出', (tester) async {
    await pumpScreen(
      tester,
      const SettingsScreen(),
      overrides: fakeSettings(),
      textScale: 1.3,
      viewInsetsBottom: 300,
    );
    await tester.pump();
    await tester.pump();

    expectNoLayoutError(tester);
  });
}
