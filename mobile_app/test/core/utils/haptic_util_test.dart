import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/utils/haptic_util.dart';

/// `HapticUtil` 是 HapticFeedback 的**统一入口**（文档注释：后续可扩展静音模式
/// 检测或用户开关）。这个测试守的线：
///
/// 1. 每个方法映射到**哪个**触感类型。这不是"调用不抛异常"——`light` 和 `medium`
///    走错通道在真机上是"选项点下去没感觉"和"点一下像撞墙"，测试里唯一能钉住的
///    就是发出去的 `HapticFeedbackType.*`；
/// 2. `success()` 必须是**两下**（medium → light），且顺序固定：这是它的全部语义
///    （注释：连续两次轻微震动模拟成功感），少一下或顺序反了就是另一种手感；
/// 3. 平台差异**不在 Dart 层分支**：HapticUtil 只发 `SystemChannels.platform` 的
///    `HapticFeedback.vibrate`，Android/iOS 的差异由引擎与宿主侧映射（iOS 走
///    UIImpactFeedbackGenerator、Android 走 HapticFeedbackConstants）。所以同一
///    意图在各平台发出的消息必须逐字节一致 —— 若有人在 Dart 层加平台分支，这里会红。
///
/// 断言的是平台通道消息，不是"函数返回了 Future"。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final calls = <MethodCall>[];

  setUp(() {
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          calls.add(call);
          return null;
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
    debugDefaultTargetPlatformOverride = null;
  });

  /// 一次调用发出的触感类型；`null` 表示平台默认震动。
  List<Object?> sentTypes() =>
      calls.map((MethodCall call) => call.arguments).toList();

  group('单个触感方法映射到正确的 HapticFeedbackType', () {
    test('light → lightImpact', () async {
      await HapticUtil.light();

      expect(calls, hasLength(1));
      expect(calls.single.method, 'HapticFeedback.vibrate');
      expect(calls.single.arguments, 'HapticFeedbackType.lightImpact');
    });

    test('medium → mediumImpact', () async {
      await HapticUtil.medium();

      expect(calls.single.method, 'HapticFeedback.vibrate');
      expect(calls.single.arguments, 'HapticFeedbackType.mediumImpact');
    });

    test('heavy → heavyImpact', () async {
      await HapticUtil.heavy();

      expect(calls.single.arguments, 'HapticFeedbackType.heavyImpact');
    });

    test('selection → selectionClick', () async {
      await HapticUtil.selection();

      expect(calls.single.arguments, 'HapticFeedbackType.selectionClick');
    });

    test('vibrate → 不带类型参数（平台默认震动）', () async {
      await HapticUtil.vibrate();

      expect(calls.single.method, 'HapticFeedback.vibrate');
      expect(
        calls.single.arguments,
        isNull,
        reason: 'vibrate 对应平台默认震动；带类型参数就变成了另一种手感',
      );
    });
  });

  group('success：两下，先 medium 后 light', () {
    test('发出 medium → light 两条消息', () async {
      await HapticUtil.success();

      expect(calls, hasLength(2), reason: 'success 的语义就是"两下"');
      expect(sentTypes(), <Object?>[
        'HapticFeedbackType.mediumImpact',
        'HapticFeedbackType.lightImpact',
      ]);
    });
  });

  group('平台差异不在 Dart 层', () {
    test('Android/iOS/macOS/Linux/Windows 发出的消息完全一致', () async {
      // Fuchsia 不在列表：不构建，且 Flutter 在 debug 下不允许把它当作目标平台。
      const platforms = <TargetPlatform>[
        TargetPlatform.android,
        TargetPlatform.iOS,
        TargetPlatform.macOS,
        TargetPlatform.linux,
        TargetPlatform.windows,
      ];

      for (final platform in platforms) {
        debugDefaultTargetPlatformOverride = platform;
        calls.clear();

        await HapticUtil.medium();

        expect(sentTypes(), <Object?>[
          'HapticFeedbackType.mediumImpact',
        ], reason: '$platform 上发出了不同的触感消息：平台差异应交给引擎/宿主映射');
      }

      expect(debugDefaultTargetPlatformOverride, isNotNull);
    });
  });
}
