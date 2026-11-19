import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/constants/api_constants.dart';

void main() {
  group('ApiConstants.isValidBaseUrl', () {
    test('接受 http / https 且带主机名的地址', () {
      expect(ApiConstants.isValidBaseUrl('http://10.0.2.2:3000/api'), true);
      expect(ApiConstants.isValidBaseUrl('https://api.example.com/api'), true);
      expect(ApiConstants.isValidBaseUrl('http://192.168.1.10:3000'), true);
    });

    test('忽略首尾空白', () {
      expect(ApiConstants.isValidBaseUrl('  http://10.0.2.2:3000/api  '), true);
    });

    test('拒绝缺协议头的地址（localhost:3000 会被当成 scheme）', () {
      expect(ApiConstants.isValidBaseUrl('localhost:3000/api'), false);
      expect(ApiConstants.isValidBaseUrl('192.168.1.10:3000/api'), false);
    });

    test('拒绝非 http/https 协议', () {
      expect(ApiConstants.isValidBaseUrl('ftp://api.example.com/api'), false);
      expect(ApiConstants.isValidBaseUrl('ws://api.example.com/api'), false);
    });

    test('拒绝没有主机名或含空白的地址', () {
      expect(ApiConstants.isValidBaseUrl(''), false);
      expect(ApiConstants.isValidBaseUrl('http://'), false);
      expect(ApiConstants.isValidBaseUrl('http://exa mple.com/api'), false);
    });
  });

  group('ApiConstants.normalizeBaseUrl', () {
    test('去掉末尾斜杠，避免与 endpoint 拼接出双斜杠', () {
      expect(
        ApiConstants.normalizeBaseUrl('http://10.0.2.2:3000/api/'),
        'http://10.0.2.2:3000/api',
      );
      expect(
        ApiConstants.normalizeBaseUrl('http://10.0.2.2:3000/api///'),
        'http://10.0.2.2:3000/api',
      );
    });

    test('不改变已规范化的地址', () {
      expect(
        ApiConstants.normalizeBaseUrl('http://10.0.2.2:3000/api'),
        'http://10.0.2.2:3000/api',
      );
    });
  });

  group('ApiConstants.resolveBaseUrl 三级回落', () {
    test('第一级：运行时地址优先于编译期地址', () {
      expect(
        ApiConstants.resolveBaseUrl(
          runtimeBaseUrl: 'http://10.0.2.2:3000/api',
          compileTimeBaseUrl: 'https://build.example.com/api',
        ),
        'http://10.0.2.2:3000/api',
      );
    });

    test('第二级：运行时为空串时回落到编译期地址', () {
      expect(
        ApiConstants.resolveBaseUrl(
          runtimeBaseUrl: '   ',
          compileTimeBaseUrl: 'https://build.example.com/api',
        ),
        'https://build.example.com/api',
      );
    });

    test('第二级：运行时地址格式非法时回落到编译期地址', () {
      expect(
        ApiConstants.resolveBaseUrl(
          runtimeBaseUrl: 'localhost:3000/api',
          compileTimeBaseUrl: 'https://build.example.com/api',
        ),
        'https://build.example.com/api',
      );
    });

    test('第三级：两级都没有可用地址时返回 null（进入待配置状态）', () {
      expect(
        ApiConstants.resolveBaseUrl(runtimeBaseUrl: '', compileTimeBaseUrl: ''),
        isNull,
      );
      expect(
        ApiConstants.resolveBaseUrl(
          runtimeBaseUrl: 'ftp://api.example.com',
          compileTimeBaseUrl: '',
        ),
        isNull,
      );
    });

    test('编译期为 null 时读取编译期常量；未传 dart-define 即空串，不指向任何地址', () {
      final resolved = ApiConstants.resolveBaseUrl(runtimeBaseUrl: '');

      if (ApiConstants.compileTimeBaseUrl.isEmpty) {
        expect(resolved, isNull);
      } else {
        // 有人带 --dart-define 跑测试时按编译期地址生效，同样符合回落规则。
        expect(resolved, ApiConstants.normalizeBaseUrl(ApiConstants.compileTimeBaseUrl));
      }
    });

    test('回落结果统一规范化（去掉末尾斜杠）', () {
      expect(
        ApiConstants.resolveBaseUrl(runtimeBaseUrl: 'http://10.0.2.2:3000/api/'),
        'http://10.0.2.2:3000/api',
      );
      expect(
        ApiConstants.resolveBaseUrl(compileTimeBaseUrl: 'https://build.example.com/api/'),
        'https://build.example.com/api',
      );
    });
  });
}
