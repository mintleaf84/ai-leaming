/// exam feature 内部的 JSON 读取工具。
///
/// 为什么不用 codegen：本机不能重跑 `build_runner`（见 lane 说明），所以试卷相关的
/// model 一律手写 `fromJson`（与 `features/recall/`、`features/wrong_book/` 一致）。
///
/// 为什么这里自带一份、不复用 `features/recall/domain/recall_json.dart`：那份文件
/// 在头部写明了「只给 recall 用」，跨 feature 反向依赖会把两个模块的生命周期绑在
/// 一起（回忆自测改字段时不该牵动试卷）。这里只保留试卷实际用到的几个函数，
/// 读取口径与 recall 那份保持同一套退化规则。
///
/// 为什么容错放在这一层：服务端是 zod 校验过的 JSON，形状本身可信；这里做的是
/// **读防御**——字段缺失/类型漂移时给出退化值，而不是在界面层抛
/// `type 'int' is not a subtype of type 'String'` 把整屏打黑。
library;

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

/// 读可空整数：缺字段与 `null` 都得到 null（用于「不限时」这类业务信号）。
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
List<String> readStringList(Object? value) {
  if (value is! List) return const <String>[];
  return value.whereType<String>().toList(growable: false);
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
