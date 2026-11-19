import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/compat/contract_compat.dart';

/// `compareVersions` 的边界。
///
/// 这里守的是协商判定里唯一容易写错的一环：版本号是**按段整数比较**，不是字符串
/// 比较（`"1.10" < "1.9"` 字符串比较会得出错误结论），且脏数据不许抛。
void main() {
  group('compareVersions：按段整数比较', () {
    test('1.10 > 1.9（字符串比较会弄反的那一类）', () {
      expect(compareVersions('1.10', '1.9'), 1);
      expect(compareVersions('1.9', '1.10'), -1);
    });

    test('1.0 == 1.0.0（缺段按 0）', () {
      expect(compareVersions('1.0', '1.0.0'), 0);
      expect(compareVersions('1', '1.0.0'), 0);
      expect(compareVersions('1.0.0', '1'), 0);
    });

    test('1.0.1 > 1.0', () {
      expect(compareVersions('1.0.1', '1.0'), 1);
      expect(compareVersions('1.0', '1.0.1'), -1);
    });

    test('多段：1.2.3.4 与 1.2.3 相差在第四段', () {
      expect(compareVersions('1.2.3.4', '1.2.3'), 1);
      expect(compareVersions('1.2.3', '1.2.3.0'), 0);
    });

    test('空串 / 非数字段不抛，按 0 处理', () {
      expect(compareVersions('', ''), 0);
      expect(compareVersions('abc', ''), 0);
      expect(compareVersions('', '1.0.0'), -1);
      expect(compareVersions('1.0.0', ''), 1);
      expect(compareVersions('1.x.3', '1.0.3'), 0);
      // 刻意不剥 `v` 前缀：`v1` 不是数字段 → 0，于是 `v1.0` 被视为 0.0。
      // 服务端只发 `1.0.0` 这种纯数字版本，为此加一条「猜前缀」规则反而会引入歧义。
      expect(compareVersions('v1.0', '1.0'), -1);
    });

    test('首尾空白被忽略（服务端配置里常有空格）', () {
      expect(compareVersions(' 1.0.0 ', '1.0.0'), 0);
    });
  });
}
