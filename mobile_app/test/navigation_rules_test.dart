// 导航规则的源码级守卫。
//
// 为什么用测试而不是文档约定：这套页面此前 41 处 `context.go(...)`、0 处 push，
// 结果「详情页返回」没有上一页可回、`context.pop()` 点了没反应。这类问题不会让
// 静态分析报错，只会在真机上表现为"按钮不灵"，所以必须靠机制拦住。
//
// 规则只有一条：**页面层不许直接调 go_router 的 `context.go` / `context.push` /
// `context.pop`**，一律走 `core/navigation/app_nav.dart` 里的三种意图
// （pushDetail / replace / backOrHome）。
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 允许直接使用 go_router 的位置：路由表本身与导航封装。
const _allowedFiles = {
  'lib/app_router.dart',
  'lib/core/navigation/app_nav.dart',
};

/// 直接调用的形态（`context.go(` / `context.push(` / `context.pop(` / `GoRouter.of(...).go(`）
final _directCall = RegExp(
  r'context\s*\.\s*(go|push|pushReplacement|pop|canPop)\s*\(',
);

void main() {
  test('页面层不得直接调用 go_router 的 go/push/pop（走 AppNav）', () {
    final libDir = Directory('lib');
    expect(libDir.existsSync(), isTrue, reason: '测试需在 mobile_app/ 下运行');

    final offenders = <String>[];

    for (final entity in libDir.listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      final normalized = entity.path.replaceAll(r'\', '/');
      if (_allowedFiles.contains(normalized)) continue;

      final lines = entity.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        final line = lines[i];
        // 注释里提到这些 API 是允许的（本文件与 app_nav 的说明都这么写）
        final trimmed = line.trimLeft();
        if (trimmed.startsWith('//') || trimmed.startsWith('///')) continue;
        if (_directCall.hasMatch(line)) {
          offenders.add('$normalized:${i + 1}  ${trimmed}');
        }
      }
    }

    expect(
      offenders,
      isEmpty,
      reason:
          '以下位置绕过了导航封装，请改用 context.pushDetail / replace / backOrHome：\n'
          '${offenders.join('\n')}',
    );
  });

  test('路由表引用的路径都来自 AppRoutes 常量（没有裸字符串）', () {
    final source = File('lib/app_router.dart').readAsStringSync();
    final literalPaths = RegExp(r"path:\s*'([^']*)'")
        .allMatches(source)
        .map((m) => m.group(1)!)
        // 子路由用相对段（:id），不属于顶层路径
        .where((path) => path.startsWith('/'))
        .toList();

    expect(
      literalPaths,
      isEmpty,
      reason: '顶层 path 应写成 AppRoutes.xxx，避免同一路径在多处漂移：$literalPaths',
    );
  });
}
