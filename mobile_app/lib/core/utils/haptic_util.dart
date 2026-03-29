import 'package:flutter/services.dart';

/// 触感反馈工具类
/// 
/// 用于在应用中提供统一的触感反馈接口，后续可扩展静音模式检测或用户开关。
class HapticUtil {
  HapticUtil._();

  /// 轻微触碰 (如选择选项)
  static Future<void> light() async {
    await HapticFeedback.lightImpact();
  }

  /// 中等触碰 (如切换开关)
  static Future<void> medium() async {
    await HapticFeedback.mediumImpact();
  }

  /// 强烈触碰 (如确认提交)
  static Future<void> heavy() async {
    await HapticFeedback.heavyImpact();
  }

  /// 成功反馈
  static Future<void> success() async {
    // 连续两次轻微震动模拟成功感
    await HapticFeedback.mediumImpact();
    await Future.delayed(const Duration(milliseconds: 50));
    await HapticFeedback.lightImpact();
  }

  /// 错误/长按反馈
  static Future<void> vibrate() async {
    await HapticFeedback.vibrate();
  }

  /// 列表选择反馈
  static Future<void> selection() async {
    await HapticFeedback.selectionClick();
  }
}
