import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/preferences.dart';

/// 一条诊断记录。
///
/// 只承载「异常本身」：时间、来源（flutter / platform / zone）、消息、堆栈。
/// **不记录任何用户内容**（题干、答案、聊天文本）——诊断日志可能被用户复制后
/// 发出来，一旦混入作答内容就是一次数据泄漏。
@immutable
class ErrorLogEntry {
  const ErrorLogEntry({
    required this.at,
    required this.kind,
    required this.message,
    this.stack,
  });

  /// 记录时刻（统一存 UTC，导出时也按 UTC 打印，避免跨时区看不懂）。
  final DateTime at;

  /// 来源标记：`flutter` / `platform` / `zone`，调用方也可自定义。
  final String kind;

  final String message;

  /// 完整堆栈；可能为 null（有些异步错误不带堆栈）。
  final String? stack;

  Map<String, Object?> toJson() {
    return <String, Object?>{
      'at': at.toUtc().toIso8601String(),
      'kind': kind,
      'message': message,
      if (stack != null) 'stack': stack,
    };
  }

  /// 从 JSON 还原；任何字段缺失/类型不对都返回 null，不抛。
  ///
  /// 返回 null 而不是抛异常，是因为调用方（[ErrorLog.load]）面对的是「上次运行
  /// 留下的磁盘数据」，格式漂移、写了一半就崩溃都属正常，整条丢弃即可。
  static ErrorLogEntry? fromJson(Object? json) {
    if (json is! Map) return null;
    final Object? atRaw = json['at'];
    final Object? kindRaw = json['kind'];
    final Object? messageRaw = json['message'];
    final Object? stackRaw = json['stack'];
    if (atRaw is! String || kindRaw is! String || messageRaw is! String) {
      return null;
    }
    if (stackRaw != null && stackRaw is! String) return null;
    final DateTime? at = DateTime.tryParse(atRaw);
    if (at == null) return null;
    return ErrorLogEntry(
      at: at,
      kind: kindRaw,
      message: messageRaw,
      stack: stackRaw as String?,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ErrorLogEntry &&
        other.at == at &&
        other.kind == kind &&
        other.message == message &&
        other.stack == stack;
  }

  @override
  int get hashCode => Object.hash(at, kind, message, stack);
}

/// 本地诊断日志：内存环形缓冲 + 可选落盘。
///
/// 设计取舍：
/// - **有上限**：崩溃可能连续触发（一帧一个异常），无上限的缓冲会把内存吃干，
///   200 条足够覆盖「用户刚遇到问题、立刻来反馈」的窗口；
/// - **最新在前**：设置页与导出都只关心最近的，倒序省一次反转；
/// - **失败不抛**：诊断设施自己抛异常会把「记录问题」变成「制造问题」，
///   所有读写失败只 [debugPrint]；
/// - [ChangeNotifier] 而非不可变状态：全局钩子在 Provider 之外写日志
///   （`ErrorLog.instance`），界面用 `ListenableBuilder` 订阅同一实例即可。
class ErrorLog extends ChangeNotifier {
  ErrorLog({PreferencesStore? store, this.capacity = 200})
    : assert(capacity > 0, '容量必须为正'),
      _store = store ?? const SharedPreferencesStore();

  /// 全局单例：`main.dart` 的钩子直接写它，设置页通过 [errorLogProvider] 读它。
  static final ErrorLog instance = ErrorLog();

  final PreferencesStore _store;

  /// 环形缓冲上限，超过丢最旧。
  final int capacity;

  final List<ErrorLogEntry> _entries = <ErrorLogEntry>[];

  /// 最新在前。
  List<ErrorLogEntry> get entries => List<ErrorLogEntry>.unmodifiable(_entries);

  int get length => _entries.length;

  /// 追加一条；超出 [capacity] 时丢最旧的一条。
  ///
  /// 落盘是「顺手做」的（fire-and-forget）：内存里的记录必须立刻可用，
  /// 不能因为磁盘慢就丢掉这次异常。[persist] 自己吞掉所有异常。
  void add(Object error, StackTrace? stack, {String kind = 'error'}) {
    _entries.insert(
      0,
      ErrorLogEntry(
        at: DateTime.now().toUtc(),
        kind: kind,
        message: error.toString(),
        stack: stack?.toString(),
      ),
    );
    while (_entries.length > capacity) {
      _entries.removeLast();
    }
    notifyListeners();
    unawaited(persist());
  }

