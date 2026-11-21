/// 试卷相关的时间/时长格式化（展示层纯函数，便于单测）。
///
/// 为什么不塞进 model：这些是「界面怎么读」的决定（今天/昨天/月日），
/// 与「服务端给了什么」无关；放进 domain 会让 domain 依赖 locale 习惯。
library;

/// 把 ISO 时间变成「今天 14:32 / 昨天 09:10 / 11月18日 / 2025年3月2日」。
///
/// 解析失败返回 null：调用方据此隐藏这一行，而不是显示原始 ISO 字符串。
String? formatExamDateTime(String? iso, {DateTime? now}) {
  if (iso == null || iso.trim().isEmpty) return null;
  final parsed = DateTime.tryParse(iso.trim());
  if (parsed == null) return null;
  final local = parsed.toLocal();
  final reference = now ?? DateTime.now();
  final today = DateTime(reference.year, reference.month, reference.day);
  final day = DateTime(local.year, local.month, local.day);
  final hm =
      '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
  final days = today.difference(day).inDays;
  if (days == 0) return '今天 $hm';
  if (days == 1) return '昨天 $hm';
  if (local.year == reference.year) return '${local.month}月${local.day}日';
  return '${local.year}年${local.month}月${local.day}日';
}

/// 把毫秒时长格式化成「12:34」（超过一小时是「1:02:03」）。
String formatExamDuration(int milliseconds) {
  final total = (milliseconds < 0 ? 0 : milliseconds) ~/ 1000;
  final hours = total ~/ 3600;
  final minutes = (total % 3600) ~/ 60;
  final seconds = total % 60;
  String two(int value) => value.toString().padLeft(2, '0');
  if (hours > 0) return '$hours:${two(minutes)}:${two(seconds)}';
  return '${two(minutes)}:${two(seconds)}';
}

/// 剩余时间（倒计时）文案：「29:58」/「1:00:00」；不限时返回 null。
String? formatExamRemaining(Duration? remaining) {
  if (remaining == null) return null;
  return formatExamDuration(remaining.inMilliseconds);
}

/// 超时说明：「超时 1 分 20 秒」/「超时 35 秒」。
String formatExamOvertime(int overtimeMs) {
  final seconds = (overtimeMs / 1000).ceil().clamp(0, 86400 * 7);
  if (seconds < 60) return '超时 $seconds 秒';
  final minutes = seconds ~/ 60;
  final rest = seconds % 60;
  if (rest == 0) return '超时 $minutes 分';
  return '超时 $minutes 分 $rest 秒';
}
