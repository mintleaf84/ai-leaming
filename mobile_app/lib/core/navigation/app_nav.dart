/// 全应用的导航入口。
///
/// 为什么要把"跳转"收进一个扩展：Flutter 这套页面此前 41 处 `context.go(...)`、
/// 0 处 `context.push(...)`，导致两个真问题：
///
/// 1. `go` 是**替换当前栈**，所以「详情页返回」没有上一页可回 —— 系统返回键直接
///    退出 App，`context.pop()` 在 go 出来的栈里也无页可 pop（调试期抛 `GoError`，
///    release 下按钮点了没反应）；
/// 2. 每个页面各自决定"回首页"还是"返回上一页"，观感与行为都不一致。
///
/// 现在的模型只有三种意图，别处不要再直接调 `context.go` / `context.pop`：
///
/// - [pushDetail]：进入下一层（详情页、流程页）—— 有返回栈、播平台转场；
/// - [replace]：替换当前位置（登录成功、练习结束去结果页）—— 不该回退；
/// - [backOrHome]：返回上一层；栈里没有上一层时回首页，**永远不会"点了没反应"**。
///
/// `test/navigation_rules_test.dart` 会扫描 `lib/`，出现裸 `context.go(` /
/// `context.pop(` 就让 CI 红。
library;

import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// 路由路径的唯一事实源（避免字符串散落在 20 多个文件里）。
abstract final class AppRoutes {
  static const splash = '/';
  static const login = '/login';
  static const register = '/register';
  static const dashboard = '/dashboard';
  static const questions = '/questions';
  static const practiceSetup = '/practice/setup';
  static const practice = '/practice';
  static const result = '/result';
  static const history = '/history';
  static const knowledge = '/knowledge';
  static const mastery = '/mastery';
  static const settings = '/settings';
  static const chat = '/chat';
  static const wrongBook = '/wrong-book';
  static const recall = '/recall';
  static const profile = '/profile';
  static const pricing = '/pricing';
  static const textbooks = '/textbooks';
  static const questionNew = '/questions/new';
  static const drafts = '/drafts';
  static const exam = '/exam';
  static const agentSets = '/agent-sets';

  static String historyDetail(String sessionId) => '/history/$sessionId';
  static String textbookDetail(int textbookId) => '/textbooks/$textbookId';
  static String questionEdit(String questionId) =>
      '/questions/$questionId/edit';
  static String draftDetail(String draftId) => '/drafts/$draftId';
  static String examPaper(int paperId) => '/exam/paper/$paperId';
  static String examSession(String sessionId) =>
      '/exam/session/${Uri.encodeComponent(sessionId)}';
  static String agentSet(int setId) => '/agent-sets/$setId';
}

extension AppNav on BuildContext {
  /// 进入下一层：详情、流程。可用 [backOrHome] 或系统返回键回到上一页。
  ///
  /// 返回 `void` 而不是 Future：所有调用点都是 `onTap: () => ...`，
  /// 保留 Future 只会触发 `unawaited_futures` 且没人真的 await。
  void pushDetail(String location, {Object? extra, VoidCallback? onReturn}) {
    final navigation = push<Object?>(location, extra: extra);
    if (onReturn == null) {
      unawaited(navigation);
      return;
    }
    // 页面被 push 之后仍然挂载（这是有返回栈的代价）：列表页要在这里失效缓存，
    // 否则"从详情/练习返回"会看到旧数据
    unawaited(navigation.whenComplete(onReturn));
  }

  /// 替换当前位置（登录成功、练习结束、退出登录）。不留返回栈。
  void replace(String location, {Object? extra}) {
    go(location, extra: extra);
  }

  /// 返回上一层；栈里没有上一层时回 [fallback]（默认首页）。
  ///
  /// 用 `canPop()` 而不是直接 `pop()`：`/practice` 可能是被 `replace` 进来的
  /// （结果页「再来一轮」），此时栈里只有一页，直接 pop 会抛错。
  void backOrHome({String fallback = AppRoutes.dashboard}) {
    if (canPop()) {
      pop();
      return;
    }
    go(fallback);
  }
}
