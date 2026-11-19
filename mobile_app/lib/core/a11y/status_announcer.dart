import 'package:flutter/semantics.dart';
import 'package:flutter/widgets.dart';

/// 状态播报：把「屏幕上看不见」的状态变化念给屏幕阅读器用户。
///
/// 适用场景只有三类（见 `test/tool/a11y_rules_test.dart` 的说明）：
/// - 判分结果（点「确认」后答案对错只在选项卡片上变色，读屏用户没有感知）；
/// - 同步完成（离线记录补交结果只出现在 SnackBar 里，SnackBar 关闭后无从回看）；
/// - 加载失败（错误视图是「新插入的节点」，焦点不会自动移过去）。
///
/// 为什么不用 `SemanticsService.announce`：它在 Flutter 3.35 之后被标记为
/// deprecated（不支持多窗口），替代品是 `sendAnnouncement(view, ...)`。这里包一层，
/// 好处是调用点只写文案、不关心 view 与 textDirection，同时测试可以只 mock
/// `SystemChannels.accessibility` 这一条通道。
///
/// 注意：本函数**不**代替可见文案。播报只是补充，视觉层仍需显示同样的信息；
/// 也不要给「每次重建都会播报」的路径加调用（例如 build 里直接调），否则读屏
/// 会被反复打断。
void announceStatus(BuildContext context, String message) {
  if (message.trim().isEmpty) return;
  final view = View.maybeOf(context);
  if (view == null) return;
  final direction = Directionality.maybeOf(context) ?? TextDirection.ltr;
  // 忽略返回的 Future：播报是「尽力而为」，平台不支持时不应影响业务流。
  SemanticsService.sendAnnouncement(view, message, direction);
}
