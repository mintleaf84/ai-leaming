// 可访问性（a11y）的源码级守卫 + 状态播报的通道级测试。
//
// 为什么用测试而不是文档约定：a11y 的退化是**静默**的。新增一个 `IconButton`
// 忘了写 `tooltip:`，静态分析不报错、界面看着也没坏，只有读屏用户听到一句
// 「按钮」——这类问题在 code review 里几乎抓不住，只能靠机制拦。
//
// 三条规则（对应 2026-11-20 移动端 a11y 补齐）：
// 1. 每个 `IconButton(` 必须在**同一次调用**里给出 `tooltip:` 或 `semanticsLabel:`；
// 2. 可点的 `GestureDetector` / `InkWell`（带 `onTap:`）必须自带 `Semantics(`
//    或子树里有可见 `Text(`——纯手势（拖拽手柄、onTapDown 缩放）不算可点容器；
// 3. 状态播报只走 `core/a11y/status_announcer.dart`（不直接用已废弃的
//    `SemanticsService.announce`），且三条关键路径（判分/同步/加载失败）都在播报。
//
// 复用：注释剥离器来自 `test/navigation_rules_test.dart` 的
// `stripCommentsAndFlatten`——那套词法扫描已经处理了字符串里的 `//`、
// 三引号、raw 字符串，再抄一份必然会漂移。
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/a11y/status_announcer.dart';
import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/shared/widgets/state_views.dart';

import '../navigation_rules_test.dart' show stripCommentsAndFlatten;

/// 白名单：`'<相对路径>#<widget>#<该文件内第 n 个同类 widget，从 0 计>'` → 理由。
///
/// **只减不增**：条数被 [a11yAllowlistBaseline] 钉住，加条会让本测试红。
/// 加条之前先想清楚：是真的「不需要语义」，还是这个控件本来就该有标签。
///
/// 现存 4 条的共同原因：文字在**另一个方法里**（`child: _buildXxx()`），
/// 静态扫描只看得到调用名、看不到里面的 `Text`。这四处都有可见标题文案，
/// 读屏会念出来，不需要再叠一层 `Semantics(label:)`（叠了反而念两遍）。
const a11yAllowlist = <String, String>{
  'lib/features/dashboard/presentation/dashboard_screen.dart#GestureDetector#0':
      '文字在 _buildActionCard 里（「全量题库/探索」），静态扫描跨不过函数边界',
  'lib/features/dashboard/presentation/dashboard_screen.dart#GestureDetector#1':
      '文字在 _buildActionCard 里（「智能复习/开始练习」），静态扫描跨不过函数边界',
  'lib/features/practice/presentation/practice_setup_screen.dart#GestureDetector#0':
      'child 是 _buildModeCard 返回的卡片，模式名与说明都是可见 Text',
  'lib/shared/widgets/animated_option_card.dart#GestureDetector#0':
      'child 是 _buildCard()，选项文字在里面；卡片本身已随选项文本被读出',
};

/// 当前白名单条数基线。**只允许下调**（把条目修掉之后连基线一起改小）。
const a11yAllowlistBaseline = 4;

/// 一条违规：位置 + 说明。
class A11yViolation {
  const A11yViolation(this.where, this.why);

  final String where;
  final String why;

  @override
  String toString() => '$where → $why';
}

/// 从 [openIndex]（必须是 `(`）起截出配平的调用片段，字符串里的括号不计数。
///
/// 为什么不能简单地按 `)` 找：`tooltip: '删除(不可恢复)'`、`Text('a) b')`
/// 这类字符串会让括号计数错位，截出来的片段偏短 → 规则假绿。
String? extractCall(String source, int openIndex) {
  if (openIndex >= source.length || source[openIndex] != '(') return null;
  var depth = 0;
  var i = openIndex;
  while (i < source.length) {
    final char = source[i];
    // 字符串（含三引号 / raw）整段跳过
    final isRaw = char == 'r' &&
        i + 1 < source.length &&
        (source[i + 1] == "'" || source[i + 1] == '"');
    if (isRaw || char == "'" || char == '"') {
      final quoteStart = isRaw ? i + 1 : i;
      final quoteChar = source[quoteStart];
      final triple = source.startsWith(quoteChar * 3, quoteStart);
      final quote = triple ? quoteChar * 3 : quoteChar;
      var j = quoteStart + quote.length;
      while (j < source.length) {
        if (!isRaw && source[j] == r'\' && j + 1 < source.length) {
          j += 2;
          continue;
        }
        if (source.startsWith(quote, j)) {
          j += quote.length;
          break;
        }
        j++;
      }
      i = j;
      continue;
    }
    if (char == '(') depth++;
    if (char == ')') {
      depth--;
      if (depth == 0) return source.substring(openIndex, i + 1);
    }
    i++;
  }
  return null;
}

