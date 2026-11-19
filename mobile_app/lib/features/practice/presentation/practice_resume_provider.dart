import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/storage/preferences.dart';
import '../domain/practice_resume.dart';

/// 未完成练习的断点（首页「继续上次练习」读它）。
///
/// 写入口只有 [PracticeController]：练习开始时落盘、每答一题更新、`reset()`
/// 时清除。界面层只读，不自己拼 JSON——否则「写的是 answered、读的是 index」
/// 这类漂移迟早出现。
///
/// 持久化失败不影响当前状态：断点丢了最多是「不能续练」，不该让正在进行的
/// 练习报错（与 theme/settings 的处理一致）。
class PracticeResumeController extends Notifier<PracticeResume?> {
  /// 用户已经手动写过（开始/结束练习）：迟到的读盘结果不许覆盖。
  bool _touched = false;

  Future<void>? _restoreFuture;

  @override
  PracticeResume? build() {
    unawaited(restore());
    return null;
  }

  /// 从本地存储恢复断点。测试里可以 `await`。
  Future<void> restore() => _restoreFuture ??= _restoreFromStore();

  Future<void> _restoreFromStore() async {
    final String? raw;
    try {
      raw = await ref.read(preferencesStoreProvider).read(
        PreferencesKeys.practiceResume,
      );
    } catch (error) {
      debugPrint('[Practice] 读取断点失败，按「没有断点」处理: $error');
      return;
    }
    if (!ref.mounted || _touched) return;
    state = PracticeResume.decode(raw);
  }

  /// 落盘并更新内存状态。
  Future<void> save(PracticeResume resume) async {
    _touched = true;
    state = resume;
    try {
      final store = ref.read(preferencesStoreProvider);
      await store.write(
        PreferencesKeys.practiceResume,
        jsonEncode(resume.toJson()),
      );
    } catch (error) {
      debugPrint('[Practice] 保存断点失败（本次练习照常进行）: $error');
    }
  }

  /// 清除断点（练习结束 / 用户主动退出 / 开始新的一场）。
  ///
  /// 清内存状态先于写盘：即使写盘失败，首页也不该再显示一个已经作废的入口。
  Future<void> clear() async {
    _touched = true;
    state = null;
    try {
      // 没有删除接口，写空串等价于「没有断点」——[PracticeResume.decode] 对空串返回 null。
      final store = ref.read(preferencesStoreProvider);
      await store.write(PreferencesKeys.practiceResume, '');
    } catch (error) {
      debugPrint('[Practice] 清除断点失败: $error');
    }
  }
}

final practiceResumeControllerProvider =
    NotifierProvider<PracticeResumeController, PracticeResume?>(
      PracticeResumeController.new,
    );
