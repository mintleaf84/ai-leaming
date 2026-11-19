# 移动端下一阶段：剩余工作量盘点与 lanes 划分（2026-11-19）

> 本文件只回答一个问题：**两条在飞的 Flutter 会话之外，还有哪些真没做完的事，先做哪件。**
> 现有计划与进度见 [`flutter-mobile-plan.md`](./flutter-mobile-plan.md)（P0–P5 已基本收口）
> 与 [`mobile-ui-kit.md`](./mobile-ui-kit.md)（M-01–M-11）。

## 0. 正在飞的会话（本 lane 不得触碰）

| 会话 | 分支 / PR                | 已改文件面                                                                                                                          |
| ---- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| A    | `feat/flutter-nav-unified` #225 | `mobile_app/lib/app_router.dart`、各屏导航调用点（统一导航模型与转场）                                                        |
| B    | `feat/mobile-icons` #228（stacked on #227/#226） | `core/theme/app_icons.dart`、**几乎每个 screen** 的图标位、`app_theme.dart`、骨架屏六屏、`pubspec.*` |

**结论：任何要改 `app_router.dart` / 已有 screen / `app_theme.dart` / `pubspec.yaml` 的工作都会撞车。**
新 lane 只能落在「新增文件」上；入口接线（router + dashboard/profile 卡片）留到 B 合入后再做，
或单独提交并预期一次小冲突。

## 1. 剩余工作盘点（有证据，不是凭印象）

| #   | 事项                                     | 证据                                                                                                                     | 是否与在飞会话冲突 | 价值 |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------ | ---- |
| A   | **记忆卡复习（recall）在移动端完全缺失** | `mobile_app/lib/features/` 无 `recall/`；`app_router.dart` 17 条路由无 `/recall`；后端 `/api/external/recall/*` 全为 API Key 作用域，JWT 端无对应面 | 否（新增文件）     | 高   |
| B   | 离线只覆盖练习，recall/聊天在线专属      | `flutter-mobile-plan.md` §11「未做」                                                                                    | 否                 | 中（依赖 A） |
| C   | `cached_questions` 缺 `dimension` 列     | 同上                                                                                                                     | 否                 | 低   |
| D   | APK 从未真正出过包；M-11 体积未实测      | `android.yml` 就绪但未触发；`mobile-ui-kit.md` M-11 待办                                                                 | 否                 | 中（需真人装机） |
| E   | Flutter 侧无障碍从未审计                 | 仅 `register_screen.dart` 有 1 处 `Semantics`；`ux-a11y-audit.md` 只覆盖 Web                                                     | **是**（几乎每屏） | 中   |
| F   | 契约漂移只有后端快照，Dart 侧无断言      | `flutter-mobile-plan.md` §4.3 计划项，`mobile_app/test` 无 openapi 相关                                                        | 否                 | 低   |

## 2. 选 A：记忆卡复习（recall）

**为什么是它**：这是移动端唯一「整块功能缺失」的东西，而不是打磨项。Web 已有完整
FSRS 闭环（`services/recall.ts` 判分/调度、`recall-import.ts` 卡组、`external.ts` 里
已定义好全部协议与幂等键 `clientKey`），后端不缺服务层，缺的只是一张 **JWT 面**：
现有 `/api/external/recall/*` 要求 API Key，Flutter 端只有用户 JWT（同 `offline-answers` 的处境）。

**为什么现在做**：手机上背卡片的场景（通勤）比手机上刷题更成立，而这块目前只能在 Web 用。

**明确不做**（沿用 `flutter-mobile-plan.md` 的边界）：卡组编辑、导入导出、AI 助记、
笔记/思维导图/知识图谱、订阅管理、后台管理。

### 2.1 Phase 1 —— 后端 JWT recall 面（本 lane 第一步）

新增 `my-next-app/src/lib/api/routes/recall.ts`，与 `external.ts` 的 recall 段**共用 service 与 schema 语义**，
身份改为 JWT（与 `practice.ts`、`billing.ts` 一致），挂载到主路由 `/recall`。

