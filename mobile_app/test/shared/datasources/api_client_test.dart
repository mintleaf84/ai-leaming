import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/shared/datasources/api_client.dart';

import '../../support/recording_adapter.dart';

/// `ApiClient` 是 retrofit 生成的薄层（`api_client.g.dart`），会出错的地方全在
/// 生成代码里：路径拼装、query 序列化（null 该不该发）、body 拷贝、错误是否透传。
/// 所以这里用**真实 `Dio` + 共享的 `RecordingAdapter`** 桩住网络，断言发出去的
/// 请求和拿回来的异常。
///
/// 为什么不像别处那样 mock 掉 `ApiClient`：mock 掉它等于把被测对象换成测试自己
/// 写的假实现——路径写成 `/api/questions`（双前缀 404）或漏掉 `page`，测试照样绿。
///
/// 注意：本文件只有注解与抽象签名，**没有可执行行**，lcov 里不会出现 `api_client.dart`，
/// 它的覆盖率数字永远是 0。测试的价值在契约，不在数字。
void main() {
  late RecordingAdapter adapter;
  late ApiClient client;

  setUp(() {
    adapter = RecordingAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'))
      ..httpClientAdapter = adapter;
    client = ApiClient(dio);
  });

  /// 服务端 `/questions` 的单项形状：`id` 走 `StringIdConverter`（int 也要能收）。
  Map<String, dynamic> questionJson({String id = 'q-1', Object total = 1}) {
    return <String, dynamic>{
      'id': id,
      'content': '我国教育目的的理论基础是（ ）。',
      'options': <String>['个人本位论', '社会本位论'],
      'type': 'single',
      'tags': <String>['教育学'],
      'total': total,
    };
  }

  group('GET 题库：查询参数与路径拼接', () {
    test('getQuestions 把 page/limit/search 放进 query，未传的 type 不出现', () async {
      adapter.responseBody = <String, dynamic>{
        'items': <Object?>[questionJson()],
        'total': 1,
      };

      final page = await client.getQuestions(
        page: 2,
        limit: 20,
        search: '教育目的',
      );

      final request = adapter.requests.single;
      expect(request.path, '/questions', reason: 'baseUrl 已含 /api，再写 /api 就是双前缀 404');
      expect(request.method, 'GET');
      expect(request.queryParameters, <String, dynamic>{
        'page': 2,
        'limit': 20,
        'search': '教育目的',
      });
      expect(page.total, 1);
      expect(page.items.single.id, 'q-1');
    });

    test('不传参时 query 为空：null 不能被序列化成字符串 "null"', () async {
      adapter.responseBody = <String, dynamic>{
        'items': <Object?>[],
        'total': 0,
      };

      await client.getQuestions();

      // 生成代码里的 `removeWhere((k, v) => v == null)` 就是这一行：
      // 去掉它，Dio 会把 null 值当查询参数发出去（`?page=null`），分页语义全错。
      expect(adapter.requests.single.queryParameters, isEmpty);
    });

    test('getQuestionDetail 把 id 拼进路径，不是塞 query', () async {
      adapter.responseBody = questionJson(id: 'q-42');

      final detail = await client.getQuestionDetail('q-42');

      final request = adapter.requests.single;
      expect(request.path, '/questions/q-42');
      expect(request.queryParameters, isEmpty);
      expect(detail.id, 'q-42');
    });

    test('getHistory 用 page/pageSize（与题库的 limit 不是同一套参数名）', () async {
      adapter.responseBody = <Object?>[];

      await client.getHistory(3, 50);

      final request = adapter.requests.single;
      expect(request.path, '/history');
      expect(request.queryParameters, <String, dynamic>{
        'page': 3,
        'pageSize': 50,
      });
    });
  });

  group('POST：method、path 与载荷', () {
    test('login 打 POST /auth/login，body 原样转发', () async {
      adapter.responseBody = <String, dynamic>{
        'token': 'jwt-token',
        'user': <String, dynamic>{'id': 1},
      };
      final body = <String, dynamic>{
        'username': '小明',
        'password': 'p@ss-word',
      };

      final result = await client.login(body);

      final request = adapter.requests.single;
      expect(request.method, 'POST');
      expect(request.path, '/auth/login');
      expect(request.data, body);
      expect(result, <String, dynamic>{
        'token': 'jwt-token',
        'user': <String, dynamic>{'id': 1},
      });
    });

    test('register 打 POST /auth/register（与 login 必须是两条路径）', () async {
      adapter.responseBody = <String, dynamic>{'token': 'jwt-token'};
      final body = <String, dynamic>{
        'username': '小红',
        'password': 'another-pass',
      };

      await client.register(body);

      final request = adapter.requests.single;
      expect(request.method, 'POST');
      expect(request.path, '/auth/register');
      expect(request.data, body);
    });

    test('submitAnswer 把 sessionId 拼进路径，答题内容进 body', () async {
      adapter.responseBody = <String, dynamic>{
        'isCorrect': false,
        'correctAnswer': 'B',
      };

      final result = await client.submitAnswer('s-9', <String, dynamic>{
        'questionId': 'q-1',
        'userAnswer': <String>['A'],
      });

      final request = adapter.requests.single;
      expect(request.method, 'POST');
      expect(request.path, '/practice/session/s-9/submit');
      expect(request.data, <String, dynamic>{
        'questionId': 'q-1',
        'userAnswer': <String>['A'],
      });
      expect(result['isCorrect'], isFalse);
    });
  });

  group('错误透传', () {
    test('401 原样抛成 DioException，状态码与服务端 message 都保留', () async {
      adapter.statusCode = 401;
      adapter.responseBody = <String, dynamic>{'message': '登录已过期'};

      await expectLater(
        client.getQuestions(page: 1),
        throwsA(
          isA<DioException>()
              .having((e) => e.response?.statusCode, 'statusCode', 401)
              .having(
                (e) => e.response?.data,
                'data',
                <String, dynamic>{'message': '登录已过期'},
              ),
        ),
      );
      // 请求确实发出去了：不是本地短路抛的假错。
      expect(adapter.requests, hasLength(1));
    });

    test('500 同样不吞：不回退成空列表冒充"没有题目"', () async {
      adapter.statusCode = 500;
      adapter.responseBody = <String, dynamic>{'message': 'boom'};

      await expectLater(
        client.getQuestions(),
        throwsA(
          isA<DioException>().having(
            (e) => e.response?.statusCode,
            'statusCode',
            500,
          ),
        ),
      );
    });
  });
}
