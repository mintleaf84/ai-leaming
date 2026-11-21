import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/auth/token_util.dart';

/// TokenUtil 只做两件事：读 `exp` 判断是否过期、读 `user.id` 打本地数据归属。
///
/// 这个测试守的是三条线：
/// 1. **60s leeway 真的生效**：`exp` 还差 30s 才算到点时就要判过期，否则用户会
///    带着一个"打开页面瞬间就失效"的 token 进主界面，首个请求必然 401；
/// 2. **解析失败一律返回 false / null**：宁可交给服务端 401 兜底，也不要把一个
///    可能有效的 token 提前清掉（用户被迫重登是比一次 401 更差的体验）。所以
///    "不是三段 / payload 非 JSON / 没有 exp / exp 不是 int" 逐条钉住；
/// 3. **不做签名校验**：这里不解 header、不验签，只解 payload —— 谁要是把签名
///    校验塞进来，`header.sig` 全是假值的用例会立刻红。
///
/// token 由本文件用 base64Url 手工拼，不引入第三方 jwt 包：被测代码只用
/// `split('.')` + `base64Url.decode`，用真库反而掩盖了这两步的边界。
void main() {
  /// 把 JSON 编成 base64url（默认去掉 `=` 填充，与真实 JWT 一致）。
  String encodeSegment(Object value, {bool padding = false}) {
    final encoded = base64Url.encode(utf8.encode(jsonEncode(value)));
    return padding ? encoded : encoded.replaceAll('=', '');
  }

  /// 拼一个三段式 token；[payload] 为 null 时该段填一段**不是 JSON** 的字节。
  String makeToken(
    Map<String, dynamic>? payload, {
    bool padding = false,
    String signature = 'signature-not-verified',
  }) {
    final header = encodeSegment(<String, dynamic>{
      'alg': 'HS256',
      'typ': 'JWT',
    }, padding: padding);
    final body = payload == null
        ? base64Url.encode(utf8.encode('this is not json')).replaceAll('=', '')
        : encodeSegment(payload, padding: padding);
    return '$header.$body.$signature';
  }

  /// 以「当前时间 + 偏移」算出 exp（秒级，和 JWT 规范一致）。
  int expAfter(Duration offset) =>
      DateTime.now().add(offset).millisecondsSinceEpoch ~/ 1000;

  group('TokenUtil.isExpired：leeway 边界', () {
    test('已经过期（exp 在 10 分钟前）判过期', () {
      final token = makeToken(<String, dynamic>{
        'exp': expAfter(const Duration(minutes: -10)),
      });

      expect(TokenUtil.isExpired(token), isTrue);
    });

    test('离到期还有 30s：仍在 60s leeway 内，提前判过期', () {
      final token = makeToken(<String, dynamic>{
        'exp': expAfter(const Duration(seconds: 30)),
      });

      expect(
        TokenUtil.isExpired(token),
        isTrue,
        reason: '30s < 60s leeway：不能等真的失效才清，否则首个请求必 401',
      );
    });

    test('离到期还有 90s：超出 leeway，判未过期', () {
      final token = makeToken(<String, dynamic>{
        'exp': expAfter(const Duration(seconds: 90)),
      });

      expect(TokenUtil.isExpired(token), isFalse);
    });

    test('leeway 可覆盖：同一枚 30s 后到期的 token，leeway=0 时未过期', () {
      final token = makeToken(<String, dynamic>{
        'exp': expAfter(const Duration(seconds: 30)),
      });

      expect(TokenUtil.isExpired(token, leeway: Duration.zero), isFalse);
    });

    test('远期 token（1 小时后到期）判未过期', () {
      final token = makeToken(<String, dynamic>{
        'exp': expAfter(const Duration(hours: 1)),
      });

      expect(TokenUtil.isExpired(token), isFalse);
    });

    test('带 base64 填充的 payload 也能解析（normalize 生效）', () {
      final token = makeToken(<String, dynamic>{
        'exp': expAfter(const Duration(minutes: -1)),
      }, padding: true);

      expect(TokenUtil.isExpired(token), isTrue);
    });
  });

  group('TokenUtil.isExpired：解析不了一律返回 false（不误清 token）', () {
    test('不是三段（两段）', () {
      final parts = makeToken(<String, dynamic>{'exp': 1}).split('.');
      expect(TokenUtil.isExpired('${parts[0]}.${parts[1]}'), isFalse);
    });

    test('不是三段（四段）', () {
      expect(TokenUtil.isExpired('a.b.c.d'), isFalse);
    });

    test('空串', () {
      expect(TokenUtil.isExpired(''), isFalse);
    });

    test('payload 不是 JSON', () {
      final token = makeToken(null);
      expect(TokenUtil.isExpired(token), isFalse);
    });

    test('payload 是 JSON 但不是对象（数组）', () {
      final header = encodeSegment(<String, dynamic>{'alg': 'HS256'});
      final body = encodeSegment(<int>[1, 2, 3]);
      expect(TokenUtil.isExpired('$header.$body.sig'), isFalse);
    });

    test('payload 不是合法 base64url', () {
      expect(TokenUtil.isExpired('header.!!!not-base64!!!.sig'), isFalse);
    });

    test('没有 exp 字段', () {
      final token = makeToken(<String, dynamic>{'sub': '7'});
      expect(TokenUtil.isExpired(token), isFalse);
    });

    test('exp 是字符串（类型不对）', () {
      final token = makeToken(<String, dynamic>{
        'exp': '${expAfter(const Duration(minutes: -10))}',
      });
      expect(TokenUtil.isExpired(token), isFalse);
    });

    test('exp 是浮点数（JSON 数字解码成 double）', () {
      final token = makeToken(<String, dynamic>{'exp': 1.7e9});
      expect(TokenUtil.isExpired(token), isFalse);
    });
  });

  group('TokenUtil.userIdOf', () {
    test('user.id 是整数：转成字符串', () {
      final token = makeToken(<String, dynamic>{
        'user': <String, dynamic>{'id': 7, 'username': 'u'},
        'exp': expAfter(const Duration(hours: 1)),
      });

      expect(TokenUtil.userIdOf(token), '7');
    });

    test('user.id 已经是字符串：原样返回', () {
      final token = makeToken(<String, dynamic>{
        'user': <String, dynamic>{'id': 'user-abc'},
      });

      expect(TokenUtil.userIdOf(token), 'user-abc');
    });

    test('user.id 为 0 也算有 id（不能被 falsy 判断吞掉）', () {
      final token = makeToken(<String, dynamic>{
        'user': <String, dynamic>{'id': 0},
      });

      expect(TokenUtil.userIdOf(token), '0');
    });

    test('没有 user 字段 → null', () {
      final token = makeToken(<String, dynamic>{
        'exp': expAfter(const Duration(hours: 1)),
      });

      expect(TokenUtil.userIdOf(token), isNull);
    });

    test('user 不是对象（字符串）→ null', () {
      final token = makeToken(<String, dynamic>{'user': 'not-a-map'});

      expect(TokenUtil.userIdOf(token), isNull);
    });

    test('user 是对象但没有 id → null', () {
      final token = makeToken(<String, dynamic>{
        'user': <String, dynamic>{'username': 'u'},
      });

      expect(TokenUtil.userIdOf(token), isNull);
    });

    test('token 解析不了 → null', () {
      expect(TokenUtil.userIdOf('garbage'), isNull);
      expect(TokenUtil.userIdOf(''), isNull);
    });
  });
}
