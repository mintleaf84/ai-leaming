// 导航规则的源码级守卫。
//
// 为什么用测试而不是文档约定：这套页面此前 41 处 `context.go(...)`、0 处 push，
// 结果「详情页返回」没有上一页可回、`context.pop()` 点了没反应。这类问题不会让
// 静态分析报错，只会在真机上表现为"按钮不灵"，所以必须靠机制拦住。
//
// 规则：**页面层不许直接调 go_router 的 go/push/pop**，一律走
// `core/navigation/app_nav.dart` 的三种意图（pushDetail / replace / backOrHome）。
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 允许直接使用 go_router 的位置：路由表、导航封装、401 拦截器（基础设施层）。
const _allowedFiles = {
  'lib/app_router.dart',
  'lib/core/navigation/app_nav.dart',
  'lib/core/network/dio_client.dart',
};

/// 把注释换成空格（**保留字符串里的内容**），再把空白折叠成单个空格。
///
/// 为什么不能简单地按 `//` 切：`final url = 'https://example.org'; context.go(...)`
/// 里 `//` 属于字符串，粗暴切分会把这行后面的真实调用一起删掉、守卫就假绿了。
/// 这里做一个最小的 Dart 词法扫描：单/双引号、三引号、raw 字符串、行注释、块注释。
String stripCommentsAndFlatten(String source) {
  final out = StringBuffer();
  var i = 0;
  final n = source.length;

  void skipToEndOfLine() {
    while (i < n && source[i] != '\n') {
      out.write(' ');
      i++;
    }
  }

  void skipBlockComment() {
    // 已经确认 [i] == '/' 且 [i+1] == '*'
    out.write('  ');
    i += 2;
    while (i < n && !(source[i] == '*' && i + 1 < n && source[i + 1] == '/')) {
      out.write(source[i] == '\n' ? '\n' : ' ');
      i++;
    }
    if (i < n) {
      out.write('  ');
      i += 2;
    }
  }

  void copyString({required String quote, required bool raw}) {
    // 已确认当前位置是引号起始
    out.write(source.substring(i, i + quote.length));
    i += quote.length;
    while (i < n) {
      if (!raw && source[i] == '\\' && i + 1 < n) {
        out.write(source.substring(i, i + 2));
        i += 2;
        continue;
      }
      if (source.startsWith(quote, i)) {
        out.write(quote);
        i += quote.length;
        return;
      }
      out.write(source[i]);
      i++;
    }
  }

  while (i < n) {
    final char = source[i];

    // 行注释
    if (char == '/' && i + 1 < n && source[i + 1] == '/') {
      skipToEndOfLine();
      continue;
    }
    // 块注释
    if (char == '/' && i + 1 < n && source[i + 1] == '*') {
      skipBlockComment();
      continue;
    }
    // raw 字符串：r'...' / r"..."
    if (char == 'r' &&
        i + 1 < n &&
        (source[i + 1] == "'" || source[i + 1] == '"')) {
      out.write('r');
      i++;
      final quoteChar = source[i];
      final triple = source.startsWith(quoteChar * 3, i);
      copyString(quote: triple ? quoteChar * 3 : quoteChar, raw: true);
      continue;
    }
    // 普通字符串（含三引号）
    if (char == "'" || char == '"') {
      final triple = source.startsWith(char * 3, i);
      copyString(quote: triple ? char * 3 : char, raw: false);
      continue;
    }

    out.write(char);
    i++;
  }

  return out.toString().replaceAll(RegExp(r'\s+'), ' ');
}

/// 直接调用形态：
/// - `context.go(...)` / `context.push<T>(...)` / `context.pop()` / `context.canPop()`
/// - `GoRouter.of(context).go(...)`
/// - `appRouter.go(...)`
final _patterns = <RegExp>[
  RegExp(r'\bcontext\s*\.\s*(go|push|pushReplacement|pop|canPop)\s*(<[^>]*>)?\s*\('),
  RegExp(r'\bGoRouter\s*\.\s*of\s*\([^)]*\)\s*\.\s*(go|push|pop)\s*\('),
  RegExp(r'\bappRouter\s*\.\s*(go|push|pop)\s*\('),
];

void main() {
  group('注释剥离器本身', () {
    test('字符串里的 // 不会吞掉同一行后面的真实调用', () {
      final flat = stripCommentsAndFlatten(
        "final url = 'https://example.org'; context.go(AppRoutes.dashboard);",
      );
      expect(flat, contains('context.go('));
    });

    test('行注释与块注释会被替换成空白', () {
      final flat = stripCommentsAndFlatten(
        "// context.go('/a')\n/* context.pop() */\nvoid f() {}",
      );
      expect(flat, isNot(contains('context.go(')));
      expect(flat, isNot(contains('context.pop(')));
    });

    test('跨行调用压平后仍能被识别', () {
      final flat = stripCommentsAndFlatten('context\n  .go(\n  AppRoutes.login);');
      expect(_patterns.first.hasMatch(flat), isTrue);
    });

    test('带类型实参的调用也能被识别', () {
      final flat = stripCommentsAndFlatten('context.push<Object?>(AppRoutes.a);');
      expect(_patterns.first.hasMatch(flat), isTrue);
    });
  });

  test('页面层不得直接调用 go_router 的 go/push/pop（走 AppNav）', () {
    final libDir = Directory('lib');
    expect(libDir.existsSync(), isTrue, reason: '测试需在 mobile_app/ 下运行');

    final offenders = <String>[];

    for (final entity in libDir.listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      final normalized = entity.path.replaceAll('\\', '/');
      if (_allowedFiles.contains(normalized)) continue;

      final flat = stripCommentsAndFlatten(entity.readAsStringSync());
      for (final pattern in _patterns) {
        final match = pattern.firstMatch(flat);
        if (match != null) {
          final start = match.start < 40 ? 0 : match.start - 40;
          offenders.add('$normalized  …${flat.substring(start, match.end)}…');
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

  test('生产路由不得改用 CustomTransitionPage / PageRouteBuilder（会绕过主题过渡）', () {
    // 主题里的 pageTransitionsTheme 只对 MaterialPage 生效；一旦有人给某条路由写了
    // pageBuilder: (c, s) => CustomTransitionPage(...)，那条路由的转场就与全站不一致，
    // 而且不会再跟随 TargetPlatform 的配置。
    final source = stripCommentsAndFlatten(
      File('lib/app_router.dart').readAsStringSync(),
    );
    for (final forbidden in <String>[
      'CustomTransitionPage',
      'PageRouteBuilder',
    ]) {
      expect(
        source.contains(forbidden),
        isFalse,
        reason: 'app_router.dart 出现 $forbidden：转场将绕过 pageTransitionsTheme',
      );
    }
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
