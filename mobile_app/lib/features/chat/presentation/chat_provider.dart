import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/auth/auth_epoch.dart';
import '../domain/chat_message.dart';
import '../data/chat_repository_impl.dart';

final chatProvider = AsyncNotifierProvider<ChatNotifier, List<ChatMessage>>(() {
  return ChatNotifier();
});

final chatSessionsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
      final repo = ref.watch(chatRepositoryProvider);
      return await repo.getSessions();
    });

class ChatNotifier extends AsyncNotifier<List<ChatMessage>> {
  String? _currentSessionId;
  StreamSubscription<String>? _streamSubscription;

  /// 在途 `sendMessage` 的完成信号：取消流时必须一并完成，否则那次
  /// `sendMessage` 的 future 会永远挂着（调用方 await 不到结果）。
  Completer<void>? _pendingCompleter;

  /// 生成令牌：每次发送/停止/清空/账号切换都自增。旧流的迟到回调凭它
  /// 判定自己已失效，从而不再写状态、也不清别人的订阅句柄与生成标志。
  int _generation = 0;

  /// 是否正在生成 AI 回复
  bool _isGenerating = false;
  bool get isGenerating => _isGenerating;

  /// 上次发送失败的消息文本（用于重试）
  String? _lastFailedMessage;
  String? get lastFailedMessage => _lastFailedMessage;

  /// 上次发送是否启用了 RAG（重试时需要）
  bool _lastEnableRag = false;

  String? get currentSessionId => _currentSessionId;

  @override
  FutureOr<List<ChatMessage>> build() {
    // 账号切换（登录/登出）必须清空上一位用户的对话与在途流：否则 A 的对话
    // 会出现在 B 的界面上，A 那条还没结束的流还会把 chunk 写进 B 的列表。
    // 登出/换账号即重建；watch 的是版本号而不是 authControllerProvider——
    // 后者的 state 是 void，登出写入的 AsyncData(null) 与旧值相等，不会通知。
    ref.watch(authEpochProvider);
    _abortActiveStream();
    _currentSessionId = null;
    _lastFailedMessage = null;
    return [];
  }

  /// 让在途流及其回调全部失效：令牌自增、取消订阅、完成挂起的发送、
  /// 复位生成标志。不动 `state`（由调用方决定新的状态）。
  void _abortActiveStream() {
    _generation++;
    final subscription = _streamSubscription;
    _streamSubscription = null;
    if (subscription != null) {
      unawaited(subscription.cancel());
    }
    final pending = _pendingCompleter;
    _pendingCompleter = null;
    if (pending != null && !pending.isCompleted) {
      pending.complete();
    }
    _isGenerating = false;
  }

  void clearMessages() {
    _abortActiveStream();
    _currentSessionId = null;
    _lastFailedMessage = null;
    state = const AsyncData([]);
  }

  Future<void> createNewSession() async {
    clearMessages();
  }

  Future<void> loadSession(String sessionId) async {
    stopGeneration();
    state = const AsyncLoading();
    try {
      final repo = ref.read(chatRepositoryProvider);
      final messages = await repo.getSessionMessages(sessionId);
      _currentSessionId = sessionId;
      _lastFailedMessage = null;
      state = AsyncData(messages);
    } catch (e) {
      debugPrint('加载会话失败: $e');
      state = AsyncError('加载失败，请检查网络后重试', StackTrace.current);
    }
  }

  /// 停止当前正在进行的 AI 生成
  void stopGeneration() {
    // 先让令牌失效再取消订阅：即便有回调已经在事件队列里排队，也会被令牌挡掉。
    _abortActiveStream();
    // 与 onDone 同理：不发布状态的话，按钮会停在「停止生成」。
    _publishGenerationStopped();
  }

  /// 生成结束后让界面重建一次（消息内容不变，只是把 `_isGenerating` 的变化
  /// 通过 state 传播出去）。用新列表实例触发通知，避免依赖内容判等。
  void _publishGenerationStopped() {
    final latest = state.value;
    if (latest == null) return;
    state = AsyncData(List<ChatMessage>.of(latest));
  }

  /// 重试上次失败的消息
  Future<void> retryLastMessage() async {
    if (_lastFailedMessage == null) return;

    // 移除上次的错误 assistant 消息
    final currentMessages = state.value ?? [];
    if (currentMessages.isNotEmpty) {
      final last = currentMessages.last;
      if (last.role == 'assistant' && last.content.startsWith('⚠️')) {
        state = AsyncData(
          currentMessages.sublist(0, currentMessages.length - 1),
        );
      }
    }

    final text = _lastFailedMessage!;
    final enableRag = _lastEnableRag;
    _lastFailedMessage = null;
    // 那条用户消息已经在列表里了：不能再追加一条，否则同一问题会变成两轮
    // 用户发言，还会把重复轮次发给模型。
    await sendMessage(text, enableRag: enableRag, appendUserMessage: false);
  }

