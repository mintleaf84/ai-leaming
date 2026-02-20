import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../domain/chat_repository.dart';
import '../domain/chat_message.dart';
import 'dart:convert';
import 'dart:async';

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  // 我们需要一个新的 dio 实例或修改 dio 的 options
  // 由于正常的 dio 是 json 响应流，而 chat 需要 stream 流
  // 最佳做法是拷贝一个配置
  final baseDio = ref.watch(dioProvider);

  // Clone the dio instance to change responseType safely
  final streamDio = Dio(
    baseDio.options.copyWith(responseType: ResponseType.stream),
  );

  // 继承相同的拦截器 (Auth 等)，但必须排除会强制消费流的 LogInterceptor
  for (final interceptor in baseDio.interceptors) {
    if (interceptor is! LogInterceptor) {
      streamDio.interceptors.add(interceptor);
    }
  }

  // 还需要一个用于普通 JSON 请求的基础 Dio
  return ChatRepositoryImpl(streamDio, baseDio);
});

class ChatRepositoryImpl implements ChatRepository {
  final Dio _streamDio;
  final Dio _baseDio;

  ChatRepositoryImpl(this._streamDio, this._baseDio);

  @override
  Stream<String> sendMessageStream(
    List<Map<String, dynamic>> messages, {
    bool enableRag = false,
    String? sessionId,
  }) async* {
    try {
      final data = {'messages': messages, 'enableRag': enableRag};
      if (sessionId != null) {
        data['sessionId'] = sessionId;
      }

      final response = await _streamDio.post(
        '/chat',
        data: data,
        options: Options(
          responseType: ResponseType.stream,
          headers: {
            'Accept': 'text/event-stream',
            'Accept-Encoding': 'identity', // 强制防反向代理/GZip中间层吃掉并缓冲我们的流数据
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        ),
      );

      if (response.statusCode != 200) {
        throw Exception('Server returned ${response.statusCode}');
      }

      final responseBody = response.data as ResponseBody;

      await for (final chunk in responseBody.stream) {
        print('====== CHUNK RECEIVED ======');
        final textChunk = utf8.decode(
          chunk,
          allowMalformed: true,
        ); // 允许略过截断的 utf8 多字节字符段
        print('Decoded Chunk: $textChunk');
        yield textChunk;
      }
      print('====== STREAM FINISHED ======');
    } on DioException catch (e) {
      if (e.response != null) {
        throw Exception(
          'API Error: ${e.response?.statusCode} - ${e.response?.data}',
        );
      } else {
        throw Exception('Network Error: ${e.message}');
      }
    } catch (e) {
      throw Exception('Failed to send message: $e');
    }
  }

  @override
  Future<List<Map<String, dynamic>>> getSessions({int limit = 20}) async {
    try {
      final response = await _baseDio.get(
        '/chat/sessions',
        queryParameters: {'limit': limit},
      );
      if (response.statusCode == 200 && response.data['sessions'] != null) {
        return List<Map<String, dynamic>>.from(response.data['sessions']);
      }
      throw Exception('Failed to load sessions');
    } catch (e) {
      throw Exception('Failed to load sessions: $e');
    }
  }

  @override
  Future<Map<String, dynamic>> createSession({String? title}) async {
    try {
      final data = title != null ? {'title': title} : {};
      final response = await _baseDio.post('/chat/sessions', data: data);
      if (response.statusCode == 200 && response.data['sessionId'] != null) {
        return response.data as Map<String, dynamic>;
      }
      throw Exception('Failed to create session');
    } catch (e) {
      throw Exception('Failed to create session: $e');
    }
  }

  @override
  Future<List<ChatMessage>> getSessionMessages(String sessionId) async {
    try {
      final response = await _baseDio.get('/chat/sessions/$sessionId');
      if (response.statusCode == 200 && response.data['messages'] != null) {
        final messagesList = response.data['messages'] as List;
        return messagesList.map((m) => ChatMessage.fromJson(m)).toList();
      }
      throw Exception('Failed to load session messages');
    } catch (e) {
      throw Exception('Failed to load session messages: $e');
    }
  }

  @override
  Future<void> deleteSession(String sessionId) async {
    try {
      await _baseDio.delete('/chat/sessions/$sessionId');
    } catch (e) {
      throw Exception('Failed to delete session: $e');
    }
  }
}
