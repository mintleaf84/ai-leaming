import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/chat_message.dart';
import '../data/chat_repository_impl.dart';

final chatProvider = AsyncNotifierProvider<ChatNotifier, List<ChatMessage>>(() {
  return ChatNotifier();
});

final chatSessionsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
      final repo = ref.watch(chatRepositoryProvider);
      // 当我们发送新消息或删除会话时，可能需要使此 provider 失效，可以通过 ref.invalidate 来做
      return await repo.getSessions();
    });

class ChatNotifier extends AsyncNotifier<List<ChatMessage>> {
  String? _currentSessionId;

  String? get currentSessionId => _currentSessionId;

  @override
  FutureOr<List<ChatMessage>> build() {
    return [];
  }

  void clearMessages() {
    _currentSessionId = null;
    state = const AsyncData([]);
  }

  Future<void> createNewSession() async {
    _currentSessionId = null;
    state = const AsyncData([]);
  }

  Future<void> loadSession(String sessionId) async {
    state = const AsyncLoading();
    try {
      final repo = ref.read(chatRepositoryProvider);
      final messages = await repo.getSessionMessages(sessionId);
      _currentSessionId = sessionId;
      state = AsyncData(messages);
    } catch (e) {
      state = AsyncError('Failed to load session: $e', StackTrace.current);
    }
  }

  Future<void> sendMessage(String text, {bool enableRag = false}) async {
    final currentMessages = state.value ?? [];

    // 1. Add User Message
    final userMessage = ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: 'user',
      content: text,
    );

    var newMessages = [...currentMessages, userMessage];

    // 2. Add empty Assistant Message placeholder
    final assistantMessageId =
        'assistant_${DateTime.now().millisecondsSinceEpoch}';
    final initialAssistantMsg = ChatMessage(
      id: assistantMessageId,
      role: 'assistant',
      content: '',
    );

    newMessages = [...newMessages, initialAssistantMsg];
    state = AsyncData(newMessages);

    try {
      final repo = ref.read(chatRepositoryProvider);

      // 如果当前没有会话 ID，先创建一个新会话
      if (_currentSessionId == null) {
        // 先简单使用用户发送的第一句话的截断作为 title
        String title = text.length > 10 ? text.substring(0, 10) : text;
        final res = await repo.createSession(title: title);
        _currentSessionId = res['sessionId']?.toString();
      }

      // 构造要发送的上下文明文列表
      final reqMessages = newMessages
          // 不传还没生成内容的 assistant placeholder，否则会被当出 user 对话上下文
          .where((m) => m.id != assistantMessageId)
          .map((m) => {'role': m.role, 'content': m.content})
          .toList();

      // 请求流式数据，传入当前的 sessionId 让后端存库
      final stream = repo.sendMessageStream(
        reqMessages,
        enableRag: enableRag,
        sessionId: _currentSessionId,
      );

      String accumulatedContent = '';

      await for (final chunk in stream) {
        accumulatedContent += chunk;

        // 查找最新的列表并更新最后一项的内容
        final latestState = state.value ?? [];
        final updatedMessages = List<ChatMessage>.from(latestState);

        final idx = updatedMessages.indexWhere(
          (m) => m.id == assistantMessageId,
        );
        if (idx != -1) {
          updatedMessages[idx] = updatedMessages[idx].copyWith(
            content: accumulatedContent,
          );
          state = AsyncData(updatedMessages); // 触发 UI 重建
        }
      }
    } catch (e) {
      // 网络错误处理：移除 placeholder 或者变更为错误信息
      final latestState = state.value ?? [];
      final updatedMessages = List<ChatMessage>.from(latestState);
      final idx = updatedMessages.indexWhere((m) => m.id == assistantMessageId);
      if (idx != -1) {
        updatedMessages[idx] = updatedMessages[idx].copyWith(
          content: '网络错误：$e',
        );
        state = AsyncData(updatedMessages);
      }
    }
  }
}
