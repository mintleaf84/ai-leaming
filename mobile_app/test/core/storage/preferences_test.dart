import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mobile_app/core/storage/preferences.dart';

/// 守的是**生产实现**这一层：抽象与 provider 已经被 theme/settings 的测试
/// 用假 store 覆盖过了，但真正落盘的 `SharedPreferencesStore` 一直没人测——
/// 覆盖率门禁因此在 PR 里拦了它（22%）。
///
/// 这里钉三件事：
/// 1. 写进去的能读回来（键名一致，不会出现"写 theme、读 theme_mode"的漂移）；
/// 2. 没写过的键返回 null，而不是抛异常（首启动路径依赖这个语义）；
/// 3. 覆盖写取最新值（用户反复切主题）。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{}));

  const store = SharedPreferencesStore();

  test('写进去能读回来', () async {
    await store.write(PreferencesKeys.themeMode, 'dark');
    expect(await store.read(PreferencesKeys.themeMode), 'dark');
  });

  test('没写过的键返回 null（首启动不抛）', () async {
    expect(await store.read(PreferencesKeys.reviewMode), isNull);
  });

  test('覆盖写取最新值', () async {
    await store.write(PreferencesKeys.themeMode, 'light');
    await store.write(PreferencesKeys.themeMode, 'system');
    expect(await store.read(PreferencesKeys.themeMode), 'system');
  });

  test('键名常量稳定：改字符串会让老用户设置丢失', () {
    expect(PreferencesKeys.themeMode, 'theme_mode');
    expect(PreferencesKeys.reviewMode, 'review_mode');
  });

  test('两个键互不干扰', () async {
    await store.write(PreferencesKeys.themeMode, 'dark');
    await store.write(PreferencesKeys.reviewMode, 'immersive');
    expect(await store.read(PreferencesKeys.themeMode), 'dark');
    expect(await store.read(PreferencesKeys.reviewMode), 'immersive');
  });
}
