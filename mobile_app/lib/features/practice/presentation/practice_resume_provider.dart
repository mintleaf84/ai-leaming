import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../core/auth/auth_epoch.dart';
import '../../../core/auth/token_util.dart';
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
///
/// 断点**按账号隔离**：载荷带 `userId`，读取时与当前登录账号比对。`practice_resume`
/// 是设备级 key，退出登录不会自动消失；不校验就会出现「B 登录后接着做 A 的练习」。
class PracticeResumeController extends Notifier<PracticeResume?> {
  /// 用户已经手动写过（开始/结束练习）：迟到的读盘结果不许覆盖。
  bool _touched = false;

  Future<void>? _restoreFuture;

  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  @override
  PracticeResume? build() {
    // 登录态一变（登录/换账号/登出）就清掉断点。
    //
    // 这段清理以前写在 `AuthController` 里，等于让 auth 反向 import practice；
    // 现在改成 practice 自己 watch 核心的版本号信号，依赖方向回到
    // practice → core（auth 只知道 core）。
    //
    // 只 `listen` 不 `watch`：断点不该因为登录态变化整份重建再读盘——这里要的
    // 是「变化即作废」，清完保持空状态等下一次练习写入。
    ref.listen<int>(authEpochProvider, (previous, next) {
      if (previous == next) return;
      unawaited(clear());
    });
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

    final resume = PracticeResume.decode(raw);
    if (resume == null) {
      state = null;
      return;
    }

    final owner = await _currentUserId();
    if (!ref.mounted || _touched) return;
    // 没有归属（旧格式断点）或归属不是当前账号：整份丢弃并清 key。
    // 宁可让用户重开一场，也不能让 B 恢复 A 的练习。
    if (resume.userId == null || resume.userId != owner) {
      debugPrint('[Practice] 断点不属于当前账号，丢弃');
      state = null;
      await _clearStored();
      return;
    }

    state = resume;
  }

  Future<String?> _currentUserId() async {
    try {
      final token = await _storage.read(key: 'jwt_token');
      if (token == null || token.isEmpty) {
        return null;
      }
      return TokenUtil.userIdOf(token);
    } catch (error) {
      // 读不到 token 等于「不知道当前账号」：按无归属处理，断点不可恢复。
      debugPrint('[Practice] 读取当前账号失败: $error');
      return null;
    }
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

  /// 清除断点（练习结束 / 用户主动退出 / 开始新的一场 / 登录态变化）。
  ///
  /// 清内存状态先于写盘：即使写盘失败，首页也不该再显示一个已经作废的入口。
  Future<void> clear() async {
    _touched = true;
    state = null;
    await _clearStored();
  }

  Future<void> _clearStored() async {
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
