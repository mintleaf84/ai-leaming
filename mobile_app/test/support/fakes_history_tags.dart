/// 练习历史「模式标签」测试用的条目构造器。
///
/// 只造 `/history` 列表项需要的字段（服务端 `SessionHistoryItem` 的形状），
/// 不碰 `fake_providers.dart` 里共享的历史桩：那边的条目固定 `random`，
/// 改它会牵动别的屏的用例。
Map<String, dynamic> historyItemJson({
  required String id,
  String? practiceMode,
  int accuracy = 80,
  int totalQuestions = 10,
}) {
  return <String, dynamic>{
    'id': id,
    'sessionName': '综合练习',
    'totalQuestions': totalQuestions,
    'correctCount': (totalQuestions * accuracy / 100).round(),
    'createdAt': '2026-11-20T09:30:00.000Z',
    'accuracy': accuracy,
    // 故意允许缺省：老会话（或将来新增字段前的行）没有 practiceMode
    if (practiceMode != null) 'practiceMode': practiceMode,
  };
}
