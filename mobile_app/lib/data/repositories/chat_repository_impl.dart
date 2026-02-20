import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/dio_client.dart';
import '../../domain/repositories/chat_repository.dart';
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

  return ChatRepositoryImpl(streamDio);
});

class ChatRepositoryImpl implements ChatRepository {
  final Dio _dio;

  ChatRepositoryImpl(this._dio);

  @override
  Stream<String> sendMessageStream(
    List<Map<String, dynamic>> messages, {
    bool enableRag = false,
  }) async* {
    try {
      final response = await _dio.post(
        '/chat',
        data: {'messages': messages, 'enableRag': enableRag},
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
}
