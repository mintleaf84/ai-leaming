# 客户端 / 服务端版本兼容（移动端）

> 适用范围：`mobile_app/`（APK，自签名、手动安装、无应用商店强制升级）与本仓库后端。
> Web 前端与后端是**同一次部署**，不存在独立版本，不在本文范围内。
> 相关：`docs/flutter-mobile-plan.md`（P1 契约快照）、`docs/mobile-next-plan.md`（recall）。

## 1. 风险只有一个方向轴，但两个朝向都会坏

手机上的 APK 是唯一会独立变旧的客户端，所以：

| 朝向                  | 场景                             | 服务端能发现吗                                     |
| --------------------- | -------------------------------- | -------------------------------------------------- |
| App 旧 / 服务端新     | 服务端先部署，APK 还没更新       | 能（`minClientVersion`）                           |
| **App 新 / 服务端旧** | 先装包、后端还没部署；或部署回滚 | **不能**——旧服务端不认识新 App，只能客户端自己判断 |

因此协商必须双端都有，且判断依据不对称：服务端管"旧客户端"，客户端管"旧服务端"。

## 2. 契约面：`GET /api/meta`（公开、永久稳定）

```json
{
  "contractVersion": 1,
  "minClientVersion": "1.0.0",
  "latestClientVersion": "1.0.0",
  "downloadUrl": "https://…/app-release.apk",
  "features": [
    "questions",
    "practice",
    "recall",
    "offline-answers",
    "chat-sessions",
    "…"
  ]
}
```

- `contractVersion`：**整数**，只在不兼容变更时 +1（不是 semver，不跟 npm 包版本绑定）。
- `features`：能力清单，**只增不减**；删能力必须同时 +1 `contractVersion`。
- `downloadUrl`：来自部署环境变量 `MOBILE_APK_URL`，未配置时为 `null`。
- 响应 `Cache-Control: no-store`——协商不能吃缓存。
- 这个端点必须**永远不需要鉴权**、永远不删：任何拿到 404 的客户端只能把服务端当成"最旧"。

## 3. 客户端判定（`mobile_app/lib/core/compat/`）

构建期常量（`app_version.dart`）：
`appVersion`（与 `pubspec.yaml` 的 `version` 主段一致，测试锁定）、`minServerContract`（这版 App 要求的最低服务端契约）、`maxKnownServerContract`（本 App 实际验证过的上限）。

| 输入                                            | 判定                | 阻断 | 出口                     |
| ----------------------------------------------- | ------------------- | ---- | ------------------------ |
| `/meta` 取不到（断网 / 5xx / 解析失败）         | `serverUnreachable` | 否   | 直接进入（离线刷题照常） |
| `meta.contractVersion < minServerContract`      | `serverTooOld`      | 是   | 重试 / 先离线练习        |
| `clientVersion < meta.minClientVersion`         | `clientTooOld`      | 是   | 复制下载地址 / 仍然进入  |
| `meta.contractVersion > maxKnownServerContract` | `clientUnverified`  | 否   | 顶部可关闭提示           |
| 其余                                            | `ok`                | 否   | —                        |

**首次绘制不等网络**：闸在加载中一律渲染 App 本体，判定为阻断后再切屏——否则弱网下的冷启动会被一个协商请求拖住。

## 4. 写操作的兼容规则（L0，写进评审清单）

1. **只加不减**：只新增**可选**字段；不改字段名、不改语义；枚举只追加取值，不复用旧值表达新含义。
2. **请求体不加 `.strict()`**：zod 默认 strip 未知字段，新 App 往旧服务端多发字段会被忽略——这是前向兼容的前提，加 `.strict()` 会立刻打掉它（当前 `routes/` 下 0 处 `.strict()`，保持）。
3. **不新增必填字段**；确需必填 → 新开路径或新开字段名，并 +1 `contractVersion`。
4. **状态码语义不许复用**：404 永远表示"不存在/不属于你"，不要拿它表示"版本过旧"。
5. **语义变化必须新路径**（如 `/recall/v2`），旧路径在 `minClientVersion` 覆盖旧包之前不得删除。

## 5. 部署纪律

1. **先部署后端，再分发 APK**（这是唯一几乎零成本的方向）。
2. 回滚后端前，确认回滚后的 `contractVersion` 仍 ≥ 现网 APK 的 `minServerContract`；否则回滚会把自己的手机挡在门外（此时把 `MOBILE_APK_URL` 指向旧版包并接受"仍然进入"的降级）。
3. 上一版 APK 永远保留可下载；`downloadUrl` 指最新。
4. `pubspec.yaml` 的 `version` **每次出包必须递增**，否则上报版本毫无意义。

## 6. 门禁

| 门禁                 | 位置                                                         | 拦住什么                                     |
| -------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| OpenAPI 快照一致性   | CI `contract` job（`npm run contract:check`）                | 后端改了路由却没更新快照                     |
| Flutter 枚举一致性   | CI `Lint & Type Check`（`npm run contract:mobile`）          | 契约给枚举加取值，Flutter 解析器没补分支（映射表：`my-next-app/scripts/contract-mobile-map.json`，归类与理由都在表内；`--report` 列出当前全部契约枚举） |
| Dart 契约断言        | `mobile_app/test/contract/openapi_contract_test.dart`        | 后端**删/改名**了 Flutter 用到的 path 或字段 |
| 归属矩阵             | `my-next-app/src/lib/api/__tests__/ownership-matrix.test.ts` | 新路由没想清归属/越权面                      |
| `/meta` 形状与免鉴权 | `meta.test.ts` / `contract-version.test.ts`                  | 协商端点被人"顺手加鉴权"或字段漂移           |
| 版本常量一致性       | `test/core/compat/*`                                         | `appVersion` 与 `pubspec.yaml` 漂移          |

## 7. 兼容矩阵（每次部署后手工加一行）

| 日期       | 后端 contractVersion | 最低 App 版本 | 验证过的 App 版本 | 备注                       |
| ---------- | -------------------- | ------------- | ----------------- | -------------------------- |
| 2026-11-19 | 1                    | 1.0.0         | 1.0.0（未上真机） | 首次引入协商；真机验收待做 |
