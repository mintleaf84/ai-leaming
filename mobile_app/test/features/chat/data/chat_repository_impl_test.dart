import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/chat/data/chat_repository_impl.dart';

import '../../../support/recording_adapter.dart';

/// 这个测试守的是聊天链路的四条线：
///
/// 1. **请求契约**：`POST /chat`、载荷键 `messages` / `enableRag` / `sessionId`，
///    以及 `Accept: text/event-stream` + `Accept-Encoding: identity`——后者少了，
///    反向代理会 GZip 缓冲整条流，用户看到的是「AI 想了 10 秒然后一次性出全文」。
/// 2. **分块拼接**：SSE 帧可能被网络切在半行、甚至切在多字节汉字中间；
///    客户端必须自己维护行缓冲，且**按到达顺序**逐段吐出 delta，不能丢字、不能乱序。
/// 3. **错误必须可读地抛出**：非 200、上游 `error` 帧、断网、流中途断开都不能
///    静默返回空串——那会让界面显示一条空回复，用户以为模型没答。
/// 4. **会话管理路径**：`/chat/sessions` 的 GET/POST/DELETE 与 `limit` 查询参数。
///
/// 网络用 [RecordingAdapter] 桩住：断言的是客户端发出去的请求和它对流的处理，
/// 不联网。
void main() {
  late RecordingAdapter adapter;
  late ChatRepositoryImpl repository;

  setUp(() {
    adapter = RecordingAdapter();
    final streamDio = Dio(
      BaseOptions(
        baseUrl: 'http://localhost:3000/api',
        responseType: ResponseType.stream,
      ),
    );
    streamDio.httpClientAdapter = adapter;
    final baseDio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'));
    baseDio.httpClientAdapter = adapter;
    repository = ChatRepositoryImpl(streamDio, baseDio);
  });

  group('sendMessageStream：请求契约与分块拼接', () {
    test('打 /chat，载荷含 messages/enableRag/sessionId，并要求 SSE 直传', () async {
      adapter.handler = (options) => sseBody(<List<int>>[
        utf8.encode(
          sseFrame(<String, dynamic>{'type': 'text-delta', 'delta': '好'}),
        ),
      ]);

      final deltas = await repository
          .sendMessageStream(
            <Map<String, dynamic>>[
              <String, dynamic>{'role': 'user', 'content': '你好'},
            ],
            enableRag: true,
            sessionId: 'sess-1',
          )
          .toList();

      final request = adapter.posts.single;
      expect(request.path, '/chat');
      expect(request.data, <String, dynamic>{
        'messages': <Map<String, dynamic>>[
          <String, dynamic>{'role': 'user', 'content': '你好'},
        ],
        'enableRag': true,
        'sessionId': 'sess-1',
      });
      expect(
        headerOf(request, 'Accept'),
        'text/event-stream',
        reason: '声明 SSE，避免中间层按普通 JSON 处理',
      );
      expect(
        headerOf(request, 'Accept-Encoding'),
        'identity',
        reason: 'GZip 缓冲会把流式输出变成一次性返回',
      );
      expect(deltas, <String>['好']);
    });

    test('不传 sessionId 时载荷里不出现该键（服务端按新会话处理）', () async {
      adapter.handler = (options) => sseBody(<List<int>>[
        utf8.encode(
          sseFrame(<String, dynamic>{'type': 'text-delta', 'delta': 'x'}),
        ),
      ]);

      await repository.sendMessageStream(<Map<String, dynamic>>[]).toList();

      expect(adapter.posts.single.data, <String, dynamic>{
        'messages': <Map<String, dynamic>>[],
        'enableRag': false,
      });
    });

    test('逐字节切分（切在半行、切在汉字中间）仍按顺序拼出完整文本', () async {
      final text = <String>[
        sseFrame(<String, dynamic>{'type': 'text-delta', 'delta': '你'}),
        sseFrame(<String, dynamic>{'type': 'text-delta', 'delta': '好'}),
        sseFrame(<String, dynamic>{'type': 'text-delta', 'delta': '呀'}),
      ].join();
      // 1 字节一切：每一帧都被切碎，汉字（3 字节）必然跨 chunk。
      adapter.handler = (options) => sseBody(splitBytes(utf8.encode(text), 1));

      final deltas = await repository
          .sendMessageStream(<Map<String, dynamic>>[])
          .toList();

      expect(deltas, <String>['你', '好', '呀'], reason: '顺序与内容都不能变');
    });

    test('非 text-delta 帧、[DONE] 与畸形帧一律跳过，不污染正文', () async {
      final text = <String>[
        ': keep-alive\n\n',
        sseFrame(<String, dynamic>{'type': 'start'}),
        sseFrame(<String, dynamic>{'type': 'text-delta', 'delta': '甲'}),
        'data: {not-json\n\n',
        sseFrame(<String, dynamic>{'type': 'finish'}),
        'data: [DONE]\n\n',
        sseFrame(<String, dynamic>{'type': 'text-delta', 'delta': '乙'}),
      ].join();
      adapter.handler = (options) => sseBody(splitBytes(utf8.encode(text), 7));

      final deltas = await repository
          .sendMessageStream(<Map<String, dynamic>>[])
          .toList();

      expect(deltas, <String>['甲', '乙']);
    });

    test('末行没有换行符时也要处理（服务端可能不补最后空行）', () async {
      adapter.handler = (options) => sseBody(<List<int>>[
        utf8.encode('data: {"type":"text-delta","delta":"尾"}'),
      ]);

      final deltas = await repository
          .sendMessageStream(<Map<String, dynamic>>[])
          .toList();

      expect(deltas, <String>['尾']);
    });
  });

  group('sendMessageStream：失败要说清楚', () {
    test('上游 error 帧抛出带 errorText 的错误，而不是当正常回复结束', () async {
      adapter.handler = (options) => sseBody(<List<int>>[
        utf8.encode(
          sseFrame(<String, dynamic>{'type': 'error', 'errorText': '额度不足'}),
        ),
      ]);

      final received = <String>[];
      Object? error;
      try {
        await for (final delta in repository.sendMessageStream(
          <Map<String, dynamic>>[],
        )) {
          received.add(delta);
        }
      } catch (e) {
        error = e;
      }

      expect(received, isEmpty);
      expect(error, isNotNull);
      expect(error.toString(), contains('额度不足'));
    });

    test('HTTP 500 抛错（含状态码），不静默返回空串', () async {
      adapter.responseBody = <String, dynamic>{'error': 'upstream down'};
      adapter.statusCode = 500;

      final received = <String>[];
      Object? error;
      try {
        await for (final delta in repository.sendMessageStream(
          <Map<String, dynamic>>[],
        )) {
          received.add(delta);
        }
      } catch (e) {
        error = e;
      }

      expect(received, isEmpty);
      expect(error, isNotNull);
      expect(error.toString(), contains('500'));
    });

    test('连不上时抛出 Network Error（可被界面识别为网络问题）', () async {
      adapter.handler = (options) => offlineException(options);

      Object? error;
      try {
        await for (final _ in repository.sendMessageStream(
          <Map<String, dynamic>>[],
        )) {
          // 断网时不会有任何 delta
        }
      } catch (e) {
        error = e;
      }

      expect(error, isNotNull);
      expect(error.toString(), contains('Network Error'));
    });

    test('流中途断开：已到达的 delta 先交付，随后抛错', () async {
      final firstFrame = sseFrame(<String, dynamic>{
        'type': 'text-delta',
        'delta': '前半段',
      });
      adapter.handler = (options) => ResponseBody(
        interruptedStream(utf8.encode(firstFrame)),
        200,
        headers: const <String, List<String>>{
          Headers.contentTypeHeader: <String>['text/event-stream'],
        },
      );

      final received = <String>[];
      Object? error;
      try {
        await for (final delta in repository.sendMessageStream(
          <Map<String, dynamic>>[],
        )) {
          received.add(delta);
        }
      } catch (e) {
        error = e;
      }

      expect(received, <String>['前半段'], reason: '已经吐出的内容不该被丢弃');
      expect(error, isNotNull);
      expect(error.toString(), contains('upstream reset'));
    });
  });

  group('会话管理：路径、查询参数与解析', () {
    test('getSessions 打 /chat/sessions 并带 limit', () async {
      adapter.responseBody = <String, dynamic>{
        'sessions': <Map<String, dynamic>>[
          <String, dynamic>{'id': 1, 'title': '第一次提问'},
        ],
      };

      final sessions = await repository.getSessions(limit: 5);

      final request = adapter.requests.single;
      expect(request.path, '/chat/sessions');
      expect(request.method, 'GET');
      expect(request.queryParameters, <String, dynamic>{'limit': 5});
      expect(sessions.single['title'], '第一次提问');
    });

    test('createSession 是 POST /chat/sessions，title 可选', () async {
      adapter.responseBody = <String, dynamic>{'sessionId': 'sess-9'};

      final session = await repository.createSession(title: '新会话');

      final request = adapter.requests.single;
      expect(request.path, '/chat/sessions');
      expect(request.method, 'POST');
      expect(request.data, <String, dynamic>{'title': '新会话'});
      expect(session['sessionId'], 'sess-9');
    });

    test('getSessionMessages 打 /chat/sessions/{id} 并解析消息', () async {
      adapter.responseBody = <String, dynamic>{
        'messages': <Map<String, dynamic>>[
          <String, dynamic>{'id': 1, 'role': 'user', 'content': '你好'},
          <String, dynamic>{
            'id': 2,
            'role': 'assistant',
            'content': '你好，有什么可以帮你？',
            'is_favorite': 1,
          },
        ],
      };

      final messages = await repository.getSessionMessages('sess-9');

      expect(adapter.requests.single.path, '/chat/sessions/sess-9');
      expect(messages, hasLength(2));
      expect(messages.first.role, 'user');
      expect(messages.last.content, contains('有什么可以帮你'));
      expect(messages.last.isFavorite, isTrue);
    });

    test('deleteSession 是 DELETE /chat/sessions/{id}', () async {
      adapter.responseBody = <String, dynamic>{'ok': true};

      await repository.deleteSession('sess-9');

      final request = adapter.requests.single;
      expect(request.path, '/chat/sessions/sess-9');
      expect(request.method, 'DELETE');
    });
  });
}

/// 一帧 SSE `data:` 载荷（结尾带空行，符合 SSE 帧分隔）。
String sseFrame(Map<String, dynamic> payload) {
  return 'data: ${jsonEncode(payload)}\n\n';
}

/// 先吐一块数据再报错的流：模拟上游在生成中途断开。
Stream<Uint8List> interruptedStream(List<int> firstChunk) async* {
  yield Uint8List.fromList(firstChunk);
  throw StateError('upstream reset');
}

/// 把字节流按固定大小切开；[size] 小于字符宽度时会切在多字节字符中间。
List<List<int>> splitBytes(List<int> bytes, int size) {
  final chunks = <List<int>>[];
  for (var start = 0; start < bytes.length; start += size) {
    final end = start + size > bytes.length ? bytes.length : start + size;
    chunks.add(bytes.sublist(start, end));
  }
  return chunks;
}

/// 大小写不敏感地取请求头（Dio 合并配置时可能改变键的大小写）。
String? headerOf(RequestOptions request, String name) {
  for (final entry in request.headers.entries) {
    if (entry.key.toLowerCase() == name.toLowerCase()) {
      return entry.value?.toString();
    }
  }
  return null;
}
