import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/theme/app_colors.dart';

import 'pump_screen.dart';

void main() {
  testWidgets('harness 冒烟：主题色层可用、窗口尺寸与字号缩放生效', (tester) async {
    late BuildContext captured;
    await pumpScreen(
      tester,
      Builder(
        builder: (context) {
          captured = context;
          return Text('probe', style: TextStyle(color: context.colors.text));
        },
      ),
      textScale: 1.3,
    );

    expect(tester.view.physicalSize, const Size(375, 667));
    expect(MediaQuery.of(captured).textScaler, const TextScaler.linear(1.3));
    expect(captured.colors.text, isNotNull);
  });
}
