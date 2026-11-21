import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/agent_sets/presentation/agent_sets_error_text.dart';
import 'package:mobile_app/features/practice/data/practice_repository_impl.dart';

/// 错误文案：三种 `catch` 里「命中明确业务错误」那一类必须说人话。
///
/// 这里的断言不看具体措辞的情绪，只看**分派是否正确**（401 说登录、404 说题没了、
/// 5xx 带状态码、断网说网络），以及服务端自带 message 时优先用它——用户看到的
/// 一句话就是排查的入口，DioException.toString() 会把 URL 和响应体喷到界面上。
void main() {
  DioException withStatus(int status, {Object? data}) {
    final options = RequestOptions(path: '/agent-sets/1');
    return DioException(
      requestOptions: options,
      type: DioExceptionType.badResponse,
      response: Response<Object?>(
        requestOptions: options,
        statusCode: status,
        data: data,
      ),
    );
  }

  DioException typeOnly(DioExceptionType type) {
    return DioException(
      requestOptions: RequestOptions(path: '/agent-sets/1'),
      type: type,
    );
  }

  test('FormatException 用自带的路径说明，不被折叠成「出了点问题」', () {
    expect(
      describeAgentSetsError(
        const FormatException('GET /agent-sets 返回的不是 JSON 对象'),
      ),
      'GET /agent-sets 返回的不是 JSON 对象',
    );
    // 没有 message 的 FormatException 也要给一句能看的
    expect(describeAgentSetsError(const FormatException('')), contains('服务器'));
  });

  test('超时 / 断网 / 证书 / 取消各有各的说法', () {
    expect(
      describeAgentSetsError(typeOnly(DioExceptionType.connectionTimeout)),
      contains('超时'),
    );
    expect(
      describeAgentSetsError(typeOnly(DioExceptionType.receiveTimeout)),
      contains('超时'),
    );
    expect(
      describeAgentSetsError(typeOnly(DioExceptionType.connectionError)),
      contains('连不上'),
    );
    expect(
      describeAgentSetsError(typeOnly(DioExceptionType.badCertificate)),
      contains('证书'),
    );
    expect(
      describeAgentSetsError(typeOnly(DioExceptionType.cancel)),
      contains('取消'),
    );
    expect(
      describeAgentSetsError(typeOnly(DioExceptionType.unknown)),
      contains('网络'),
    );
  });

  test('状态码分派：401/403/404/409 各自指向正确的动作', () {
    expect(describeAgentSetsError(withStatus(401)), contains('登录'));
    expect(describeAgentSetsError(withStatus(403)), contains('权限'));
    expect(describeAgentSetsError(withStatus(404)), contains('不存在'));
    expect(describeAgentSetsError(withStatus(409)), contains('刷新'));
  });

  test('400/422 优先用服务端 message（如「这套题没有可做的题了」）', () {
    expect(
      describeAgentSetsError(
        withStatus(
          400,
          data: <String, dynamic>{
            'error': <String, dynamic>{'message': '这套题没有可做的题了'},
          },
        ),
      ),
      '这套题没有可做的题了',
    );
    // 没有 message 时给一句可行动的兜底
    expect(describeAgentSetsError(withStatus(422)), contains('刷新'));
  });

  test('5xx 带状态码；其余状态码回落通用文案', () {
    expect(describeAgentSetsError(withStatus(503)), contains('503'));
    expect(describeAgentSetsError(withStatus(418)), contains('418'));
    // 连状态码都没有（代理层异常）：不拼 null，给稳定文案
    expect(
      describeAgentSetsError(
        DioException(
          requestOptions: RequestOptions(path: '/agent-sets/1'),
          type: DioExceptionType.badResponse,
        ),
      ),
      contains('异常'),
    );
  });

  test('服务端根级 message 也认', () {
    expect(
      describeAgentSetsError(
        withStatus(400, data: <String, dynamic>{'message': '缺少批次号'}),
      ),
      '缺少批次号',
    );
  });

  test('未知异常不泄漏异常原文', () {
    final text = describeAgentSetsError(StateError('FileSystemException: x'));
    expect(text, '出了一点问题，稍后再试。');
    expect(text, isNot(contains('FileSystemException')));
  });

  test('判分失败优先用业务异常自带的人话（离线缓存不可用）', () {
    expect(
      describeAgentSetAnswerError(
        const OfflineCacheUnavailable('本地题库已过期，请联网后重试'),
      ),
      '本地题库已过期，请联网后重试',
    );
    // 其余异常仍走题集自己的分派
    expect(describeAgentSetAnswerError(withStatus(404)), contains('不存在'));
  });
}
