import 'agent_question_set.dart';

/// 未读/待做的汇总：首页入口角标与「打开 App 时要不要发通知」共用一份。
///
/// 为什么不给「未读」单开一个接口：契约 §4.2 的列表已经带了 `unreadCount`，
/// 多一个端点多一条要联调的形状；题集数量级是「几十套」，一次列表就够算。
class AgentSetInbox {
  /// 所有题集里「没看过」的题数之和。
  final int unreadCount;

  /// 所有题集里「还没做」的题数之和。
  final int pendingCount;

  final int setCount;

  /// 最近一套（列表第一项）的 id 与标题：通知点开时会用，角标不需要。
  final int? latestSetId;
  final String? latestTitle;

  const AgentSetInbox({
    this.unreadCount = 0,
    this.pendingCount = 0,
    this.setCount = 0,
    this.latestSetId,
    this.latestTitle,
  });

  bool get hasUnread => unreadCount > 0;

  /// 角标文案：99 以上折成 `99+`（三位数会把角标撑出圆角）。
  String get badgeLabel => unreadCount > 99 ? '99+' : '$unreadCount';

  /// 首页入口右侧的数值文案：先报未读（那是「有新东西」），没有未读就报剩余。
  String get entryValue {
    if (unreadCount > 0) return '$unreadCount 道未读';
    if (pendingCount > 0) return '$pendingCount 道待做';
    if (setCount == 0) return '还没有';
    return '都看过了';
  }

  factory AgentSetInbox.fromSets(List<AgentQuestionSet> sets) {
    var unread = 0;
    var pending = 0;
    for (final set in sets) {
      unread += set.unreadCount;
      pending += set.pendingCount;
    }
    return AgentSetInbox(
      unreadCount: unread,
      pendingCount: pending,
      setCount: sets.length,
      latestSetId: sets.isEmpty ? null : sets.first.id,
      latestTitle: sets.isEmpty ? null : sets.first.title,
    );
  }
}

/// 本地通知的文案（纯函数：通知内容也要被单测钉住）。
///
/// 只说两件事：有几道新题、来自哪一套。不带「快来做」这类催促——备考期
/// 一天 45 分钟，通知越克制越不容易被关掉。
({String title, String body}) agentSetNotificationText(
  AgentSetInbox inbox, {
  required int newCount,
}) {
  final name = (inbox.latestTitle ?? '').trim();
  final body = name.isEmpty
      ? '有 $newCount 道新题等你做'
      : '有 $newCount 道新题等你做 · 《$name》';
  return (title: 'AI 题集', body: body);
}