  Future<void> sendMessage(
    String text, {
    bool enableRag = false,
    bool appendUserMessage = true,
  }) async {
    // 新一次发送接管所有在途流：旧流的回调凭 gen 判定失效，不会再改状态。
    final gen = ++_generation;
    final previousSubscription = _streamSubscription;
    _streamSubscription = null;
    if (previousSubscription != null) {
      await previousSubscription.cancel();
    }
    final previousCompleter = _pendingCompleter;
    _pendingCompleter = null;
    if (previousCompleter != null && !previousCompleter.isCompleted) {
      previousCompleter.complete();
    }
    // 等待取消期间可能又有新的发送/停止：本次已作废，不能再写状态。
    if (gen != _generation) return;

    // 保存参数以便重试
    _lastEnableRag = enableRag;
    _lastFailedMessage = null;

    final currentMessages = state.value ?? [];

    // 1. 添加用户消息（重试时为 false：那条用户消息已经在列表里）
    final userMessage = appendUserMessage
        ? ChatMessage(
            id: DateTime.now().millisecondsSinceEpoch.toString(),
            role: 'user',
            content: text,
          )
        : null;

    // 2. 添加空的 assistant 占位消息（追加与重试两种路径都要加）
    final assistantMessageId =
        'assistant_${DateTime.now().millisecondsSinceEpoch}';
    final initialAssistantMsg = ChatMessage(
      id: assistantMessageId,
      role: 'assistant',
      content: '',
    );

    final newMessages = <ChatMessage>[
      ...currentMessages,
      if (userMessage != null) userMessage,
      initialAssistantMsg,
    ];
    state = AsyncData(newMessages);
    _isGenerating = true;

    try {
      final repo = ref.read(chatRepositoryProvider);

      // 如果当前没有会话 ID，先创建一个新会话
      if (_currentSessionId == null) {
        final title = text.length > 10 ? text.substring(0, 10) : text;
        final res = await repo.createSession(title: title);
        if (gen != _generation) return;
        _currentSessionId = res['sessionId']?.toString();
      }

      // 构造要发送的上下文列表（排除空的 assistant 占位）
      final reqMessages = newMessages
          .where((m) => m.id != assistantMessageId)
          .map((m) => {'role': m.role, 'content': m.content})
          .toList();

      // 请求流式数据
      final stream = repo.sendMessageStream(
        reqMessages,
        enableRag: enableRag,
        sessionId: _currentSessionId,
      );

      String accumulatedContent = '';

      // 使用 Completer + listen 而非 await for，以支持取消
      final completer = Completer<void>();
      _pendingCompleter = completer;

      _streamSubscription = stream.listen(
        (chunk) {
          if (gen != _generation) return;
          accumulatedContent += chunk;

          final latestState = state.value ?? [];
          final updatedMessages = List<ChatMessage>.from(latestState);

          final idx = updatedMessages.indexWhere(
            (m) => m.id == assistantMessageId,
          );
          if (idx != -1) {
            updatedMessages[idx] = updatedMessages[idx].copyWith(
              content: accumulatedContent,
            );
            state = AsyncData(updatedMessages);
          }
        },
        onError: (Object error) {
          if (gen == _generation) {
            debugPrint('流式生成出错: $error');
            _handleSendError(assistantMessageId, text);
          }
          // 即便本次已失效也要完成：否则 await completer.future 永远挂着。
          if (!completer.isCompleted) completer.complete();
        },
        onDone: () {
          if (gen == _generation) {
            _isGenerating = false;
            _streamSubscription = null;
            _pendingCompleter = null;
            // `_isGenerating` 是普通字段，改它不会通知 provider 的监听者。
            // 不发布一次状态，界面上的「停止生成」图标与语义标签会一直停在
            // 生成中，而点击回调已经走发送分支（读屏用户会点错）。
            _publishGenerationStopped();
          }
          if (!completer.isCompleted) completer.complete();
        },
        cancelOnError: true,
      );

      await completer.future;
    } catch (e) {
      debugPrint('发送消息失败: $e');
      if (gen == _generation) {
        _handleSendError(assistantMessageId, text);
      }
    }
  }

  /// 统一处理发送错误
  void _handleSendError(String assistantMessageId, String originalText) {
    _isGenerating = false;
    _streamSubscription = null;
    _pendingCompleter = null;
    _lastFailedMessage = originalText;

    final latestState = state.value ?? [];
    final updatedMessages = List<ChatMessage>.from(latestState);
    final idx = updatedMessages.indexWhere((m) => m.id == assistantMessageId);
    if (idx != -1) {
      updatedMessages[idx] = updatedMessages[idx].copyWith(
        content: '⚠️ 消息发送失败，请点击重试',
      );
      state = AsyncData(updatedMessages);
    }
  }
}
