/// recall 模型的 JSON 读取工具（随 [RecallQueue] 一起上提到 shared/domain）。
///
/// 为什么不用 codegen：本机不能重跑 `build_runner`（见 `AGENTS.md` 与 lane 说明），
/// 所以 recall 的 model 一律手写 `fromJson`/`toJson`（与 `shared/domain/wrong_question.dart` 一致）。
///
/// 为什么把容错收在这一层：服务端是 zod 校验过的 JSON，形状本身可信；这里做的是
/// **读防御**——字段缺失/类型漂移时给出与 web 端 `actions.ts` 同样的退化值，而不是
/// 在 UI 层抛 `type 'int' is not a subtype of type 'String'` 把整屏打黑。
///
/// 这些函数只在 `features/recall/` 内使用，不要拿去当通用工具。
library;

/// 读一个 `Map<String, dynamic>`；非对象返回 null。
Map<String, dynamic>? readMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return null;
}

/// 读整数：接受 `int` / `double`（整数） / 数字字符串。
int readInt(Object? value, {int fallback = 0}) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value.trim()) ?? fallback;
  return fallback;
}

/// 读浮点数：接受 `num` / 数字字符串。
double readDouble(Object? value, {double fallback = 0}) {
  if (value is double) return value;
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value.trim()) ?? fallback;
  return fallback;
}

/// 读字符串；`num` 转成字符串（服务端偶有把 id 当数字回的情形）。
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
List<String> readStringList(Object? value) {
  if (value is! List) return const <String>[];
  return value.whereType<String>().toList(growable: false);
}

/// 读 `string[] | null`：`null` 与缺字段都得到 null，其余按 [readStringList] 处理。
List<String>? readNullableStringList(Object? value) {
  if (value == null) return null;
  if (value is! List) return null;
  return readStringList(value);
}

/// 读整数数组：接受 `num` / 数字字符串，非法项丢弃。
List<int> readIntList(Object? value) {
  if (value is! List) return const <int>[];
  final out = <int>[];
  for (final item in value) {
    if (item is int) {
      out.add(item);
    } else if (item is num) {
      out.add(item.toInt());
    } else if (item is String) {
      final parsed = int.tryParse(item.trim());
      if (parsed != null) out.add(parsed);
    }
  }
  return out;
}

/// 读 `int[] | null`：`null` 与缺字段都得到 null。
///
/// 这个区分很重要：`pendingItems: null` 是「没有待重测条目」的业务信号，
/// 与「空数组」不能混为一谈（`mode` 的推导依赖它）。
List<int>? readNullableIntList(Object? value) {
  if (value == null) return null;
  if (value is! List) return null;
  return readIntList(value);
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
