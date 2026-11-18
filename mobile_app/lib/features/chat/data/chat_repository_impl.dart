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

      // 解析单行 SSE 数据：text-delta 透传 delta，error 抛出，
      // 其余类型、[DONE] 与畸形帧一律跳过（返回 null）。
      String? parseSseLine(String line) {
        if (!line.startsWith('data:')) return null;
        final payload = line.substring(5).trim();
        if (payload.isEmpty || payload == '[DONE]') return null;
        Object? decoded;
        try {
          decoded = jsonDecode(payload);
        } catch (_) {
          return null;
        }
        if (decoded is! Map<String, dynamic>) return null;
        final type = decoded['type'];
        if (type == 'error') {
          throw Exception(
            'SSE error frame: ${decoded['errorText'] ?? payload}',
          );
        }
        if (type == 'text-delta') {
          final delta = decoded['delta'];
          if (delta is String) return delta;
        }
        return null;
      }

      // SSE 帧可能被网络任意切分：跨 chunk 维护行缓冲，按行解析。
      // Utf8Decoder.bind 会把被 chunk 边界截断的多字节字符跨 chunk 拼接，
      // allowMalformed 仅兜底真正的坏字节。
      final lineBuffer = StringBuffer();
      final textStream = const Utf8Decoder(
        allowMalformed: true,
      ).bind(responseBody.stream);
      await for (final textChunk in textStream) {
        lineBuffer.write(textChunk);
        final lines = lineBuffer.toString().split('\n');
        lineBuffer
          ..clear()
          ..write(lines.removeLast()); // 末段可能是未收尾的半行，留给下一个 chunk
        for (final line in lines) {
          final delta = parseSseLine(line);
          if (delta != null) yield delta;
        }
      }
      // 流结束后处理缓冲区里残留的最后一行
      if (lineBuffer.isNotEmpty) {
        final delta = parseSseLine(lineBuffer.toString());
        if (delta != null) yield delta;
      }
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
