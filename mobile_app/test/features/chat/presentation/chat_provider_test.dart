import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/auth/data/auth_repository_impl.dart';
import 'package:mobile_app/features/auth/domain/auth_repository.dart';
import 'package:mobile_app/features/auth/presentation/auth_provider.dart';
import 'package:mobile_app/features/chat/data/chat_repository_impl.dart';
import 'package:mobile_app/features/chat/domain/chat_message.dart';
import 'package:mobile_app/features/chat/domain/chat_repository.dart';
import 'package:mobile_app/features/chat/presentation/chat_provider.dart';

/// 这个测试守的是聊天的**状态机**和**错误可见性**几条线：
///
/// 1. **占位消息的生命周期**：发送时先插一条空 assistant 占位，流式 chunk
///    累积到这条占位里（按 id 定位，不是「永远改最后一条」）；结束后占位里
///    必须是完整回复。占位在请求载荷里必须被排除——把空占位发给后端会让
///    模型把「空的 assistant 轮次」当成上下文。
/// 2. **失败必须落到界面上**：聊天失败不是抛 AsyncError，而是把占位消息改成
///    「⚠️ 消息发送失败，请点击重试」并记住原文（`lastFailedMessage`），
///    这样用户能看见失败并一键重试。这里钉住这两种表达方式，防止有人把它
///    「优化」成静默 catch 或者弹全局报错。
/// 3. **重试重发同一份内容**：`retryLastMessage` 必须先摘掉那条 ⚠️ 占位，
///    再用**同样的文本和同样的 RAG 开关**重发，并且**不再追加一条用户消息**
///    （那条已经在列表里；重复追加会让同一问题变成两轮用户发言，还会把重复
///    轮次发给模型）。
/// 4. **停止生成真的停止**：`stopGeneration` 之后迟到的 chunk 不许再改状态；
///    连续两次发送时，第一次的流也不能污染第二次的消息与生成标志。
/// 5. **账号隔离**：账号状态变化（登录/登出）后旧对话、会话 ID 与失败记录必须
///    清空，避免 A 的对话出现在 B 的界面上。
class FakeChatRepository implements ChatRepository {
  /// 每次 `sendMessageStream` 收到的消息批次（用于断言上下文内容）。
  final List<List<Map<String, dynamic>>> sentBatches = [];
  final List<String?> sessionIds = [];
  final List<bool> ragFlags = [];

  /// 每次 `sendMessageStream` 返回的流控制器，测试里手动 add / addError / close。
  final List<StreamController<String>> streams = [];

  int createSessionCalls = 0;
  String? lastSessionTitle;
  String createSessionId = 'session_1';
  Object? createSessionError;

  List<ChatMessage> sessionMessages = [];
  Object? sessionMessagesError;
  final List<String> loadedSessionIds = [];

  List<Map<String, dynamic>> sessions = [];
  Object? sessionsError;

  /// 为 true 时 `sendMessageStream` 返回 [LateCallbackStream]（回调可手动触发，
  /// 且取消后仍然能触发），用来复现「取消是异步的、旧流回调仍在跑」的竞态。
  bool useLateCallbackStreams = false;
  final List<LateCallbackStream> lateStreams = [];

  @override
  Stream<String> sendMessageStream(
    List<Map<String, dynamic>> messages, {
    bool enableRag = false,
    String? sessionId,
  }) {
    sentBatches.add(messages);
    ragFlags.add(enableRag);
    sessionIds.add(sessionId);
    if (useLateCallbackStreams) {
      final lateStream = LateCallbackStream();
      lateStreams.add(lateStream);
      return lateStream;
    }
    final controller = StreamController<String>();
    streams.add(controller);
    return controller.stream;
  }

  @override
  Future<Map<String, dynamic>> createSession({String? title}) async {
    createSessionCalls++;
    lastSessionTitle = title;
    final error = createSessionError;
    if (error != null) throw error;
    return <String, dynamic>{'sessionId': createSessionId};
  }