/// [call] 是否在**本层**（depth == 1）出现了 [argumentName] 这个命名实参。
///
/// 为什么限制在本层：`IconButton(tooltip: ...)` 里嵌一个 `Icon(...)` 无妨，
/// 但反过来——外层没写 tooltip、内层（嵌套的另一个 IconButton）写了——如果
/// 只做子串匹配就会假绿。
bool hasNamedArgumentAtOwnLevel(String call, String argumentName) {
  final pattern = RegExp('\\b$argumentName\\s*:');
  var depth = 0;
  var i = 0;
  while (i < call.length) {
    final char = call[i];
    final isRaw = char == 'r' &&
        i + 1 < call.length &&
        (call[i + 1] == "'" || call[i + 1] == '"');
    if (isRaw || char == "'" || char == '"') {
      final quoteStart = isRaw ? i + 1 : i;
      final quoteChar = call[quoteStart];
      final triple = call.startsWith(quoteChar * 3, quoteStart);
      final quote = triple ? quoteChar * 3 : quoteChar;
      var j = quoteStart + quote.length;
      while (j < call.length) {
        if (!isRaw && call[j] == r'\' && j + 1 < call.length) {
          j += 2;
          continue;
        }
        if (call.startsWith(quote, j)) {
          j += quote.length;
          break;
        }
        j++;
      }
      i = j;
      continue;
    }
    if (char == '(') depth++;
    if (char == ')') depth--;
    if (depth == 1) {
      final match = pattern.matchAsPrefix(call, i);
      if (match != null) return true;
    }
    i++;
  }
  return false;
}

/// 字符串字面量的区间：扫描 `IconButton(` 这类子串时，必须跳过字符串内部，
/// 否则源码里的示例文本（`const s = 'IconButton(...)'`）会被当成真实按钮。
List<(int, int)> _stringRanges(String flat) {
  final ranges = <(int, int)>[];
  var i = 0;
  while (i < flat.length) {
    final char = flat[i];
    final isRaw = char == 'r' &&
        i + 1 < flat.length &&
        (flat[i + 1] == "'" || flat[i + 1] == '"');
    if (isRaw || char == "'" || char == '"') {
      final quoteStart = isRaw ? i + 1 : i;
      final quoteChar = flat[quoteStart];
      final triple = flat.startsWith(quoteChar * 3, quoteStart);
      final quote = triple ? quoteChar * 3 : quoteChar;
      var j = quoteStart + quote.length;
      while (j < flat.length) {
        if (!isRaw && flat[j] == r'\' && j + 1 < flat.length) {
          j += 2;
          continue;
        }
        if (flat.startsWith(quote, j)) {
          j += quote.length;
          break;
        }
        j++;
      }
      ranges.add((i, j));
      i = j;
      continue;
    }
    i++;
  }
  return ranges;
}

bool _insideString(List<(int, int)> ranges, int index) {
  for (final (start, end) in ranges) {
    if (index >= start && index < end) return true;
  }
  return false;
}

/// 规则 1：`IconButton(` 缺 `tooltip:` / `semanticsLabel:`。
List<A11yViolation> findIconButtonViolations(String source, String path) {
  final flat = stripCommentsAndFlatten(source);
  final violations = <A11yViolation>[];
  final strings = _stringRanges(flat);
  var index = 0;
  var ordinal = 0;
  while (true) {
    final found = flat.indexOf('IconButton(', index);
    if (found < 0) break;
    index = found + 1;
    // 字符串里的示例不是真实按钮
    if (_insideString(strings, found)) continue;
    final openIndex = found + 'IconButton'.length;
    final call = extractCall(flat, openIndex);
    if (call == null) continue;
    final key = '$path#$ordinal';
    ordinal++;
    final ok = hasNamedArgumentAtOwnLevel(call, 'tooltip') ||
        hasNamedArgumentAtOwnLevel(call, 'semanticsLabel');
    if (!ok) {
      violations.add(
        A11yViolation(key, 'IconButton 没有 tooltip:/semanticsLabel:（读屏只会念「按钮」）'),
      );
    }
  }
  return violations;
}

/// 可见文字：这几种都算（`RichText` 是「已有账号？立即登录」那种富文本链接）。
final _visibleTextPattern = RegExp(
  r'\b(Text|RichText|TextSpan|SelectableText)\s*[(.]',
);

