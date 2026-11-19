import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/network/connectivity_provider.dart';
import 'package:mobile_app/core/theme/app_icons.dart';
import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/features/chat/data/chat_repository_impl.dart';
import 'package:mobile_app/features/chat/domain/chat_message.dart';
import 'package:mobile_app/features/chat/domain/chat_repository.dart';
import 'package:mobile_app/features/chat/presentation/chat_provider.dart';
import 'package:mobile_app/features/chat/presentation/chat_screen.dart';

/// 聊天发送的离线拦截（审计 #20 方案 A）。
///
/// 为什么要在**发送前**拦：`sendMessage` 的第一件事就是往列表里插一条空的
/// assistant 占位。断网时它只会停在那里（或者变成一句 ⚠️），用户看到的是
/// 「发了但没反应」。所以离线时直接不发，只给一句「联网后才能发送」。
///
/// 守的线：
/// 1. 离线点发送：不产生任何消息（不出现空占位）、给出明确提示；
/// 2. 恢复在线：同一条路径立刻可用，不需要重建页面。
class _FakeChatRepository implements ChatRepository {
  final List<List<Map<String, dynamic>>> sentBatches = [];

  @override
  Stream<String> sendMessageStream(
    List<Map<String, dynamic>> messages, {
    bool enableRag = false,
    String? sessionId,
  }) {
    sentBatches.add(messages);
    return Stream<String>.fromIterable(<String>['这是回答']);
  }

  @override
  Future<Map<String, dynamic>> createSession({String? title}) async {
    return <String, dynamic>{'sessionId': 'session_1'};
  }

  @override
  Future<List<Map<String, dynamic>>> getSessions({int limit = 20}) async {
    return <Map<String, dynamic>>[];
  }

  @override
  Future<List<ChatMessage>> getSessionMessages(String sessionId) async {
    return <ChatMessage>[];
  }

  @override
  Future<void> deleteSession(String sessionId) async {}
}

void main() {
  late StreamController<List<ConnectivityResult>> connectivity;
  late _FakeChatRepository repository;
  late ProviderContainer container;

  setUp(() {
    connectivity = StreamController<List<ConnectivityResult>>.broadcast();
    repository = _FakeChatRepository();
    container = ProviderContainer(
      overrides: [
        connectivityChangesProvider.overrideWithValue(connectivity.stream),
        chatRepositoryProvider.overrideWithValue(repository),
        chatSessionsProvider.overrideWith(
          (ref) async => <Map<String, dynamic>>[],
        ),
      ],
    );
    addTearDown(container.dispose);
  });

  tearDown(() async {
    await connectivity.close();
  });

  Widget harness() {
    return UncontrolledProviderScope(
      container: container,
      child: ScreenUtilInit(
        designSize: const Size(390, 884),
        minTextAdapt: true,
        splitScreenMode: true,
        builder: (context, _) =>
            MaterialApp(theme: AppTheme.lightTheme, home: const ChatScreen()),
      ),
    );
  }

  Future<void> goOffline(WidgetTester tester) async {
    connectivity.add(<ConnectivityResult>[ConnectivityResult.none]);
    await tester.pumpAndSettle();
  }

  Future<void> goOnline(WidgetTester tester) async {
    connectivity.add(<ConnectivityResult>[ConnectivityResult.wifi]);
    await tester.pumpAndSettle();
  }

  testWidgets('离线：点发送不产生空占位，给出明确文案', (tester) async {
    await tester.pumpWidget(harness());
    await tester.pumpAndSettle();
    await goOffline(tester);

    expect(find.text('当前离线，发送已暂停，联网后自动恢复'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '这道题怎么理解？');
    await tester.tap(find.byIcon(AppIcons.send));
    await tester.pump();

    expect(
      repository.sentBatches,
      isEmpty,
      reason: '离线不该发起请求，否则只会留下一条永远转不出来的占位',
    );
    expect(
      container.read(chatProvider).value,
      isEmpty,
      reason: '不产生任何消息（连空占位都不该出现）',
    );
    expect(find.text('当前离线，联网后才能发送消息'), findsOneWidget);
    expect(find.text('你好，我是你的 AI 学习助手'), findsOneWidget, reason: '仍停在空态');
  });

  testWidgets('恢复在线：同一页面立刻能发出去', (tester) async {
    await tester.pumpWidget(harness());
    await tester.pumpAndSettle();
    await goOffline(tester);

    await tester.enterText(find.byType(TextField), '这道题怎么理解？');
    await tester.tap(find.byIcon(AppIcons.send));
    await tester.pump();
    expect(repository.sentBatches, isEmpty);

    // 离线提示是 SnackBar，正好压在输入区上方：显式关掉它再点第二次，
    // 否则点击会被它挡住（tap 会 warnIfMissed）。
    ScaffoldMessenger.of(
      tester.element(find.byType(TextField)),
    ).hideCurrentSnackBar();
    await tester.pumpAndSettle();

    await goOnline(tester);
    expect(find.text('当前离线，发送已暂停，联网后自动恢复'), findsNothing);

    await tester.tap(find.byIcon(AppIcons.send));
    await tester.pumpAndSettle();

    expect(repository.sentBatches, hasLength(1));
    expect(find.text('这道题怎么理解？'), findsOneWidget);
    expect(find.text('这是回答'), findsOneWidget);
  });
}
