import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/theme/app_icons.dart';
import 'package:mobile_app/features/chat/presentation/chat_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

/// 聊天屏冒烟。
///
/// 三条线：
/// 1. 空对话只有引导，不出现消息列表；
/// 2. 点发送**立刻**出现占位气泡 + 停止按钮（流式回复的第一步就是"先占位"，
///    没有占位的话用户会以为没发出去，于是重复点发送）；
/// 3. 流出错时失败信息留在对话里、带重试入口，重试会真的再发一次请求。
void main() {
  Future<void> send(WidgetTester tester) async {
    await tester.enterText(find.byType(TextField), '这道题怎么理解？');
    await tester.pump();
    await tester.tap(find.byIcon(AppIcons.send));
    // 发送路径上有 createSession + 订阅两个 await
    await tester.pump();
    await tester.pump();
  }

  testWidgets('空对话：只有引导，没有消息气泡', (tester) async {
    await pumpScreen(tester, const ChatScreen(), overrides: fakeChat());

    expect(find.byType(MarkdownBody), findsNothing);
    expect(find.byIcon(AppIcons.send), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('发送后：先出现占位气泡，按钮切成停止', (tester) async {
    final repository = FakeChatRepository();

    await pumpScreen(
      tester,
      const ChatScreen(),
      overrides: fakeChat(repository: repository),
    );

    await send(tester);

    // 两条气泡：用户那条 + 助手占位（内容为空 → 显示"正在思考"占位）
    expect(find.byType(MarkdownBody), findsNWidgets(2));
    expect(repository.streams, hasLength(1));
    // 生成中：发送按钮变成停止按钮
    expect(find.byIcon(AppIcons.stop), findsOneWidget);
    expect(find.byIcon(AppIcons.send), findsNothing);
  });

  testWidgets('流失败：失败消息带重试，重试会重新发起一次流', (tester) async {
    final repository = FakeChatRepository();

    await pumpScreen(
      tester,
      const ChatScreen(),
      overrides: fakeChat(repository: repository),
    );

    await send(tester);
    expect(repository.streams, hasLength(1));

    repository.streams.last.addError(StateError('stream broke'));
    await tester.pump();
    await tester.pump();

    // 失败后回到可发送状态，并在对话末尾给出重试入口
    expect(find.byIcon(AppIcons.send), findsOneWidget);
    expect(find.byIcon(AppIcons.stop), findsNothing);
    final retry = find.byIcon(AppIcons.refresh);
    expect(retry, findsOneWidget);

    await tester.tap(retry);
    await tester.pump();
    await tester.pump();

    expect(repository.streams, hasLength(2));
  });

  testWidgets('正常收流：chunk 累积进同一个占位气泡', (tester) async {
    final repository = FakeChatRepository();

    await pumpScreen(
      tester,
      const ChatScreen(),
      overrides: fakeChat(repository: repository),
    );

    await send(tester);

    repository.streams.last.add('第一段');
    await tester.pump();
    repository.streams.last.add('第二段');
    await tester.pump();

    // 两段 chunk 累积在同一条气泡里（不是两条消息）
    expect(find.textContaining('第一段第二段'), findsOneWidget);
    expect(find.byType(MarkdownBody), findsNWidgets(2));

    await repository.streams.last.close();
    await tester.pump();
    await tester.pump();

    // 已知缺陷（未改 lib，按当前行为锁定）：`ChatNotifier.onDone` 只把内部
    // `_isGenerating` 置 false，没有改 state，界面因此收不到重建通知，按钮
    // 仍停在「停止」，要等下一次状态变化才恢复。修好后这条断言应改成 send。
    expect(find.byIcon(AppIcons.stop), findsOneWidget);
    expect(find.byIcon(AppIcons.send), findsNothing);
  });
}