  @override
  Future<List<ChatMessage>> getSessionMessages(String sessionId) async {
    loadedSessionIds.add(sessionId);
    final error = sessionMessagesError;
    if (error != null) throw error;
    return sessionMessages;
  }

  @override
  Future<List<Map<String, dynamic>>> getSessions({int limit = 20}) async {
    final error = sessionsError;
    if (error != null) throw error;
    return sessions;
  }

  @override
  Future<void> deleteSession(String sessionId) async {}

  void dispose() {
    for (final stream in streams) {
      if (!stream.isClosed) {
        stream.close();
      }
    }
  }
}

/// 故意**不**阻断取消的流：`cancel()` 立即返回但之后仍然会把回调打给监听方。
///
/// 真实的流取消是异步的：已经排进事件队列的 chunk / onDone 仍会跑到回调里。
/// 用普通 `StreamController` 测不到这条路径（cancel 同步摘掉监听，之后再 add
/// 根本不会触发），所以这里手动持有回调，由用例显式制造「迟到回调」。
class LateCallbackStream extends Stream<String> {
  void Function(String data)? _onData;
  Function? _onError;
  void Function()? _onDone;

  void emitData(String data) => _onData?.call(data);

  void emitError(Object error, [StackTrace? stack]) {
    final handler = _onError;
    if (handler is void Function(Object, StackTrace)) {
      handler(error, stack ?? StackTrace.current);
    } else if (handler is void Function(Object)) {
      handler(error);
    }
  }

  void emitDone() => _onDone?.call();

  @override
  StreamSubscription<String> listen(
    void Function(String data)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    _onData = onData;
    _onError = onError;
    _onDone = onDone;
    return _LateCallbackSubscription();
  }
}

class _LateCallbackSubscription implements StreamSubscription<String> {
  @override
  Future<void> cancel() async {}

  @override
  void onData(void Function(String data)? handleData) {}

  @override
  void onError(Function? handleError) {}

  @override
  void onDone(void Function()? handleDone) {}

  @override
  void pause([Future<void>? resumeSignal]) {}

  @override
  void resume() {}

  @override
  bool get isPaused => false;

  @override
  Future<E> asFuture<E>([E? futureValue]) => Completer<E>().future;
}

/// 只让「登出」能跑通的最小仓库：`AuthController.logout` 会读它。
///
/// 这里刻意走**真实**的 `AuthController.logout()`（而不是手写一个假的版本号
/// 自增），否则测试就绕开了「登出必须 bump 版本号」这条待验证的行为。
class _FakeAuthRepository implements AuthRepository {
  int logoutCalls = 0;

  @override
  Future<void> login(String username, String password) async {}

  @override
  Future<void> register(String username, String password) async {}

  @override
  Future<String?> getToken() async => null;

  @override
  Future<void> logout() async {
    logoutCalls++;
  }
}

