import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:mobile_app/data/datasources/api_client.dart';
import 'dart:convert';
import 'dart:math';

void main() {
  test('Chat Streaming API test', () async {
    final dio = Dio();
    final apiClient = ApiClient(dio, baseUrl: 'http://127.0.0.1:3000/api');

    // 1. 注册获取 Token
    final username = 'chat_test_${Random().nextInt(10000)}';
    final regRes = await apiClient.register({
      'username': username,
      'password': 'password123',
    });
    final token = regRes['token'];

    // 2. 配置 Dio 接收流数据
    final streamDio = Dio(
      BaseOptions(
        baseUrl: 'http://127.0.0.1:3000/api',
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        responseType: ResponseType.stream, // 关键：要求返回 Stream
      ),
    );

    print('Sending message to /chat...');
    try {
      final response = await streamDio.post(
        '/chat',
        data: {
          "messages": [
            {"role": "user", "content": "你好，请用不超过20个字概括第一性原理。"},
          ],
          "enableRag": false,
        },
      );

      print('Stream connected: ${response.statusCode}');
      expect(response.statusCode, 200);

      // 解读响应流
      final responseBody = response.data as ResponseBody;
      String fullMessage = '';

      await for (final chunk in responseBody.stream) {
        final textChunk = utf8.decode(chunk);
        // Next.js AI SDK 默认会包含类似 "0:" 前缀的数据标记位
        // 比如： 0:"第一"
        fullMessage += textChunk;
        print('Chunk received: $textChunk');
      }

      print('\n--- Stream Ended ---');
      print('Full raw output:\n$fullMessage');

      expect(fullMessage.isNotEmpty, true);
    } catch (e) {
      print('Failed to receive stream: $e');
      fail('Stream connection failed');
    }
  });
}
