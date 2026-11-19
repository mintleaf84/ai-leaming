import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/practice/domain/first_principles_params.dart';
import 'package:mobile_app/features/practice/presentation/first_principles_provider.dart';

import '../../../support/recording_adapter.dart';

/// 这个测试守的是「第一性原理」请求的**载荷契约**和**错误传播**（provider 只有
/// 5 行，逻辑全在 `ApiClient` 与后端契约上）：
///
/// 1. **参数透传**：`FirstPrinciplesParams.toJson()` 的键必须原样进 body
///    （`questionContent` / `correctAnswer` / `explanation` / `wrongAnswer`），
///    包括可选字段缺省时的 `null` 键——后端按「键存在但为 null」判断
///    「用户没填解析」，少一个键和填 null 不是一回事。
/// 2. **失败不返回假数据**：没有 try/catch，所以 5xx 必须变成 AsyncError；
///    一旦有人加了「返回默认空分析」的兜底，界面会把空字符串当成 AI 回答展示。
/// 3. **family 缓存**：同一份参数重复 watch 只发一次请求（省掉重复计费的分析），
///    换参数才重新请求。
void main() {
  late RecordingAdapter adapter;

  setUp(() {
    adapter = RecordingAdapter();
  });

  Dio makeDio() =>
      Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'))
        ..httpClientAdapter = adapter;

  ProviderContainer makeContainer() {
    final container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [dioProvider.overrideWithValue(makeDio())],
    );
    addTearDown(container.dispose);
    return container;
  }

  const params = FirstPrinciplesParams(
    questionContent: '我国教育目的的理论基础是（ ）。',
    correctAnswer: 'B',
    explanation: '社会本位论',
    wrongAnswer: 'A',
  );

  group('请求契约', () {
    test(
      'POST /practice/first-principles，body 与 params.toJson() 完全一致',
      () async {
        adapter.responseBody = <String, dynamic>{
          'analysis': '这道题考的是教育目的的价值取向。',
          'cached': false,
        };
        final container = makeContainer();

        final response = await container.read(
          firstPrinciplesProvider(params).future,
        );

        final request = adapter.requests.single;
        expect(request.path, '/practice/first-principles');
        expect(request.method, 'POST');
        expect(request.data, params.toJson());
        expect(response.analysis, contains('价值取向'));
        expect(response.cached, isFalse);
      },
    );

    test('可选字段缺省时仍以 null 键发出（键存在 != 键缺失）', () async {
      adapter.responseBody = <String, dynamic>{
        'analysis': '分析',
        'cached': true,
      };
      final container = makeContainer();
      const minimal = FirstPrinciplesParams(
        questionContent: '题目',
        correctAnswer: 'C',
      );

      await container.read(firstPrinciplesProvider(minimal).future);

      final body = adapter.requests.single.data as Map<String, dynamic>;
      expect(
        body.keys,
        containsAll([
          'questionContent',
          'correctAnswer',
          'explanation',
          'wrongAnswer',
        ]),
      );
      expect(body['explanation'], isNull);
      expect(body['wrongAnswer'], isNull);
      expect(body['correctAnswer'], 'C');
    });

    test('cached=true 原样透传（缓存命中要能显示给用户）', () async {
      adapter.responseBody = <String, dynamic>{
        'analysis': '缓存里的分析',
        'cached': true,
      };
      final container = makeContainer();

      final response = await container.read(
        firstPrinciplesProvider(params).future,
      );

      expect(response.cached, isTrue);
      expect(response.analysis, '缓存里的分析');
    });
  });

  group('错误传播', () {
    test('服务端 500 变成 AsyncError，不返回空分析冒充成功', () async {
      adapter.statusCode = 500;
      adapter.responseBody = {'message': 'boom'};
      final container = makeContainer();

      await expectLater(
        container.read(firstPrinciplesProvider(params).future),
        throwsA(isA<DioException>()),
      );
      expect(
        container.read(firstPrinciplesProvider(params)),
        isA<AsyncError>(),
        reason: '兜底成空 analysis 会让界面把空字符串当成 AI 回答',
      );
    });

    test('响应缺字段时进 AsyncError（契约漂移可见）', () async {
      adapter.responseBody = <String, dynamic>{'analysis': '只有分析'};
      final container = makeContainer();

      await expectLater(
        container.read(firstPrinciplesProvider(params).future),
        throwsA(anything),
      );
    });
  });

  group('family 缓存', () {
    test('同一份参数重复读只发一次请求，换参数才重新请求', () async {
      adapter.responseBody = <String, dynamic>{
        'analysis': '分析',
        'cached': false,
      };
      final container = makeContainer();

      await container.read(firstPrinciplesProvider(params).future);
      await container.read(firstPrinciplesProvider(params).future);
      expect(adapter.requests, hasLength(1), reason: '重复 watch 不该重复计费调用');

      await container.read(
        firstPrinciplesProvider(
          const FirstPrinciplesParams(
            questionContent: '另一题',
            correctAnswer: 'D',
          ),
        ).future,
      );
      expect(adapter.requests, hasLength(2));
    });
  });
}