  /// 从磁盘读回上次运行留下的记录。失败只打日志。
  Future<void> load() async {
    try {
      final String? raw = await _store.read(PreferencesKeys.diagnosticsLog);
      if (raw == null || raw.isEmpty) return;
      final Object? decoded = jsonDecode(raw);
      if (decoded is! List) {
        debugPrint('ErrorLog.load：磁盘数据不是数组，已忽略');
        return;
      }
      final List<ErrorLogEntry> loaded = <ErrorLogEntry>[];
      for (final Object? item in decoded) {
        final ErrorLogEntry? entry = ErrorLogEntry.fromJson(item);
        if (entry != null) loaded.add(entry);
      }
      if (loaded.isEmpty) return;
      // 内存里已有的（启动后才产生的）更新，排在前面；加载进来的按时间倒序补在后面。
      loaded.sort((a, b) => b.at.compareTo(a.at));
      _entries.addAll(loaded);
      if (_entries.length > capacity) {
        _entries.removeRange(capacity, _entries.length);
      }
      notifyListeners();
    } catch (error) {
      debugPrint('ErrorLog.load 失败：$error');
    }
  }

  /// 落盘当前记录。失败只打日志。
  Future<void> persist() async {
    try {
      await _store.write(
        PreferencesKeys.diagnosticsLog,
        jsonEncode(_entries.map((e) => e.toJson()).toList()),
      );
    } catch (error) {
      debugPrint('ErrorLog.persist 失败：$error');
    }
  }

  /// 纯文本导出，格式：
  /// ```
  /// [2026-11-20T10:00:00Z] flutter: Bad state: boom
  ///   #0      main (package:app/main.dart:12:3)
  /// ```
  String exportText() {
    final StringBuffer buffer = StringBuffer();
    for (final ErrorLogEntry entry in _entries) {
      buffer.writeln(formatEntry(entry));
    }
    return buffer.toString();
  }

  /// 单条记录的纯文本形态（导出与设置页弹窗共用同一套格式）。
  String formatEntry(ErrorLogEntry entry) {
    final StringBuffer buffer = StringBuffer()
      ..write(
        '[${_formatTimestamp(entry.at)}] ${entry.kind}: ${entry.message}',
      );
    final String? firstLine = _firstStackLine(entry.stack);
    if (firstLine != null) buffer.write('\n  $firstLine');
    return buffer.toString();
  }

  /// 清空内存与磁盘。失败只打日志（内存一定清掉）。
  Future<void> clear() async {
    _entries.clear();
    notifyListeners();
    await persist();
  }

  static String _formatTimestamp(DateTime at) {
    final DateTime utc = at.toUtc();
    String two(int value) => value.toString().padLeft(2, '0');
    return '${utc.year.toString().padLeft(4, '0')}-${two(utc.month)}-'
        '${two(utc.day)}T${two(utc.hour)}:${two(utc.minute)}:'
        '${two(utc.second)}Z';
  }

  static String? _firstStackLine(String? stack) {
    if (stack == null) return null;
    for (final String line in stack.split('\n')) {
      final String trimmed = line.trim();
      if (trimmed.isNotEmpty) return trimmed;
    }
    return null;
  }

  @override
  void dispose() {
    // 单例挂在整个 App 生命周期上。widget 测试里每个 ProviderScope 卸载都会
    // dispose 一次，若真把单例销毁，后续用例拿到的就是一个「已销毁的
    // ChangeNotifier」，`add` 会直接抛断言。
    if (!identical(this, instance)) super.dispose();
  }
}

/// 全局唯一的诊断日志。
///
/// 用普通 [Provider]（不 dispose）而不是 `ChangeNotifierProvider`：实例本身是
/// 单例，界面用 `ListenableBuilder` 订阅变更即可，避免 ProviderScope 卸载时
/// 把单例一起销毁。测试里 override 成 `ErrorLog(store: FakePreferencesStore())`。
final Provider<ErrorLog> errorLogProvider = Provider<ErrorLog>(
  (ref) => ErrorLog.instance,
);
