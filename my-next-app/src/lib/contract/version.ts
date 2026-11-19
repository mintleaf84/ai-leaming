/**
 * 客户端-服务端契约的唯一事实来源。
 *
 * 背景：APK 是**唯一会独立变旧**的客户端（自签名、手动安装、用户不一定会升级）。
 * 服务端可以挡旧客户端（返回 426 / 让客户端去下载），但反过来「服务端太旧」
 * 只能由客户端判断 —— 所以 `GET /api/meta` 必须公开、无鉴权、永久稳定。
 *
 * 三条约定：
 * 1. `CONTRACT_VERSION` 是**整数**，只在**不兼容变更**时 +1；不要拿它当 semver，
 *    也不要在兼容变更时进位。客户端做的是 `server.contractVersion >= 需要的值`，
 *    semver 在这里没有意义。
 * 2. `FEATURES` **只增不减**：删能力等于改契约（旧客户端会按能力名去调已消失的
 *    端点），必须同时 bump `CONTRACT_VERSION`。
 * 3. `downloadUrl` 为空时给 `null`，不要给空字符串 —— 客户端据此决定「是否提示
 *    去下载」，空串会让 `if (url)` 之类的判断形同虚设。
 */

/** 不兼容变更才 +1 的整数契约版本。 */
export const CONTRACT_VERSION = 1;

/** 服务端仍愿意服务的最低客户端版本；低于它应提示升级。 */
export const MIN_CLIENT_VERSION = "1.0.0";

/** 当前最新客户端版本；有新版 APK 时更新它。 */
export const LATEST_CLIENT_VERSION = "1.0.0";

/**
 * 读取 APK 下载地址。
 *
 * 之所以是函数而不是模块常量：测试要能显式设置/清除 `MOBILE_APK_URL` 后立即
 * 看到效果，而模块常量在 import 时就被求值，stub 不生效。
 */
export function readMobileApkUrl(): string | null {
  const raw = process.env.MOBILE_APK_URL?.trim();
  return raw ? raw : null;
}

/** 启动期快照（非请求上下文用），取值规则与 `readMobileApkUrl` 一致。 */
export const MOBILE_APK_URL: string | null = readMobileApkUrl();

/**
 * 服务端具备的能力名。
 *
 * 客户端按名字探测能力，不存在则降级；因此名字一旦发布就要当成公开 API 对待。
 * `offline-answers` 挂在 `/api/practice` 下、`chat-sessions` 挂在 `/api/chat` 下，
 * 是子能力而非独立挂载前缀（契约守卫测试里有对应白名单）。
 */
export const FEATURES = [
  "auth",
  "questions",
  "practice",
  "offline-answers",
  "recall",
  "chat",
  "chat-sessions",
  "wrong-book",
  "history",
  "knowledge",
  "mastery",
  "textbook",
  "stats",
  "profile",
  "annotations",
  "billing",
  "feedback",
  "import",
  "pdf-import",
] as const;

export type ContractFeature = (typeof FEATURES)[number];