/// 规则 2：带 `onTap:` 的 `GestureDetector` / `InkWell` 必须自带 `Semantics(`、
/// 被外层 `Semantics(` 包着、或子树里有可见文字。
///
/// 为什么用「调用栈」而不是子串搜索：正确写法有两种——`Semantics` 包在外面
/// （推荐，`label` 与 `onTap` 会合并成一个节点），或者写在里面。只扫子树会把
/// 「包在外面」误判成违规，而那种写法恰恰是对的。
List<A11yViolation> findTappableContainerViolations(
  String source,
  String path,
) {
  final flat = stripCommentsAndFlatten(source);
  final violations = <A11yViolation>[];
  final callStack = <String>[];
  // 每种 widget 各自计数：共用 ordinal 时，新增一个 InkWell 会让后续
  // GestureDetector 的编号整体后移，白名单就错位了。
  final ordinals = <String, int>{};
  var i = 0;

  while (i < flat.length) {
    final char = flat[i];
    // 字符串整段跳过：里面的括号/冒号不是代码
    final isRaw = char == 'r' &&
        i + 1 < flat.length &&
        (flat[i + 1] == "'" || flat[i + 1] == '"');
    if (isRaw || char == "'" || char == '"') {
      final quoteStart = isRaw ? i + 1 : i;
      final quoteChar = flat[quoteStart];
      final triple = flat.startsWith(quoteChar * 3, quoteStart);
      final quote = triple ? quoteChar * 3 : quoteChar;
      var j = quoteStart + quote.length;
      while (j < flat.length) {
        if (!isRaw && flat[j] == r'\' && j + 1 < flat.length) {
          j += 2;
          continue;
        }
        if (flat.startsWith(quote, j)) {
          j += quote.length;
          break;
        }
        j++;
      }
      i = j;
      continue;
    }
    if (char == ')') {
      if (callStack.isNotEmpty) callStack.removeLast();
      i++;
      continue;
    }
    if (char == '(') {
      var j = i - 1;
      while (j >= 0 && RegExp(r'[\w$.]').hasMatch(flat[j])) {
        j--;
      }
      final name = flat.substring(j + 1, i);
      final enclosing = List<String>.of(callStack);
      callStack.add(name);

      if (name == 'GestureDetector' || name == 'InkWell') {
        final call = extractCall(flat, i);
        if (call != null) {
          // 纯手势（只有 onTapDown/onPanUpdate/onTapCancel…）不算「可点容器」：
          // 给它加 button 语义反而会误导读屏用户以为能点。
          final isTappable = hasNamedArgumentAtOwnLevel(call, 'onTap');
          final ordinal = ordinals[name] ?? 0;
          ordinals[name] = ordinal + 1;
          final key = '$path#$name#$ordinal';
          if (isTappable) {
            final hasSemantics = call.contains('Semantics(') ||
                enclosing.contains('Semantics');
            // 只看 child 子树：onTap 里弹出的对话框即使有 Text('确认删除')，
            // 按钮本身在对话框打开前仍然是不可读的。
            final childAt = call.indexOf('child:');
            final childSlice =
                childAt >= 0 ? call.substring(childAt) : call;
            final hasVisibleText = _visibleTextPattern.hasMatch(childSlice);
            if (!hasSemantics && !hasVisibleText) {
              violations.add(
                A11yViolation(
                  key,
                  '$name 可点但没有 Semantics(label:) 也没有可见文字'
                  '（读屏听不出这是干什么的）',
                ),
              );
            }
          }
        }
      }
      i++;
      continue;
    }
    i++;
  }
  return violations;
}

Iterable<File> _libDartFiles() sync* {
  final dir = Directory('lib');
  for (final entity in dir.listSync(recursive: true)) {
    if (entity is File && entity.path.endsWith('.dart')) yield entity;
  }
}

