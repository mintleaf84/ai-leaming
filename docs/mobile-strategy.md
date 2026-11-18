# 移动端技术路线决策（2026-11-18）

## 目标（用户原话）

1. Web 端有的功能，手机上也要有；
2. PWA 用起来太卡；
3. 尽量减少维护成本。

## 关键前提：「卡」是 Web 实现成本，不是 PWA 的固有代价

证据见 [`mobile-performance.md`](./mobile-performance.md) §0–§1：

- 按压零反馈：`globals.css:421` 全局 `-webkit-tap-highlight-color: transparent`；`:active` 在 iOS 需等触摸判定，等于失效；
- 每次导航整页 `spring` 重放：`app/template.tsx:7-19`（400–600ms）；
- 滚动掉帧：`MobileNav.tsx:57` 固定底栏 `backdrop-blur-md` 叠在唯一滚动容器上；全仓 117 处 `transition-all` 动模糊层；
- 换题串行：`PracticeClient.tsx:70` `AnimatePresence mode="wait"` + `duration:0.3` → ≥600ms；
- 白等网络：`app/sw.ts:28-39,67` `NetworkFirst` 未设 `networkTimeoutSeconds`，24h 缓存形同虚设；
- 首屏重：`layout.tsx:98-107` 桌面 `AppSidebar` 在手机上仅 CSS 隐藏，SSR + hydration 照跑；
- 规模：`"use client"` 171 文件 / 32,635 行，27 个 `page.tsx` 整页 client。

**推论**：这些成本与"是否 WebView"无关。Capacitor / 原生壳只要仍跑同一套 React，卡感照旧；反之修掉之后，PWA 与 Capacitor 同时受益。

## 方案对比

| 方案                      | 功能对齐                    | 卡不卡           | 维护成本                | 说明                                          |
| ------------------------- | --------------------------- | ---------------- | ----------------------- | --------------------------------------------- |
| PWA（现状）               | 100%                        | 卡（可修）       | 1 套                    | 无需商店，但 iOS 侧限制多                     |
| **Capacitor 包一层**      | **100%**（同一份代码）      | 取决于 P0 是否修 | **1 套**                | Android 侧无 4.2 审核问题；离线用 SQLite 插件 |
| Flutter 追平              | 需重写 11 页 + 6 处功能缺口 | 不卡             | **2 套且永久**          | 与目标 3 直接冲突                             |
| Flutter 壳 + 长尾 WebView | 100%                        | 热路径原生       | 1.5 套 + 双运行时认证桥 | 复杂度换手感                                  |
| React Native / KMP        | 仍要重写 UI                 | 不卡             | 2 套                    | 不解决根问题                                  |

### 决策

**走 Capacitor，单代码库；Flutter 冻结保留（分支不删），仅作为"某页面将来确需 60fps 原生手感"的退路。**

判定依据：三项要求中"维护成本"是硬约束，"卡"可通过修 P0 解决且修复对所有方案都有益，因此没有为"手感"支付双份维护的理由。

## 执行顺序

### 第 1 步：P0 性能修复（任何路线都必须做）

按 `mobile-performance.md` §3 P0 表执行：按压反馈、底栏去 blur、去掉 template scale、SW 加 3s 超时、Button 去 motion、换题改并行。
验收：真机 INP p75 数字对比（`/api/vitals` + `npm run vitals:report`），不做体感判断。

### 第 2 步：Capacitor 壳

- `capacitor.config.ts`：Android 为主；`server.androidScheme = https`；
- 认证：登录后把 `auth_token` 注入 WebView cookie（`@capacitor/core` + `CapacitorCookies`），避免二次登录；
- 原生壳：返回键、状态栏、启动图、触感反馈（`@capacitor/haptics`）；
- 离线：`@capacitor-community/sqlite` 复用 Flutter 侧已验证的模型——`pending_answers(client_key, local_id, is_correct, synced_at)` + `sessionKey = localId` 幂等，后端 `POST /api/practice/offline-answers` 已就位，无需新增接口；
- 构建：沿用 GitHub Actions `ubuntu-latest`，与现有 `android.yml` 合并为一个 workflow（用户偏好：不额外新增 CI workflow）。

### 第 3 步：真机对比与去留

- 同一台手机上对比「PWA / Capacitor / 现有 Flutter APK」三项：冷启动、首屏、答题切换、滚动；
- 若 Capacitor 在刷题页仍不可接受，则该页保留 Flutter 原生实现（其余页面走壳），而不是整体回退 Flutter；
- 若不达标原因是代码成本（预期如此），继续按 `performance.md` 的 T 系列治理，而不是换框架。

## 不做什么

- 不删 `mobile_app/`：冻结在 `feat/mobile-p0-p4` 分支，代码与离线模型作为参考实现；
- 不为移动端补 recall / notes / mindmap / graph 的 JWT 接口——Capacitor 方案下它们天然可用；
- 不做 iOS：无 Mac，签名与打包均不可行。

## 附：Flutter 客户端在冻结前的 4 条兜底修复（2026-11-18）

方向定下后，Flutter 不再投新功能，但下面四条会**静默写错数据**，属于必须先堵的洞：

| # | 问题 | 修复 |
| --- | --- | --- |
| A1 | 已拿到服务端 `sessionId` 的会话，中途断网后再也提交不了（离线只在建会话时生效） | `submitAnswer` 在 `response == null` 时降级为本地判分入队，幂等键 `local_<serverSessionId>`；4xx/5xx 仍原样抛出 |
| A2 | 离线用缓存里的旧答案判分（题目被后台改过会污染掌握度） | `pickRandom` 只取 7 天内刷新的题面；为空/过期时抛 `OfflineCacheUnavailable`，给「请联网同步题库」的可读文案 |
| B1/B2 | 未登录可直接进主界面；Splash 只判 token 非空，不看过期 | 新增 `TokenUtil` 解析 JWT `exp`；GoRouter 加异步 `redirect`；过期 token 先登出再回登录页 |
| D2 | `flutter test` 是 `continue-on-error`，测试红了也不挡合并 | 改为硬闸（打真网用例已在 `dart_test.yaml` 默认跳过）；CI 实测 **26 passed / 2 skipped** |

已知取舍：A1 降级会在补交时于服务端**另开一场** `agent_` 会话（只含断网后的题），历史里会看到同一场练习被拆成两段。这是为了避免与已在线提交的题重复计数而做的选择，不是 bug。