最小端点集（按「能完整复习一轮」倒推）：

| 方法   | 路径                          | 复用服务                                          |
| ------ | ----------------------------- | ------------------------------------------------- |
| GET    | `/recall/queue`               | `getTodayQueue` + `computeStreakDays`              |
| GET    | `/recall/decks`               | `listDecks(userId)`                                |
| GET    | `/recall/decks/:deckKey`      | `listDeckCards`                                    |
| GET    | `/recall/cards/:cardId`       | `getCard`                                          |
| POST   | `/recall/reviews`             | `submitReview`（`clientKey` 幂等，原样保留）       |
| POST   | `/recall/cards/:cardId/archive` | `archiveCard`                                    |

硬要求：
1. **不复制判分/调度逻辑**——只在路由层做参数校验与身份透传（`external.ts:1024` 的注释即口径）；
2. `clientKey` 幂等必须透传，否则弱网重试会把 FSRS 推进两次；
3. OpenAPI 快照同步更新（`npm run contract:dump`），否则 CI `contract` job 红；
4. 真实依赖集成测试（仓库硬规则 3）：建卡 → 取队列 → 提交作答 → 重放同 `clientKey` 断言 `duplicate: true` 且 `nextDue` 不变 → 归档。

### 2.2 Phase 2 —— Flutter recall feature（新目录，不动既有屏）

`mobile_app/lib/features/recall/{domain,data,presentation}`，沿用现有 repository + Riverpod 写法：

- domain：`RecallQueue`、`RecallCard`（list/blank 两种 kind、items/blanks）、`RecallReviewResult`（verdicts/rating/nextDue/pendingItems/nextReviewText/duplicate）；
- data：`RecallRepository`（Dio），`clientKey` 由**进入判分屏时生成一次**并随重试复用；
- presentation：队列入口屏（今日 due/fresh/streak）→ 复习屏（提示 → 输入/全没想起 → 判分逐条 ok/miss → 可改判 → 下一张）→ 结算（下次到期提示）；
- **不做**卡组编辑；只读卡组列表与卡片。

### 2.3 Phase 3 —— 接线（等 B 合入）

`app_router.dart` 加 `/recall`，入口放 dashboard 快捷区或 profile；此时再与 #225 的导航模型对齐。
若 #225 已合入，直接按新导航模型写；否则留 TODO 并在 PR 说明。

### 2.4 验收

- 本机：`npm run typecheck && npm run lint:ci && npx vitest run` 绿；`npm run contract:check` 绿；
- Flutter：`flutter analyze` 无新 error、`flutter test` 绿（本机有 SDK，见 `~/.config/opencode/AGENTS.md`）；
- 真机：登录 → 今日队列 N 张 → 做完一轮 → 杀进程重进 streak/到期时间与 Web 一致；
- 幂等：同 `clientKey` 连发 3 次 → Web 端复习日志只有 1 条。

## 3. 未选的三条，为什么先不做

- **D（出包）**：不是代码问题，是「跑一次 workflow + 你在 Windows 机上装一次」。随时可插队，半天内出结果，
  但它不产出新能力，且需要你在场。等 recall 有一个可用版本后一起装一次更划算。
- **E（无障碍）**：价值真实，但**必然撞车**（图标会话已改几乎每屏）。等 B 合入后单开一轮，届时用
  `Semantics`/`MergeSemantics` + 44dp 触摸目标 + 动态字体三项做一次全量过一遍。
- **F（Dart 契约断言）**：三十行单测，等 recall 路由进来后一并加，正好覆盖新端点。

## 4. 与现有分支的关系

- 本 lane 基于 `origin/main`（`dc62b27`），**不包含** #225–#228 的改动；
- 后端文件（`routes/recall.ts`、主路由挂载、快照、测试）与它们零重叠，可独立 PR、先合；
- Flutter 部分新增目录零重叠，只有 Phase 3 的接线需 rebase 到最新 UI 分支后重做。