void main() {
  group('扫描器自测（规则本身必须能抓到坏代码）', () {
    test('无 tooltip 的 IconButton 会被抓出来', () {
      final violations = findIconButtonViolations(
        '''IconButton(onPressed: () {}, icon: const Icon(Icons.close))''',
        'lib/x.dart',
      );
      expect(violations, hasLength(1));
      expect(violations.single.where, 'lib/x.dart#0');
    });

    test('tooltip / semanticsLabel 任一条即通过', () {
      expect(
        findIconButtonViolations(
          '''IconButton(tooltip: '关闭', onPressed: () {}, icon: const Icon(Icons.close))''',
          'lib/x.dart',
        ),
        isEmpty,
      );
      expect(
        findIconButtonViolations(
          '''IconButton(semanticsLabel: '关闭', onPressed: () {}, icon: const Icon(Icons.close))''',
          'lib/x.dart',
        ),
        isEmpty,
      );
    });

    test('注释里的 IconButton 不算数', () {
      expect(
        findIconButtonViolations(
          '''// IconButton(onPressed: f, icon: Icon(Icons.close))\nvoid f() {}''',
          'lib/x.dart',
        ),
        isEmpty,
      );
    });

    test('字符串里的括号不会把调用截短（截短会假绿）', () {
      final violations = findIconButtonViolations(
        '''IconButton(onPressed: () {}, icon: const Icon(Icons.close), '''
        '''style: null) // 说明：'(' 半个括号''',
        'lib/x.dart',
      );
      expect(violations, hasLength(1));
    });

    test('字符串里的 IconButton 示例不算真实按钮', () {
      expect(
        findIconButtonViolations(
          '''const example = 'IconButton(icon: Icon(Icons.add))';'''
          '''\nvoid f() {}''',
          'lib/x.dart',
        ),
        isEmpty,
      );
    });

    test('可点容器编号按 widget 类型分别计数（插入另一种类型不错位）', () {
      final violations = findTappableContainerViolations(
        '''Column(children: ['''
        '''InkWell(onTap: a, child: Text('x')), '''
        '''GestureDetector(onTap: b, child: Container()), '''
        '''GestureDetector(onTap: c, child: Container()),'''
        '''])''',
        'lib/x.dart',
      );
      // 只有两个纯图标 GestureDetector 违规，且编号各自从 0 起
      expect(violations.map((v) => v.where).toList(), [
        'lib/x.dart#GestureDetector#0',
        'lib/x.dart#GestureDetector#1',
      ]);
    });

    test('onTap 里弹出的对话框文字不算按钮标签', () {
      final violations = findTappableContainerViolations(
        '''GestureDetector(onTap: () { showDialog(builder: (_) => Text('确认删除')); }, '''
        '''child: Container(child: Icon(Icons.delete)))''',
        'lib/x.dart',
      );
      expect(violations, hasLength(1));
    });

    test('外层缺 tooltip、内层有 tooltip 时仍算违规（不按子串匹配）', () {
      final violations = findIconButtonViolations(
        '''IconButton(onPressed: () {}, icon: IconButton('''
        '''tooltip: 'x', onPressed: () {}, icon: const Icon(Icons.add)))''',
        'lib/x.dart',
      );
      expect(violations, hasLength(1));
      expect(violations.single.where, 'lib/x.dart#0');
    });

    test('纯图标可点容器会被抓出来', () {
      final violations = findTappableContainerViolations(
        '''GestureDetector(onTap: send, child: Container(child: Icon(Icons.send)))''',
        'lib/x.dart',
      );
      expect(violations, hasLength(1));
    });

    test('有 Semantics 或有可见文字的可点容器通过', () {
      expect(
        findTappableContainerViolations(
          '''GestureDetector(onTap: send, child: Semantics('''
          '''button: true, label: '发送', child: Icon(Icons.send)))''',
          'lib/x.dart',
        ),
        isEmpty,
      );
      expect(
        findTappableContainerViolations(
          '''InkWell(onTap: go, child: Text('立即登录'))''',
          'lib/x.dart',
        ),
        isEmpty,
      );
    });

    test('没有 onTap 的纯手势不算可点容器（拖拽手柄不该加 button 语义）', () {
      expect(
        findTappableContainerViolations(
          '''GestureDetector(behavior: HitTestBehavior.opaque, child: Container())''',
          'lib/x.dart',
        ),
        isEmpty,
      );
    });
  });

  group('仓库规则', () {
    test('每个 IconButton 都带 tooltip / semanticsLabel', () {
      final offenders = <A11yViolation>[];
      for (final file in _libDartFiles()) {
        final path = file.path.replaceAll('\\', '/');
        offenders.addAll(
          findIconButtonViolations(file.readAsStringSync(), path),
        );
      }
      final unexpected = offenders
          .where((v) => !a11yAllowlist.containsKey(v.where))
          .toList();
      expect(
        unexpected,
        isEmpty,
        reason: '以下 IconButton 缺语义标签，请补 tooltip:（动词短语，如「返回」「删除」）：\n'
            '${unexpected.join('\n')}',
      );
    });

    test('可点容器自带 Semantics 或可见文字', () {
      final offenders = <A11yViolation>[];
      for (final file in _libDartFiles()) {
        final path = file.path.replaceAll('\\', '/');
        offenders.addAll(
          findTappableContainerViolations(file.readAsStringSync(), path),
        );
      }
      final unexpected = offenders
          .where((v) => !a11yAllowlist.containsKey(v.where))
          .toList();
      expect(
        unexpected,
        isEmpty,
        reason: '以下可点容器没有语义标签也没有可见文字：\n${unexpected.join('\n')}',
      );
    });

    test('白名单只减不增，且每条都有理由', () {
      expect(
        a11yAllowlist.length,
        lessThanOrEqualTo(a11yAllowlistBaseline),
        reason: '白名单只允许缩减：修掉一条就把 a11yAllowlistBaseline 一起调小',
      );
      for (final entry in a11yAllowlist.entries) {
        expect(
          entry.value.trim(),
          isNotEmpty,
          reason: '白名单 ${entry.key} 必须写清「为什么不需要语义」',
        );
      }
    });

    test('状态播报只走 status_announcer（不直接用已废弃的 announce）', () {
      final offenders = <String>[];
      for (final file in _libDartFiles()) {
        final path = file.path.replaceAll('\\', '/');
        if (path == 'lib/core/a11y/status_announcer.dart') continue;
        final flat = stripCommentsAndFlatten(file.readAsStringSync());
        if (flat.contains('SemanticsService.announce(')) {
          offenders.add(path);
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'SemanticsService.announce 已废弃（多窗口不安全），请用 announceStatus()：\n'
            '${offenders.join('\n')}',
      );
    });

    test('三条关键状态路径都在播报（判分 / 同步 / 加载失败）', () {
      const required = {
        'lib/features/practice/presentation/practice_screen.dart': '判分结果',
        'lib/features/settings/presentation/settings_screen.dart': '同步完成',
        'lib/shared/widgets/state_views.dart': '加载失败',
      };
      for (final entry in required.entries) {
        final source = File(entry.key).readAsStringSync();
        expect(
          source.contains('announceStatus('),
          isTrue,
          reason: '${entry.key} 应通过 announceStatus 播报「${entry.value}」',
        );
      }
    });
  });

  group('状态播报真的发到了 accessibility 通道', () {
    late List<String> announced;

    /// 拦住 `flutter/accessibility` 这条 BasicMessageChannel，收集 announce 事件。
    ///
    /// 为什么不用 `SemanticsService` 的返回值：它是 `Future<void>`，成功与否
    /// 看不出来；真正要断言的是「平台侧收到了什么文案」。
    void listenToAnnouncements() {
      announced = <String>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMessageHandler(
        SystemChannels.accessibility.name,
        (ByteData? message) async {
          final decoded = const StandardMessageCodec().decodeMessage(message);
          if (decoded is Map && decoded['type'] == 'announce') {
            final data = decoded['data'] as Map;
            announced.add(data['message'] as String);
          }
          return null;
        },
      );
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMessageHandler(SystemChannels.accessibility.name, null);
      });
    }

    Widget wrap(Widget child) {
      return ScreenUtilInit(
        designSize: const Size(390, 884),
        minTextAdapt: true,
        splitScreenMode: true,
        builder: (BuildContext context, Widget? _) => MaterialApp(
          theme: AppTheme.lightTheme,
          home: Scaffold(body: child),
        ),
      );
    }

    testWidgets('announceStatus 把文案发到 flutter/accessibility', (
      WidgetTester tester,
    ) async {
      listenToAnnouncements();
      await tester.pumpWidget(
        wrap(
          Builder(
            builder: (context) => TextButton(
              onPressed: () => announceStatus(context, '回答正确'),
              child: const Text('触发'),
            ),
          ),
        ),
      );

      await tester.tap(find.text('触发'));
      await tester.pump();

      expect(announced, ['回答正确']);
    });

    testWidgets('加载失败视图挂载即播报（错误态不会被读屏「漏掉」）', (
      WidgetTester tester,
    ) async {
      listenToAnnouncements();
      await tester.pumpWidget(
        wrap(
          AppErrorView(message: '请检查网络后重试', onRetry: () {}),
        ),
      );
      await tester.pump(); // 等 addPostFrameCallback

      expect(announced, ['加载失败。请检查网络后重试']);
    });

    testWidgets('空文案不播报（避免打断读屏）', (WidgetTester tester) async {
      listenToAnnouncements();
      await tester.pumpWidget(
        wrap(
          Builder(
            builder: (context) => TextButton(
              onPressed: () => announceStatus(context, '   '),
              child: const Text('触发'),
            ),
          ),
        ),
      );

      await tester.tap(find.text('触发'));
      await tester.pump();

      expect(announced, isEmpty);
    });
  });
}
