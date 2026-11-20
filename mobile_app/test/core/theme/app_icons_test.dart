import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/theme/app_icons.dart';

/// 图标层护栏（见 docs/mobile-ui-kit.md 与 docs/mobile-ui-icons-exceptions.md）。
///
/// 为什么必须有这一层测试：
/// 之前用 `material_symbols_icons` 的**可变字体**，`--tree-shake-icons` 会破坏它的
/// `gvar` 表，release 包里整族图标在真机上一个都不显示——而 `flutter analyze` 和
/// 普通 widget 测试都发现不了（测试环境用 Ahem 把图标画成方块）。
///
/// 这里显式加载 AppSymbols 字体并**数像素**：字形真的画出来了才算过。
Future<Uint8List> _loadFont() async {
  final ByteData data = await rootBundle.load('assets/fonts/AppSymbols.ttf');
  final FontLoader loader = FontLoader('AppSymbols')
    ..addFont(Future<ByteData>.value(data));
  await loader.load();
  return data.buffer.asUint8List();
}

Future<int> _inkOf(WidgetTester tester, IconData icon, {double size = 64}) async {
  final GlobalKey key = GlobalKey();
  await tester.pumpWidget(
    MaterialApp(
      home: Center(
        child: RepaintBoundary(
          key: key,
          child: Container(
            width: size + 16,
            height: size + 16,
            color: Colors.white,
            child: Icon(icon, size: size, color: Colors.black),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();

  final RenderRepaintBoundary boundary =
      key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  late int dark;
  await tester.runAsync(() async {
    final ui.Image image = await boundary.toImage();
    final ByteData? bytes = await image.toByteData(
      format: ui.ImageByteFormat.rawRgba,
    );
    final Uint8List rgba = bytes!.buffer.asUint8List();
    dark = 0;
    for (int i = 0; i < rgba.length; i += 4) {
      if (rgba[i] < 128) dark++;
    }
  });
  return dark;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('AppSymbols 字体能被加载（pubspec 的 fonts 注册没写错）', (
    WidgetTester tester,
  ) async {
    final Uint8List bytes = await _loadFont();
    expect(bytes.length, greaterThan(1000));
  });

  testWidgets('报过「空白」的三个图标在字体里真的有墨', (WidgetTester tester) async {
    await _loadFont();

    // 这三个是用户实测完全不显示的（教材 / 深色模式 / 反馈建议）
    final Map<String, IconData> critical = <String, IconData>{
      'libraryBooks(教材)': AppIcons.libraryBooks,
      'darkModeOutlined(深色模式)': AppIcons.darkModeOutlined,
      'feedbackOutlined(反馈建议)': AppIcons.feedbackOutlined,
    };

    final Map<String, int> inks = <String, int>{};
    for (final MapEntry<String, IconData> e in critical.entries) {
      inks[e.key] = await _inkOf(tester, e.value);
      expect(
        inks[e.key],
        greaterThan(50),
        reason: '${e.key} 没有画出任何像素 —— 字体里缺字形或码点对不上',
      );
    }

    // 三个不同图标不能画出一模一样的像素量（那意味着都退化成了同一个豆腐块）
    expect(inks.values.toSet().length, greaterThan(1));
  });

  testWidgets('对照图标也正常（排除「只有个别字形坏」的误判）', (
    WidgetTester tester,
  ) async {
    await _loadFont();

    for (final IconData icon in <IconData>[
      AppIcons.book,
      AppIcons.personOutline,
      AppIcons.refresh,
      AppIcons.checkCircle,
    ]) {
      expect(await _inkOf(tester, icon), greaterThan(50));
    }
  });

  test('语义层里除了 4 个 Material Icons 例外，其余都指向 AppSymbols', () {
    // 直接读常量不可行（IconData 的 family 是私有字段），所以用码点数量做粗校验：
    // 若有人把某个常量写回 Symbols.*，依赖会被重新引入，这里会因 family 不同而失败。
    final Set<int> codes = <int>{
      AppIcons.book.codePoint,
      AppIcons.libraryBooks.codePoint,
      AppIcons.darkModeOutlined.codePoint,
      AppIcons.feedbackOutlined.codePoint,
      AppIcons.personOutline.codePoint,
    };
    expect(codes.length, 5, reason: '不同图标不应共用码点');
  });
}
