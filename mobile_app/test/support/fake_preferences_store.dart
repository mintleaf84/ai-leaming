import 'package:mobile_app/core/storage/preferences.dart';

/// 内存版 [PreferencesStore]：不碰 `shared_preferences` 的平台通道。
///
/// 三个能力对应测试里要守的三条线：
/// - [values] 预置「上次运行留下的值」，验证启动恢复；
/// - [readError] / [writeError] 模拟磁盘/通道故障，验证「读失败回默认、
///   写失败不回滚界面」；
/// - [writes] 记录每次写入，验证「切换即落盘」而不是只在内存里改。
class FakePreferencesStore implements PreferencesStore {
  FakePreferencesStore({
    Map<String, String>? initial,
    this.readError,
    this.writeError,
  }) : values = <String, String>{...?initial};

  final Map<String, String> values;

  /// 非 null 时 [read] 直接抛出（用来验证兜底）。
  Object? readError;

  /// 非 null 时 [write] 直接抛出（用来验证「写失败不回滚」）。
  Object? writeError;

  final List<MapEntry<String, String>> writes = <MapEntry<String, String>>[];

  @override
  Future<String?> read(String key) async {
    final error = readError;
    if (error != null) throw error;
    return values[key];
  }

  @override
  Future<void> write(String key, String value) async {
    final error = writeError;
    if (error != null) throw error;
    values[key] = value;
    writes.add(MapEntry<String, String>(key, value));
  }
}
