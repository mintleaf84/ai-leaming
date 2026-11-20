import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/compat/contract_compat.dart';
import 'package:mobile_app/core/compat/contract_meta.dart';
import 'package:mobile_app/features/exam/presentation/exam_entry.dart';
import 'package:mobile_app/features/exam/presentation/exam_error_text.dart';
import 'package:mobile_app/features/exam/presentation/exam_format.dart';

DioException _dioError({
  DioExceptionType type = DioExceptionType.badResponse,
  int? status,
  Object? data,
}) {
  final options = RequestOptions(path: '/exam/papers');
  return DioException(
    requestOptions: options,
    type: type,
    response: status == null
        ? null
        : Response<Object?>(
            requestOptions: options,
            statusCode: status,
            data: data,
          ),
  );
}

void main() {
  group('exam_format', () {
    final now = DateTime(2026, 11, 20, 15, 0);

    test('今天 / 昨天带时分，往年带年份，解析失败为 null', () {
      expect(formatExamDateTime('2026-11-20T09:05:00', now: now), '今天 09:05');
      expect(formatExamDateTime('2026-11-19T23:59:00', now: now), '昨天 23:59');
      expect(formatExamDateTime('2026-03-02T08:00:00', now: now), '3月2日');
      expect(formatExamDateTime('2025-03-02T08:00:00', now: now), '2025年3月2日');
      expect(formatExamDateTime(null, now: now), isNull);
      expect(formatExamDateTime('bad-date', now: now), isNull);
      expect(formatExamDateTime('', now: now), isNull);
    });

    test('时长格式：分秒 / 超过一小时 / 负数', () {
      expect(formatExamDuration(0), '00:00');
      expect(formatExamDuration(125000), '02:05');
      expect(formatExamDuration(3723000), '1:02:03');
      expect(formatExamDuration(-5000), '00:00');
    });

    test('剩余时间与超时文案', () {
      expect(formatExamRemaining(null), isNull);
      expect(formatExamRemaining(const Duration(seconds: 65)), '01:05');
      expect(formatExamOvertime(35000), '超时 35 秒');
      expect(formatExamOvertime(80000), '超时 1 分 20 秒');
      expect(formatExamOvertime(120000), '超时 2 分');
      expect(formatExamOvertime(-1), '超时 0 秒');
    });
  });

  group('describeExamError', () {
    test('FormatException 直接用人话', () {
      expect(describeExamError(const FormatException('响应对不上')), '响应对不上');
      expect(
        describeExamError(const FormatException('  ')),
        contains('服务器返回的内容看不懂'),
      );
    });

    test('网络类错误各有各的说法', () {
      expect(
        describeExamError(_dioError(type: DioExceptionType.receiveTimeout)),
        contains('网络超时'),
      );
      expect(
        describeExamError(_dioError(type: DioExceptionType.connectionError)),
        contains('连不上服务器'),
      );
      expect(
        describeExamError(_dioError(type: DioExceptionType.badCertificate)),
        contains('证书'),
      );
      expect(
        describeExamError(_dioError(type: DioExceptionType.cancel)),
        contains('取消'),
      );
      expect(
        describeExamError(_dioError(type: DioExceptionType.unknown)),
        contains('网络好像断了'),
      );
    });

    test('HTTP 状态码：401/403/404/409/5xx', () {
      expect(describeExamError(_dioError(status: 401)), contains('登录已过期'));
      expect(describeExamError(_dioError(status: 403)), contains('没有权限'));
      expect(describeExamError(_dioError(status: 404)), contains('已经不存在'));
      expect(describeExamError(_dioError(status: 409)), contains('作答过'));
      expect(describeExamError(_dioError(status: 503)), contains('503'));
    });

    test('自动组卷凑不满：给出 requested/available 与可执行的出口', () {
      final message = describeExamError(
        _dioError(
          status: 400,
          data: <String, dynamic>{
            'requested': 20,
            'available': 8,
            'shortfall': 12,
          },
        ),
      );
      expect(message, contains('只有 8 道'));
      expect(message, contains('凑不满 20 道'));
      expect(message, contains('减少题量'));
    });

    test('shortfall 包在 error 里也认', () {
      final message = describeExamError(
        _dioError(
          status: 422,
          data: <String, dynamic>{
            'error': <String, dynamic>{'requested': 10, 'available': 3},
          },
        ),
      );
      expect(message, contains('凑不满 10 道'));
    });

    test('其他 400 用服务端 message；没有 message 时给状态码', () {
      expect(
        describeExamError(
          _dioError(
            status: 400,
            data: <String, dynamic>{
              'error': <String, dynamic>{'message': '题目 id 不存在：99'},
            },
          ),
        ),
        '题目 id 不存在：99',
      );
      expect(
        describeExamError(_dioError(status: 400, data: 'oops')),
        contains('400'),
      );
      expect(describeExamError(Exception('boom')), contains('稍后再试'));
    });
  });

  group('examEntryAvailable：能力协商', () {
    ContractDecision decisionWith(
      Set<String> features, {
      ContractCompat? status,
    }) {
      return ContractDecision(
        status: status ?? ContractCompat.ok,
        meta: ContractMeta(contractVersion: 1, features: features),
      );
    }

    test('协商未完成 / 服务端不可达按支持处理（断网不能藏功能）', () {
      expect(examEntryAvailable(null), isTrue);
      expect(
        examEntryAvailable(
          const ContractDecision(status: ContractCompat.serverUnreachable),
        ),
        isTrue,
      );
    });

    test('FEATURES 有 exam 就显示，没有就隐藏', () {
      expect(
        examEntryAvailable(decisionWith(<String>{'recall', 'exam'})),
        isTrue,
      );
      expect(examEntryAvailable(decisionWith(<String>{'recall'})), isFalse);
    });
  });
}
