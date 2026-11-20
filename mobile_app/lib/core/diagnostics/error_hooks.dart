import 'package:flutter/foundation.dart';

import 'error_log.dart';

/// 安装框架层与平台层的全局错误钩子。
///
/// 为什么单独抽一个函数而不是直接写在 `main()` 里：
/// 1. **可测**——`main()` 一跑就是 `runApp`，widget 测试没法只验「钩子有没有装上」。
///    抽出来后测试可以装钩子、手动调 `FlutterError.onError`，再把全局状态还原；
/// 2. **口径只有一份**——`runZonedGuarded`（zone 内异步异常）留在 `main()`，
///    但 flutter / platform 两条的记录格式在这里统一。
///
/// [log] 只为测试注入，生产走 [ErrorLog.instance]。
void installGlobalErrorHandlers({ErrorLog? log}) {
  final ErrorLog target = log ?? ErrorLog.instance;

  // 框架内同步异常（build/layout/paint、手势回调里抛的）。
  // 记录完仍然交给默认的 presentError：否则红屏和调试期控制台输出都会消失，
  // 开发时反而更难定位。
  FlutterError.onError = (FlutterErrorDetails details) {
    target.add(details.exception, details.stack, kind: 'flutter');
    FlutterError.presentError(details);
  };

  // 引擎/平台侧未捕获异常（比如 Future 未处理的错误走到 root zone）。
  // 返回 true 表示「已处理」，不再走平台默认的崩溃上报路径。
  PlatformDispatcher.instance.onError = (Object error, StackTrace stack) {
    target.add(error, stack, kind: 'platform');
    return true;
  };
}