void main() {
  late FakeChatRepository repository;
  late _FakeAuthRepository authRepository;

  setUp(() {
    repository = FakeChatRepository();
    authRepository = _FakeAuthRepository();
  });

  tearDown(() => repository.dispose());

  ProviderContainer makeContainer() {
    // 关掉 Riverpod 3 的失败自动重试：默认会指数退避重试，让「失败一次」的断言
    // 变成「失败很多次、且 provider 一直挂在 AsyncLoading（带 error）」。
    final container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        chatRepositoryProvider.overrideWithValue(repository),
        authRepositoryProvider.overrideWithValue(authRepository),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  /// 发送消息并把流跑完，返回 notifier，便于断言状态。
  Future<ChatNotifier> sendAndFinish(
    ProviderContainer container,
    String text, {
    bool enableRag = false,
    List<String> chunks = const ['好的'],
  }) async {
    final notifier = container.read(chatProvider.notifier);
    final future = notifier.sendMessage(text, enableRag: enableRag);
    await pumpEventQueue();
    final stream = repository.streams.last;
    for (final chunk in chunks) {
      stream.add(chunk);
    }
    await pumpEventQueue();
    await stream.close();
    await future;
    return notifier;
  }

  group('初始状态', () {
    test('初始为空的已加载状态，未生成、无会话 ID、无失败消息', () {
      final container = makeContainer();

      final state = container.read(chatProvider);

      expect(state, isA<AsyncData<List<ChatMessage>>>());
      expect(state.value, isEmpty);
      final notifier = container.read(chatProvider.notifier);
      expect(notifier.isGenerating, isFalse);
      expect(notifier.currentSessionId, isNull);
      expect(notifier.lastFailedMessage, isNull);
      expect(repository.sentBatches, isEmpty);
    });
  });

  group('发送消息成功路径', () {
    test('先插用户消息与空 assistant 占位，chunk 累积进占位而不是追加新消息', () async {
      final container = makeContainer();
      final notifier = container.read(chatProvider.notifier);

      final future = notifier.sendMessage('什么是教育目的');
      await pumpEventQueue();

      // 请求已发出前的本地状态：用户消息 + 占位
      final beforeChunks = container.read(chatProvider).value!;
      expect(beforeChunks.length, 2);
      expect(beforeChunks[0].role, 'user');
      expect(beforeChunks[0].content, '什么是教育目的');
      expect(beforeChunks[1].role, 'assistant');
      expect(beforeChunks[1].content, isEmpty);
      expect(notifier.isGenerating, isTrue);

      repository.streams.single.add('教育');
      await pumpEventQueue();
      repository.streams.single.add('目的');
      await pumpEventQueue();
      expect(container.read(chatProvider).value!.length, 2);
      expect(container.read(chatProvider).value![1].content, '教育目的');

      await repository.streams.single.close();
      await future;

      final messages = container.read(chatProvider).value!;
      expect(messages.length, 2, reason: '流式回复必须原地累积，不能每条 chunk 新增一条消息');
      expect(messages[1].content, '教育目的');
      expect(notifier.isGenerating, isFalse);
    });

    test('无会话时先建会话，标题取前 10 个字，并把 sessionId 带回状态', () async {
      final container = makeContainer();
      final notifier = container.read(chatProvider.notifier);

      await sendAndFinish(container, '一二三四五六七八九十十一', chunks: ['答']);

      expect(repository.createSessionCalls, 1);
      expect(repository.lastSessionTitle, '一二三四五六七八九十', reason: '超过 10 字必须截断');

      expect(notifier.currentSessionId, 'session_1');
      expect(
        repository.sessionIds.single,
        'session_1',
        reason: '建会话后必须把 sessionId 带给流式请求',
      );
    });

    test('短消息标题不截断', () async {
      final container = makeContainer();

      await sendAndFinish(container, '短标题');

      expect(repository.lastSessionTitle, '短标题');
    });

    test('已有会话时不再重复建会话，并沿用同一 sessionId', () async {
      final container = makeContainer();

      await sendAndFinish(container, '第一问', chunks: ['一']);
      await sendAndFinish(container, '第二问', chunks: ['二']);

      expect(repository.createSessionCalls, 1, reason: '同一会话内只应建一次');
      expect(repository.sessionIds, ['session_1', 'session_1']);
      expect(container.read(chatProvider).value!.length, 4);
    });

    test('请求载荷排除空占位，只带已有轮次', () async {
      final container = makeContainer();

      await sendAndFinish(container, '你好', chunks: ['嗨']);

      final batch = repository.sentBatches.single;
      expect(batch.length, 1, reason: '空 assistant 占位绝不能发给后端当上下文');
      expect(batch.single, {'role': 'user', 'content': '你好'});
    });

    test('enableRag 原样透传给仓库', () async {
      final container = makeContainer();

      await sendAndFinish(container, '带知识库的问题', enableRag: true, chunks: ['答']);

      expect(repository.ragFlags.single, isTrue);
    });
  });

  group('失败必须可见（不得静默）', () {
    test('建会话失败：占位改成可重试文案，记住原文，状态仍是 AsyncData', () async {
      repository.createSessionError = Exception('建会话挂了');
      final container = makeContainer();
      final notifier = container.read(chatProvider.notifier);

      await notifier.sendMessage('会失败的问题');

      final state = container.read(chatProvider);
      expect(
        state,
        isA<AsyncData<List<ChatMessage>>>(),
        reason: '发送失败用消息内联表达，不是 AsyncError',
      );
      expect(state.value!.last.content, '⚠️ 消息发送失败，请点击重试');
      expect(notifier.lastFailedMessage, '会失败的问题');
      expect(notifier.isGenerating, isFalse);
    });

    test('流式出错：占位改成可重试文案，并丢弃已生成的半截内容', () async {
      final container = makeContainer();
      final notifier = container.read(chatProvider.notifier);

      final future = notifier.sendMessage('流会出错');
      await pumpEventQueue();
      repository.streams.single.add('半截');
      await pumpEventQueue();
      repository.streams.single.addError(StateError('流断了'));
      await future;

      final state = container.read(chatProvider);
      expect(
        state.value!.last.content,
        '⚠️ 消息发送失败，请点击重试',
        reason: '半截内容不能冒充完整回复',
      );
      expect(notifier.lastFailedMessage, '流会出错');
      expect(notifier.isGenerating, isFalse);
    });

    test('失败后状态里没有「成功的空回复」冒充', () async {
      final container = makeContainer();
      repository.createSessionError = Exception('挂了');
      final notifier = container.read(chatProvider.notifier);

      await notifier.sendMessage('x');

      final assistant = container.read(chatProvider).value!.last;
      expect(
        assistant.content,
        isNotEmpty,
        reason: '空内容会被用户当成「AI 没说话」，必须留失败提示',
      );
    });
  });

  group('重试', () {
    test('重试摘掉 ⚠️ 占位，用相同文本与相同 RAG 开关重发，且不重复追加用户消息', () async {
      final container = makeContainer();
      final notifier = container.read(chatProvider.notifier);

      final first = notifier.sendMessage('原问题', enableRag: true);
      await pumpEventQueue();
      repository.streams.single.addError(StateError('断了'));
      await first;
      expect(notifier.lastFailedMessage, '原问题');

      final retry = notifier.retryLastMessage();
      await pumpEventQueue();

      // ⚠️ 占位必须被摘掉（不能把失败气泡当上下文发出去）
      final retryBatch = repository.sentBatches[1];
      expect(
        retryBatch.any((m) => (m['content'] as String).startsWith('⚠️')),
        isFalse,
      );
      // 那条用户消息已经在列表里，重试不能再补一条同样的轮次。
      expect(retryBatch.length, 1, reason: '重试不得重复追加用户消息');
      expect(retryBatch.single, {'role': 'user', 'content': '原问题'});
      expect(repository.ragFlags[1], isTrue, reason: '重试不能悄悄降级 RAG');

      // 重试进行中：界面上仍是「一条用户消息 + 一条新的空占位」
      final duringRetry = container.read(chatProvider).value!;
      expect(duringRetry.length, 2);
      expect(duringRetry.where((m) => m.role == 'user').length, 1);
      expect(duringRetry.where((m) => m.role == 'assistant').length, 1);
      expect(duringRetry.last.content, isEmpty);

      repository.streams.last.add('这次好了');
      await pumpEventQueue();
      await repository.streams.last.close();
      await retry;

      final messages = container.read(chatProvider).value!;
      expect(messages.length, 2, reason: '⚠️ 占位被摘掉、只补一条新占位，不能再多出一条用户消息');
      expect(messages.map((m) => m.role), ['user', 'assistant']);
      expect(messages.first.content, '原问题', reason: '重试后用户文本必须与首次发送一致');
      expect(
        messages.where((m) => m.role == 'user').length,
        1,
        reason: '同一问题只能有一轮用户发言',
      );
      expect(
        messages.where((m) => m.role == 'assistant').length,
        1,
        reason: '占位只能有一条',
      );
      expect(messages.last.content, '这次好了');
      expect(notifier.lastFailedMessage, isNull, reason: '成功后不能还留着失败原文');
    });

    test('没有失败消息时重试是空操作', () async {
      final container = makeContainer();
      final notifier = container.read(chatProvider.notifier);

      await notifier.retryLastMessage();

      expect(repository.sentBatches, isEmpty);
      expect(repository.createSessionCalls, 0);
      expect(container.read(chatProvider).value, isEmpty);
    });
  });

  group('停止生成', () {
    test('stopGeneration 之后迟到的 chunk 不再改状态', () async {
      final container = makeContainer();
      final notifier = container.read(chatProvider.notifier);

      unawaited(notifier.sendMessage('会被中断'));
      await pumpEventQueue();
      final stream = repository.streams.single;
      stream.add('前半段');
      await pumpEventQueue();

      notifier.stopGeneration();
      expect(notifier.isGenerating, isFalse);

      stream.add('迟到内容');
      await pumpEventQueue();

      expect(
        container.read(chatProvider).value!.last.content,
        '前半段',
        reason: '取消订阅后仍在监听旧流会让界面在「已停止」后继续长文本',
      );
      await stream.close();
    });

    test('连续两次 sendMessage：第一次流的迟到回调不污染第二次', () async {
      repository.useLateCallbackStreams = true;
      final container = makeContainer();
      final notifier = container.read(chatProvider.notifier);

      final first = notifier.sendMessage('第一问');
      await pumpEventQueue();
      final firstStream = repository.lateStreams.single;
      firstStream.emitData('第一答');
      await pumpEventQueue();

      final second = notifier.sendMessage('第二问');
      await pumpEventQueue();
      expect(repository.lateStreams, hasLength(2));
      final secondStream = repository.lateStreams.last;

      // 第一次的流已被取代，但它的回调仍然会被触发（取消是异步的）：
      // 迟到 chunk 与旧流的 onDone 都不能动第二次的状态。
      firstStream.emitData('迟到的第一答');
      await pumpEventQueue();
      firstStream.emitDone();
      await pumpEventQueue();
      // 被取代的那次发送必须正常返回，不能永远挂在 completer 上
      await first;

      final during = container.read(chatProvider).value!;
      expect(during.last.content, isEmpty, reason: '第二次的占位不能被第一次的迟到内容填上');
      expect(notifier.isGenerating, isTrue, reason: '旧流的 onDone 不能把第二次的生成标志清掉');

      secondStream.emitData('第二答');
      await pumpEventQueue();
      secondStream.emitDone();
      await second;

      final messages = container.read(chatProvider).value!;
      expect(messages.map((m) => m.role), [
        'user',
        'assistant',
        'user',
        'assistant',
      ]);
      expect(messages[1].content, '第一答', reason: '第一次的占位只保留它自己的内容');
      expect(messages[3].content, '第二答');
      expect(notifier.isGenerating, isFalse);
      expect(
        repository.sentBatches.last.map((m) => m['content']),
        ['第一问', '第一答', '第二问'],
        reason: '第二次请求的上下文不能出现重复轮次',
      );
    });
  });

  group('会话切换与加载', () {
    test('loadSession 成功：替换消息列表并记住会话 ID', () async {
      repository.sessionMessages = [
        ChatMessage.fromJson({'id': 1, 'role': 'user', 'content': '旧问题'}),
        ChatMessage.fromJson({'id': 2, 'role': 'assistant', 'content': '旧回答'}),
      ];
      final container = makeContainer();
      final notifier = container.read(chatProvider.notifier);

      await notifier.loadSession('sess_9');

      expect(repository.loadedSessionIds, ['sess_9']);
      expect(notifier.currentSessionId, 'sess_9');
      final messages = container.read(chatProvider).value!;
      expect(messages.length, 2);
      expect(messages.first.content, '旧问题');
    });

    test('loadSession 失败：进入 AsyncError 并给出可读文案（不冒充空会话）', () async {
      repository.sessionMessagesError = Exception('404');
      final container = makeContainer();
      final notifier = container.read(chatProvider.notifier);

      await notifier.loadSession('sess_missing');

      final state = container.read(chatProvider);
      expect(state, isA<AsyncError<List<ChatMessage>>>());
      expect(state.error, '加载失败，请检查网络后重试');
      expect(notifier.currentSessionId, isNull);
    });

    test('createNewSession 清空消息、会话 ID 与失败记录', () async {
      final container = makeContainer();
      final notifier = container.read(chatProvider.notifier);
      await sendAndFinish(container, '一轮对话', chunks: ['回答']);
      expect(notifier.currentSessionId, isNotNull);

      await notifier.createNewSession();

      expect(container.read(chatProvider).value, isEmpty);
      expect(notifier.currentSessionId, isNull);
      expect(notifier.lastFailedMessage, isNull);
    });

    test('chatSessionsProvider 失败是 AsyncError，不是空列表', () async {
      repository.sessionsError = Exception('500');
      final container = makeContainer();
      // autoDispose：先订阅住，否则 read 完立刻被回收，future 会因「dispose 时未完成」报错
      final sub = container.listen(chatSessionsProvider, (_, _) {});
      addTearDown(sub.close);

      await expectLater(
        container.read(chatSessionsProvider.future),
        throwsA(isA<Exception>()),
      );
      expect(container.read(chatSessionsProvider), isA<AsyncError>());
    });

    test('chatSessionsProvider 成功解析会话列表', () async {
      repository.sessions = [
        {'sessionId': 's1', 'title': '会话一'},
      ];
      final container = makeContainer();
      final sub = container.listen(chatSessionsProvider, (_, _) {});
      addTearDown(sub.close);

      final sessions = await container.read(chatSessionsProvider.future);

      expect(sessions.single['sessionId'], 's1');
    });
  });

  group('账号隔离', () {
    test('登出后清空对话与会话 ID', () async {
      final container = makeContainer();
      await sendAndFinish(container, 'A 账号的对话', chunks: ['A 的回复']);
      final notifier = container.read(chatProvider.notifier);
      expect(notifier.currentSessionId, 'session_1');
      expect(container.read(chatProvider).value, hasLength(2));

      // 登出只把 `authControllerProvider` 写成 `AsyncData(null)`（与旧值相等，
      // 不通知），chat 侧靠 logout 一并 bump 的版本号感知到这次变化。
      await container.read(authControllerProvider.notifier).logout();
      await pumpEventQueue();
      expect(authRepository.logoutCalls, 1);

      expect(container.read(chatProvider).value, isEmpty);
      expect(notifier.currentSessionId, isNull);
      expect(notifier.lastFailedMessage, isNull);
      expect(notifier.isGenerating, isFalse);
    });

    test('登出时在途流被取消：迟到内容不会写进（已清空的）界面', () async {
      final container = makeContainer();
      final notifier = container.read(chatProvider.notifier);

      unawaited(notifier.sendMessage('A 的提问'));
      await pumpEventQueue();
      final stream = repository.streams.single;
      stream.add('A 的回答');
      await pumpEventQueue();

      await container.read(authControllerProvider.notifier).logout();
      await pumpEventQueue();

      stream.add('迟到的 A 的回答');
      await pumpEventQueue();

      expect(container.read(chatProvider).value, isEmpty);
      expect(notifier.currentSessionId, isNull);
      expect(notifier.isGenerating, isFalse);
      unawaited(stream.close());
    });
  });
}
