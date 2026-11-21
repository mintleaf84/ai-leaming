/// agent_sets feature 内部的 JSON 读取工具。
///
/// 为什么自带一份、不复用 `features/exam/domain/exam_json.dart` 或
/// `shared/domain/recall_json.dart`：那两份都在头部写明了各自的归属，跨 feature
/// 反向依赖会把两个模块的生命周期绑在一起（试卷加字段时不该牵动 AI 题集）。
/// 这里只留题集实际用到的几个函数，退化规则与那两份保持一致：
///
/// - 字段缺失/类型漂移给退化值，而不是抛 `type 'int' is not a subtype of type 'String'`
///   把整屏打黑；
/// - `null` 与「字段缺失」在可空读取里等价，空串仍然算空串。
///
/// 服务端由另一条 lane 并行实现（契约见 `docs/agent-question-set-plan.md` §4.2），
/// 响应形状在联调前还会动，所以这一层的宽容度就是「不因为一个字段改名就整屏报错」。
library;

import 'dart:convert';

/// 读一个 `Map<String, dynamic>`；非对象返回 null。
Map<String, dynamic>? readMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return null;
}

/// 读整数：接受 `int` / `double`（截断） / 数字字符串。
int readInt(Object? value, {int fallback = 0}) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value.trim()) ?? fallback;
  return fallback;
}

/// 读可空整数：缺字段与 `null` 都得到 null。
int? readNullableInt(Object? value) {
  if (value == null) return null;
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value.trim());
  return null;
}

/// 读浮点数：接受 `num` / 数字字符串。
double readDouble(Object? value, {double fallback = 0}) {
  if (value is double) return value;
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value.trim()) ?? fallback;
  return fallback;
}

/// 读可空浮点数：缺字段与 `null` 都得到 null（用于「还没有成绩」）。
double? readNullableDouble(Object? value) {
  if (value == null) return null;
  if (value is double) return value;
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value.trim());
  return null;
}

/// 读字符串；`num` / `bool` 转成字符串（服务端偶有把 id 当数字回的情形）。
String readString(Object? value, {String fallback = ''}) {
  if (value is String) return value;
  if (value is num || value is bool) return value.toString();
  return fallback;
}

/// 读可空字符串：`null` 只由 `null` 产生（空串仍是空串，不折叠成 null）。
String? readNullableString(Object? value) {
  if (value == null) return null;
  return readString(value);
}

/// 读布尔：接受 `bool` / `0|1` / `"true"|"false"`。
bool readBool(Object? value, {bool fallback = false}) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) {
    final raw = value.trim().toLowerCase();
    if (raw == 'true' || raw == '1') return true;
    if (raw == 'false' || raw == '0') return false;
  }
  return fallback;
}

/// 读字符串数组：非字符串项直接丢弃（服务端契约是 `string[]`）。
///
/// 兼容「JSON 字符串里再放一个数组」的写法：`target_tags` 在库里是 TEXT 列，
/// 外部 Agent 侧的回包很可能把 `'["教育学"]'` 原样吐出来。解析失败按空数组
/// 处理，不抛——标签只影响卡片上的一行小字，不值得让整屏报错。
List<String> readStringList(Object? value) {
  if (value is List) return value.whereType<String>().toList(growable: false);
  if (value is String) {
    final raw = value.trim();
    if (!raw.startsWith('[')) return const <String>[];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is List) {
        return decoded.whereType<String>().toList(growable: false);
      }
    } on FormatException {
      return const <String>[];
    }
  }
  return const <String>[];
}

/// 读数组，逐项用 [mapper] 转换；非对象项丢弃。
List<T> readObjectList<T>(
  Object? value,
  T Function(Map<String, dynamic> json) mapper,
) {
  if (value is! List) return const [];
  final out = <T>[];
  for (final item in value) {
    final map = readMap(item);
    if (map != null) out.add(mapper(map));
  }
  return out;
}

/// 读 ISO 时间字符串并解析；解析不了返回 null（展示层据此隐藏该行）。
DateTime? readDateTime(Object? value) {
  final raw = readNullableString(value);
  if (raw == null || raw.trim().isEmpty) return null;
  return DateTime.tryParse(raw.trim());
}
