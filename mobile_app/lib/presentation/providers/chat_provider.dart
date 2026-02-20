import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/chat_message.dart';
import '../../data/repositories/chat_repository_impl.dart';

final chatProvider = AsyncNotifierProvider<ChatNotifier, List<ChatMessage>>(() {
  return ChatNotifier();
});

class ChatNotifier extends AsyncNotifier<List<ChatMessage>> {
  @override
  FutureOr<List<ChatMessage>> build() {
    return [];
  }

  void clearMessages() {
    state = const AsyncData([]);
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

      // 构造要发送的上下文明文列表
      final reqMessages = newMessages
          // 不传还没生成内容的 assistant placeholder，否则会被当出 user 对话上下文
          .where((m) => m.id != assistantMessageId)
          .map((m) => {'role': m.role, 'content': m.content})
          .toList();

      // 请求流式数据
      final stream = repo.sendMessageStream(reqMessages, enableRag: enableRag);

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
