import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 轻量键值存储的唯一入口（目前承载设置项的持久化）。
///
/// 为什么要抽一层接口而不是各处直接 `SharedPreferences.getInstance()`：
/// 1. **测试**：`SharedPreferences` 走平台通道，单测里要么 `setMockInitialValues`、
///    要么起一个假插件，两种写法都会让「读失败」这类分支没法测。有了这层接口，
///    测试直接 override [preferencesStoreProvider] 就能注入「读抛错」「写抛错」。
/// 2. **失败可控**：读写都可能抛（磁盘满、平台通道没注册、Web 端 localStorage
///    被禁用）。调用方统一按「持久化失败不影响当前状态」处理，见 theme/settings
///    provider 里的 catch。
///
/// 只暴露字符串读写：设置项本身就是枚举，编码成字符串比让接口认识业务枚举更干净。
abstract class PreferencesStore {
  Future<String?> read(String key);

  Future<void> write(String key, String value);
}

/// 生产实现：每次操作都取一次实例。
///
/// `SharedPreferences.getInstance()` 内部有单例缓存，重复调用不会重复读盘；
/// 这里不自己缓存实例，是为了让「换账号 / 清数据后重新初始化」也能拿到新值。
class SharedPreferencesStore implements PreferencesStore {
  const SharedPreferencesStore();

  @override
  Future<String?> read(String key) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(key);
  }

  @override
  Future<void> write(String key, String value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, value);
  }
}

/// 可在测试中 override 的存储实现。
final preferencesStoreProvider = Provider<PreferencesStore>(
  (ref) => const SharedPreferencesStore(),
);

/// 设置项的键。集中放这里，避免「写入用 `theme`、读取用 `theme_mode`」这种
/// 永远读不回来的拼写漂移。
abstract final class PreferencesKeys {
  static const String themeMode = 'theme_mode';
  static const String reviewMode = 'review_mode';
}
