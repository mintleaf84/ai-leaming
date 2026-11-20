// 过渡转发（一期）：复习模式（`ReviewMode` / `SettingsState` / `settingsProvider`）
// 已上提到 `lib/core/settings/settings_provider.dart`——它是全局 UI 偏好，
// 偏好 key 本来就在 `core/storage/preferences.dart`，住在 settings feature 里
// 会让 history / practice 反向依赖 settings 的表现层。
// 二期删除本文件并把引用改到
// `package:mobile_app/core/settings/settings_provider.dart`。
export 'package:mobile_app/core/settings/settings_provider.dart';
