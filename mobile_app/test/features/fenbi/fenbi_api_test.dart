import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/error/user_message.dart';
import 'package:mobile_app/features/fenbi/data/fenbi_api.dart';
import 'package:mobile_app/features/fenbi/domain/fenbi_status.dart';

import '../../support/recording_adapter.dart'
    show RecordingAdapter, offlineException;

/// FenbiApi 的请求契约与错误翻译。
///
/// 用 `HttpClientAdapter` 桩住网络（`test/support/recording_adapter.dart`）：
/// 断言的是**发出去的请求**（路径、动词、查询参数、载荷）与**客户端对响应的
/// 处理**，不是服务端实现——所以不联网、不碰数据库。
///
/// 守的四条线：
/// 1. 路径必须是 `/fenbi/...`。`Dio.baseUrl` 已含 `/api`，写成 `/api/fenbi/...`
///    会变成 `/api/api/fenbi/...`，界面上只表现为「加载失败」；
/// 2. 4xx 的 `{ error }` 要原样变成可展示文案（账号密码错误、风控、限频），
///    而不是被通用文案吃掉；
/// 3. 没有 `error` 字段的失败（断网/500/纯文本 4xx）不能被误判成业务错误；
/// 4. `/fenbi/link` 的载荷：`toJson()` 必须带明文密码给 dio 序列化，
///    `toString()` 必须脱敏（全局 LogInterceptor 打开着 requestBody）。
void main() {
  late RecordingAdapter adapter;
  late FenbiApi api;

  setUp(() {
    adapter = RecordingAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'));
    dio.httpClientAdapter = adapter;
    api = FenbiApi(dio);
  });

  /// 让接下来的请求回固定 JSON + 状态码。
  void respond(Object? body, {int statusCode = 200}) {
    adapter
      ..responseBody = body
      ..statusCode = statusCode;
  }

  group('GET /fenbi/status', () {
    test('成功：解析掩码手机号、时间、lastResult（TEXT 列里的 JSON 字符串）', () async {
      respond(<String, dynamic>{
        'linked': true,
        'phoneMasked': '138****1234',
        'fenbiUserId': 'fb-9',
        'lastSyncAt': '2026-11-21T10:30:00.000Z',
        'lastResult':
            '{"imported":3,"skipped":1,"newQuestions":5,"failed":[]}',
        'syncable': true,
        'unsupported': <String>['paper'],
      });

      final status = await api.fetchStatus();

      expect(adapter.gets.single.path, '/fenbi/status');
      expect(status.linked, isTrue);
      expect(status.phoneMasked, '138****1234');
      expect(status.fenbiUserId, 'fb-9');
      expect(status.lastSyncAt, DateTime.utc(2026, 11, 21, 10, 30));
      expect(status.lastResult!.imported, 3);
      expect(status.lastResult!.newQuestions, 5);
      expect(status.paperUnsupported, isTrue);
    });

    test('响应不是 JSON 对象：抛 FormatException 且带路径（不把半截数据渲染上屏）', () async {
      respond(<Object?>[]);

      await expectLater(
        api.fetchStatus(),
        throwsA(
          isA<FormatException>().having(
            (error) => error.message,
            'message',
            contains('/fenbi/status'),
          ),
        ),
      );
    });
  });

  group('POST /fenbi/link', () {
    test('成功：载荷字段正确，且 toString 脱敏（日志里没有明文密码）', () async {
      respond(<String, dynamic>{'ok': true});

      await api.link(phone: '13812341234', password: 's3cret-pw');

      final request = adapter.posts.single;
      expect(request.path, '/fenbi/link');
      // dio 序列化时走 toJson()：真正发出去的 JSON 必须带原始值
      expect(
        jsonEncode(request.data),
        '{"phone":"13812341234","password":"s3cret-pw"}',
      );
      // LogInterceptor(requestBody: true) 打的是 toString()
      final logged = request.data.toString();
      expect(logged, contains('138****1234'));
      expect(logged, isNot(contains('s3cret-pw')));
      expect(logged, isNot(contains('13812341234')));
    });

    test('400 + {error}：抛出后端中文文案', () async {
      respond(<String, dynamic>{'error': '账号或密码错误'}, statusCode: 400);

      await expectLater(
        api.link(phone: '13812341234', password: 'pw'),
        throwsA(
          isA<FenbiApiException>().having(
            (error) => error.userMessage,
            'userMessage',
            '账号或密码错误',
          ),
        ),
      );
    });

    test('400 + {error:{message}}：嵌套文案也能读出来', () async {
      respond(<String, dynamic>{
        'error': <String, dynamic>{'message': '验证码已失效'},
      }, statusCode: 400);

      await expectLater(
        api.link(phone: '13812341234', password: 'pw'),
        throwsA(
          isA<FenbiApiException>().having(
            (error) => error.userMessage,
            'userMessage',
            '验证码已失效',
          ),
        ),
      );
    });

    test('430（粉笔风控）：给可行动文案，引导换扫码', () async {
      respond(<String, dynamic>{'contextId': 'abc'}, statusCode: 430);

      await expectLater(
        api.link(phone: '13812341234', password: 'pw'),
        throwsA(
          isA<FenbiApiException>().having(
            (error) => error.userMessage,
            'userMessage',
            contains('扫码绑定'),
          ),
        ),
      );
    });

    test('429（服务端限频）：提示等一分钟', () async {
      respond(const <String, dynamic>{}, statusCode: 429);

      await expectLater(
        api.link(phone: '13812341234', password: 'pw'),
        throwsA(
          isA<FenbiApiException>().having(
            (error) => error.userMessage,
            'userMessage',
            contains('太频繁'),
          ),
        ),
      );
    });

    test('400 但没有 error 字段：保留 DioException，交给通用翻译', () async {
      adapter.handler = (_) => ResponseBody.fromString(
        'Bad Request',
        400,
        headers: const <String, List<String>>{
          Headers.contentTypeHeader: <String>['text/plain'],
        },
      );

      Object? caught;
      try {
        await api.link(phone: '13812341234', password: 'pw');
      } catch (error) {
        caught = error;
      }

      expect(caught, isA<DioException>());
      expect(caught, isNot(isA<FenbiApiException>()));
      expect(userMessageOf(caught!), '请求未能完成（400），请稍后重试');
    });

    test('error 是空白串：同样按「没有文案」处理', () async {
      respond(<String, dynamic>{'error': '   '}, statusCode: 400);

      await expectLater(
        api.link(phone: '13812341234', password: 'pw'),
        throwsA(isA<DioException>()),
      );
    });

    test('超长错误文案截断到 120 字 + 省略号，不把整段载荷塞进界面', () async {
      respond(<String, dynamic>{
        'error': '错' * 200,
      }, statusCode: 400);

      await expectLater(
        api.link(phone: '13812341234', password: 'pw'),
        throwsA(
          isA<FenbiApiException>().having(
            (error) => error.userMessage,
            'userMessage',
            allOf(hasLength(121), endsWith('…')),
          ),
        ),
      );
    });
  });

  group('二维码', () {
    test('生成二维码：POST /fenbi/qrcode，解析 lgtoken / qrContent', () async {
      respond(<String, dynamic>{
        'lgtoken': 'lt-1',
        'qrContent': 'https://www.fenbi.com/scan?lgtoken=lt-1',
      });

      final session = await api.createQrSession();

      expect(adapter.posts.single.path, '/fenbi/qrcode');
      expect(session.lgtoken, 'lt-1');
      expect(session.qrContent, contains('lgtoken=lt-1'));
      expect(session.isUsable, isTrue);
    });

    test('查询扫码状态：GET /fenbi/qrcode/status?lgtoken=...', () async {
      respond(<String, dynamic>{'status': 'scanned'});

      final phase = await api.fetchQrPhase('lt-1');

      final request = adapter.gets.single;
      expect(request.path, '/fenbi/qrcode/status');
      expect(request.queryParameters, <String, dynamic>{'lgtoken': 'lt-1'});
      expect(phase, FenbiQrPhase.scanned);
    });

    test('未知 / 数字状态落到 unknown（界面继续轮询而不是当成已确认）', () async {
      respond(<String, dynamic>{'status': 3});

      expect(await api.fetchQrPhase('lt-1'), FenbiQrPhase.unknown);
    });
  });

  group('同步与解绑', () {
    test('同步：POST /fenbi/sync，默认 full=false，可要求全量', () async {
      respond(<String, dynamic>{
        'imported': 2,
        'skipped': 1,
        'newQuestions': 4,
        'failed': <Object?>[
          <String, dynamic>{'exerciseId': 9, 'reason': '结构不支持'},
        ],
      });

      final result = await api.sync();
      expect(adapter.posts.single.path, '/fenbi/sync');
      expect(adapter.posts.single.data, <String, dynamic>{'full': false});
      expect(result.imported, 2);
      expect(result.failed.single.label, '练习 9');

      await api.sync(full: true);
      expect(adapter.posts.last.data, <String, dynamic>{'full': true});
    });

    test('同步 500：不是业务错误，交给通用翻译', () async {
      respond(<String, dynamic>{'error': 'boom'}, statusCode: 500);

      Object? caught;
      try {
        await api.sync();
      } catch (error) {
        caught = error;
      }

      expect(caught, isA<DioException>());
      expect(userMessageOf(caught!), '服务器出了点问题（500），请稍后重试');
    });

    test('解绑：DELETE /fenbi/link', () async {
      respond(<String, dynamic>{'ok': true});

      await api.unlink();

      expect(adapter.deletes.single.path, '/fenbi/link');
      expect(adapter.deletes.single.method, 'DELETE');
    });
  });

  group('网络层', () {
    test('断网：保留 DioException，文案可读（不泄漏 URL / 堆栈）', () async {
      adapter.handler = (options) => offlineException(options);

      Object? caught;
      try {
        await api.fetchStatus();
      } catch (error) {
        caught = error;
      }

      expect(caught, isA<DioException>());
      final message = userMessageOf(caught!);
      expect(message, '网络好像断了，请检查网络后重试');
      expect(message, isNot(contains('http')));
    });
  });
}
