import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
    return [];
  }

  void clearMessages() {
    _currentSessionId = null;
    _lastFailedMessage = null;
    state = const AsyncData([]);
  }

  Future<void> createNewSession() async {
    stopGeneration();
    _currentSessionId = null;
    _lastFailedMessage = null;
    state = const AsyncData([]);
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
    _streamSubscription?.cancel();
    _streamSubscription = null;
    _isGenerating = false;
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
    _lastFailedMessage = null;
    await sendMessage(text, enableRag: _lastEnableRag);
  }

  Future<void> sendMessage(String text, {bool enableRag = false}) async {
    // 保存参数以便重试
    _lastEnableRag = enableRag;
    _lastFailedMessage = null;

    final currentMessages = state.value ?? [];

    // 1. 添加用户消息
    final userMessage = ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: 'user',
      content: text,
    );

    var newMessages = [...currentMessages, userMessage];

    // 2. 添加空的 assistant 占位消息
    final assistantMessageId =
        'assistant_${DateTime.now().millisecondsSinceEpoch}';
    final initialAssistantMsg = ChatMessage(
      id: assistantMessageId,
      role: 'assistant',
      content: '',
    );

    newMessages = [...newMessages, initialAssistantMsg];
    state = AsyncData(newMessages);
    _isGenerating = true;

    try {
      final repo = ref.read(chatRepositoryProvider);

      // 如果当前没有会话 ID，先创建一个新会话
      if (_currentSessionId == null) {
        final title = text.length > 10 ? text.substring(0, 10) : text;
        final res = await repo.createSession(title: title);
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

      _streamSubscription = stream.listen(
        (chunk) {
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
        onError: (error) {
          debugPrint('流式生成出错: $error');
          _handleSendError(assistantMessageId, text);
          completer.complete();
        },
        onDone: () {
          _isGenerating = false;
          _streamSubscription = null;
          completer.complete();
        },
        cancelOnError: true,
      );

      await completer.future;
    } catch (e) {
      debugPrint('发送消息失败: $e');
      _handleSendError(assistantMessageId, text);
    }
  }

  /// 统一处理发送错误
  void _handleSendError(String assistantMessageId, String originalText) {
    _isGenerating = false;
    _streamSubscription = null;
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
