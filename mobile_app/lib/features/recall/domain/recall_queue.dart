import 'recall_json.dart';

/// 今日回忆队列（`GET /recall/queue`）。
///
/// 注意语义：`due` / `fresh` 是**条数**，编号一律从 [ids] 取。
/// 队列是纯查询，同一时刻重复调用结果一致（服务端注释明确了这一点）。
class RecallQueue {
  /// 本次要做的卡片主键，顺序即建议作答顺序（到期优先、按 due 升序，其后是新卡）。
  final List<int> ids;

  /// 到期卡条数（含重测卡）。
  final int due;

  /// 今日投放的新卡条数。
  final int fresh;

  /// 队列总条数 = due + fresh。
  final int total;

  /// 展示用估时（分钟）。
  final int estimatedMinutes;

  /// 连续学习天数（学习日 04:00 切换，以服务端为准）。
  final int streakDays;

  const RecallQueue({
    required this.ids,
    required this.due,
    required this.fresh,
    required this.total,
    required this.estimatedMinutes,
    required this.streakDays,
  });

  /// 空队列（今天没卡时的本地兜底，不要用它冒充服务端结果去覆盖真实状态）。
  static const RecallQueue empty = RecallQueue(
    ids: [],
    due: 0,
    fresh: 0,
    total: 0,
    estimatedMinutes: 0,
    streakDays: 0,
  );

  factory RecallQueue.fromJson(Map<String, dynamic> json) {
    return RecallQueue(
      ids: readIntList(json['ids']),
      due: readInt(json['due']),
      fresh: readInt(json['fresh']),
      total: readInt(json['total']),
      estimatedMinutes: readInt(json['estimatedMinutes']),
      streakDays: readInt(json['streakDays']),
    );
  }

  Map<String, dynamic> toJson() => {
    'ids': List<int>.from(ids),
    'due': due,
    'fresh': fresh,
    'total': total,
    'estimatedMinutes': estimatedMinutes,
    'streakDays': streakDays,
  };

  /// 队列是否为空（以 `ids` 为准：有卡却拿不到编号时服务端契约已破，按空处理）。
  bool get isEmpty => ids.isEmpty;

  /// 第一张卡的 id；空队列为 null。
  int? get firstCardId => ids.isEmpty ? null : ids.first;
}
