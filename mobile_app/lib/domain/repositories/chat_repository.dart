import '../entities/chat_message.dart';

abstract class ChatRepository {
  Stream<String> sendMessageStream(
    List<Map<String, dynamic>> messages, {
    bool enableRag = false,
    String? sessionId,
  });

  Future<List<Map<String, dynamic>>> getSessions({int limit = 20});

  Future<Map<String, dynamic>> createSession({String? title});

  Future<List<ChatMessage>> getSessionMessages(String sessionId);

  Future<void> deleteSession(String sessionId);
}
