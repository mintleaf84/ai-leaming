import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/compat/contract_meta.dart';

/// `ContractMeta.fromJson` 的宽容解析。
///
/// 协商端点是客户端**最先**打的一个请求，它解析失败 = 启动即失败。所以这里的
/// 断言方向刻意全是「缺字段也得出一个可用的对象」，而不是「缺字段要报错」。
void main() {
  group('完整响应', () {
    test('五个字段全部读到', () {
      final meta = ContractMeta.fromJson(const <String, dynamic>{
        'contractVersion': 1,
        'minClientVersion': '1.0.0',
        'latestClientVersion': '1.2.0',
        'downloadUrl': 'https://example.com/app-release.apk',
        'features': ['questions', 'practice', 'recall'],
      });

      expect(meta.contractVersion, 1);
      expect(meta.minClientVersion, '1.0.0');
      expect(meta.latestClientVersion, '1.2.0');
      expect(meta.downloadUrl, 'https://example.com/app-release.apk');
      expect(meta.features, {'questions', 'practice', 'recall'});
      expect(meta.supports('recall'), isTrue);
      expect(meta.supports('chat'), isFalse);
    });
  });

  group('字段缺失', () {
    test('空对象：版本 0、其余 null、能力空集', () {
      final meta = ContractMeta.fromJson(const <String, dynamic>{});
      expect(meta.contractVersion, 0);
      expect(meta.minClientVersion, isNull);
      expect(meta.latestClientVersion, isNull);
      expect(meta.downloadUrl, isNull);
      expect(meta.features, isEmpty);
      expect(meta.supports('questions'), isFalse);
    });

    test('downloadUrl 显式为 null（服务端未配置 MOBILE_APK_URL 的正常形状）', () {
      final meta = ContractMeta.fromJson(const <String, dynamic>{
        'contractVersion': 1,
        'minClientVersion': '1.0.0',
        'latestClientVersion': '1.0.0',
        'downloadUrl': null,
        'features': <String>[],
      });
      expect(meta.downloadUrl, isNull);
      expect(meta.contractVersion, 1);
      expect(meta.features, isEmpty, reason: '空 features 是合法形状，不是错误');
    });

    test('downloadUrl 是空串时也归 null（否则 if(url) 判断形同虚设）', () {
      final meta = ContractMeta.fromJson(const <String, dynamic>{
        'downloadUrl': '   ',
      });
      expect(meta.downloadUrl, isNull);
    });

    test('features 缺失 / 不是数组 / 含空值都不炸', () {
      expect(
        ContractMeta.fromJson(const <String, dynamic>{
          'features': null,
        }).features,
        isEmpty,
      );
      expect(
        ContractMeta.fromJson(const <String, dynamic>{
          'features': 'questions',
        }).features,
        isEmpty,
      );
      expect(
        ContractMeta.fromJson(const <String, dynamic>{
          'features': ['questions', '', null, 'recall'],
        }).features,
        {'questions', 'recall'},
      );
    });
  });

  group('多余 / 变形字段', () {
    test('多余字段被忽略', () {
      final meta = ContractMeta.fromJson(const <String, dynamic>{
        'contractVersion': 3,
        'features': ['questions'],
        'somethingNew': {'nested': true},
        'buildNumber': 42,
      });
      expect(meta.contractVersion, 3);
      expect(meta.features, {'questions'});
    });

    test('contractVersion 被网关转成字符串 / double 也能读', () {
      expect(
        ContractMeta.fromJson(const <String, dynamic>{
          'contractVersion': '2',
        }).contractVersion,
        2,
      );
      expect(
        ContractMeta.fromJson(const <String, dynamic>{
          'contractVersion': 1.0,
        }).contractVersion,
        1,
      );
      expect(
        ContractMeta.fromJson(const <String, dynamic>{
          'contractVersion': 'not-a-number',
        }).contractVersion,
        0,
      );
    });
  });

  group('legacy 占位值', () {
    test('版本 0、无能力', () {
      expect(ContractMeta.legacy.contractVersion, 0);
      expect(ContractMeta.legacy.features, isEmpty);
      expect(ContractMeta.legacy.supports('questions'), isFalse);
    });
  });
}
