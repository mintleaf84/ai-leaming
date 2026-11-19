/// 客户端的构建期版本常量（契约协商用）。
///
/// **唯一事实来源是 `pubspec.yaml` 的 `version:`**。这里的 [appVersion] 必须与它
/// 的主版本段逐字一致——`test/contract/openapi_contract_test.dart` 会读 pubspec
/// 解析比对，两处漂移会让门禁直接红（否则「上报版本」和「实际装的包」会各说各话，
/// 而这类不一致在线上永远查不出来）。
///
/// 不含 `+build` 号：`version: 1.0.0+1` 里的 `1` 是构建编号（每次出包递增，
/// 与兼容语义无关），协商只关心 `1.0.0`。
library;

/// 当前 App 版本号（`MAJOR.MINOR.PATCH`，不含构建号）。
const String appVersion = '1.0.0';

/// 这版 App 至少要求服务端达到的契约版本。
///
/// 服务端低于它 = `serverTooOld`：新 App 依赖的字段/端点根本不存在，硬发请求只会
/// 得到 404 / 形状漂移，不如明确告诉用户「先升服务端，或先离线练习」。
const int minServerContract = 1;

/// 本 App 实际验证过的服务端契约上限。
///
/// 服务端高于它 = `clientUnverified`：**不阻断**——服务端按「只加不减」演进，
/// 新服务端服务旧客户端是正常场景；只是提示一次「这版 App 没验证过」。
const int maxKnownServerContract = 1;
