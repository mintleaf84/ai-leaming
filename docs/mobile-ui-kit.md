# 移动端 UI 依赖接入计划（可执行版）

> **用法**：按 §4–§6 的任务卡逐张执行，每张卡自包含（落点 / 改法 / 验收 / 回滚）。
> **配套证据**：§2 依赖约束为 pub.dev API 实测（2026-11-19）；§4.1 为存量代码计数（`feat/mobile` 基线 612f2db）。
> **本版是决策后的版本**：§3 记录了四项已定决策及其代价，不再重复讨论。

---

## 0. 执行约定（先读这一节，30 秒）

- **工作区**：`/public/home/cjb/ai-leaming-wt-mobile`（分支 `feat/mobile`，基线 `origin/main` 612f2db）。
  **不要动** `~/ai-leaming` 主检出，也不要动另外 4 个 worktree（`wt-sandbox` / `wt-cross-rest` / `wt-mockdb` / `wt-recall-races` / `wt-ainative`）。
- **工具链锁死**：Flutter **3.38.4** / Dart **3.10.7**。依据：`mobile_app/pubspec.lock` 的 `sdks:`（`dart: ">=3.10.7"`、`flutter: ">=3.38.4"`）
  与 `.github/workflows/android.yml:42` 的 `flutter-version: "3.38.4"`。**任何为此上调 toolchain 的方案都不在本计划范围内。**
- **本机没有 Flutter/Dart SDK**（`which flutter dart` 为空）。唯一验收通道是 CI 的 `Android / Flutter 静态分析与测试` job：
  `flutter pub get` → `dart run build_runner build --delete-conflicting-outputs` → `flutter analyze --no-fatal-infos` → `flutter test`。
  反馈周期 5–10 分钟。**禁止声称"本地跑过"**，只能贴 CI 日志。
- **每批一个 PR**，提交信息中文 `<type>: <简述>`。依赖统一在 M-01 一次加完，后面只消费不新增，避免三个 PR 抢 `pubspec.lock`。
- **禁止**为过闸新增 `// ignore:`。`analysis_options.yaml` 只排除 `*.g.dart` / `*.freezed.dart`，真实源码全量检查。
- **每个 PR 附三样证据**：analyze/test 输出片段、改动行数、受影响调用点清单。没有证据的"改完更好了"不接受。
- **合并前补核许可证**：pub.dev 逐个确认（`skeletonizer` / `material_symbols_icons`），异常则当批停止。

---

## 1. 范围

三件事，三个批次，互不依赖：

| 批次 | 内容                                                          | 依赖                 | 粗估  |
| ---- | ------------------------------------------------------------- | -------------------- | ----- |
| 1    | 骨架屏改用 `skeletonizer`，且**六屏全部改成"真 widget 骨架"** | —                    | 11.5h |
| 2    | 页面过渡改回平台默认，接 Android 预测性返回                   | 无（不依赖任何新包） | 1.5h  |
| 3    | 129 处 `Icons.*` **全量**换成 Material Symbols                | —                    | 8h    |

---

## 2. 依赖决策（pub.dev API 实测）

| 包                       | 选定版本                      | 包自身环境约束                                                                                               | 与 Flutter 3.38.4 / Dart 3.10.7 | 结论                                                           |
| ------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------- |
| `skeletonizer`           | `^3.0.0`（3.0.0，2026-09-11） | `sdk >=3.7.0`，`flutter >=3.32.0`                                                                            | 兼容                            | **引入**                                                       |
| `material_symbols_icons` | `^4.2960.0`（2026-07-23）     | `sdk >=3.0.0`，`flutter >=3.7.0`                                                                             | 兼容                            | **引入**，体积需实测（M-10）                                   |
| `animations`             | ~~2.2.0~~                     | 2.2.0：`sdk ^3.9.0` / `flutter >=3.35.0`；**3.0.0：`sdk ^3.12.0` / `flutter >=3.44.0` + 依赖 `material_ui`** | 2.2.0 本可用，3.x 不可用        | **不引入**（见 D-1：页面过渡改为跟随平台默认，此包无用武之地） |
| `shimmer`                | 移除                          | —                                                                                                            | —                               | 被 `skeletonizer` 取代（M-05）                                 |
| `state_notifier`         | 移除                          | —                                                                                                            | —                               | `lib/` `test/` 零 import，仅 riverpod 传递引入（D-4）          |

关键坑，留给下一个人：

1. `animations` 的 **3.x 是破坏性迁移**——Material 依赖换成独立包 `material_ui`，与 `material_3_expressive` / `m3e_core` 同一波。
   将来若要 shared element 过渡，必须写 `animations: 2.2.0`，写 `^3.0.0` 会直接把 CI 拖红。
2. `skeletonizer` 3.0.0 **不依赖 `material_ui`**，是两个包里唯一"干净"的。
3. `pubspec.lock` 变更必须提交（CI 走 `flutter pub get`，lock 漂移会导致 `build_runner` 版本变化 → `*.g.dart` 差异）。

---

## 3. 已定决策（含代价，不再讨论）

### D-1 页面过渡：跟随平台默认，不写自定义过渡

- **决策**：Android 用 `PredictiveBackPageTransitionsBuilder`，iOS 保持 `CupertinoPageTransitionsBuilder`；**不使用** `animations` 的 `SharedAxisTransition`，`app_router.dart` 的 19 条 `builder:` **一行不改**。
- **依据**：Flutter 默认 `targetSdkVersion = 36`（`flutter_tools/gradle/.../FlutterExtension.kt:29`），而 Android 15（API 35）起预测性返回对 targetSdk ≥35 **默认启用**，开发者选项开关已移除——系统级预览已经在生效，应用内过渡不配合就会出现"先系统缩放、再自己滑一页"的割裂感。
  `PredictiveBackPageTransitionsBuilder` 由 `PageTransitionsTheme` 生效，而 `CustomTransitionPage` 自己实现 `buildTransitions` 会绕过 theme——这就是原方案拿不到跟手预览的原因。
- **代价**：放弃统一的 SharedAxis 动效；页面过渡观感变成 Android U 的 fade-forwards + 预测性预览。
- **补偿**：`animations` 保留为"以后做 shared element（卡片→详情）时才引入"的备选，版本与方法见 §2 坑 1。

### D-2 骨架屏：六屏全部改"真 widget 骨架"

- **决策**：`Skeletonizer(enabled: true, child: 真实卡片列表)`，六屏（history / history_detail / knowledge / wrong_book / practice / question_list）统一。
- **代价（必须写进 PR 描述）**：比原方案多两步前置——
  1. 这六屏的卡片渲染器现在是 **State 的私有方法**（`_buildHistoryCard`、`_buildCardItem`、`_buildQuestionCard`、`_buildQuestionView`…），
     无法从 `lib/shared/skeletons/` 调用，**必须先抽成公共 widget**；
  2. 每个模型要一个 fake 实例（freezed，required 字段多）。
     所以工作量从 3h 涨到约 11h，且 diff 落在 6 个 feature 的主文件上。
- **收益**：骨架与真实布局永不脱节（改布局不用改骨架），且抽出的卡片 widget 可被单测覆盖（现在 0 条 widget 测试）。
- **风险与栅栏**：fake 数据泄漏到真链路是唯一严重风险 →
  fake 全部集中在 `lib/shared/skeletons/skeletons.dart`，**CI 加一条 grep 栅栏**：`lib/features/**` 出现 `skeletons/skeletons.dart` 即报红。

### D-3 图标：129 处全量替换

- **决策**：`Icons.*` 全部映射到 Material Symbols；**确实没有等价物**的写进 `docs/mobile-ui-icons-exceptions.md` 并在代码留注释，不强行替换（避免语义漂移）。
- **代价**：分布替换（约 8h），且图标语义可能变化，需要真机逐屏核对截图。
- **兜底**：APK 体积增量 > 300KB 则砍到单 family（M-10）。

### D-4 `state_notifier` 直接依赖删除

- **决策**：在 M-05 一并删除。
- **依据**：`grep -rln state_notifier lib test` 为空；仅 riverpod 传递依赖。
- **代价**：`pubspec.lock` 里仍有该包（transitive），`git revert` 可退。

---

## 4. 批次 1：骨架屏（`skeletonizer` + 真 widget 骨架）

### 4.1 现状盘点（改之前先认账）

三套并存的骨架实现，接口各不相同：

| 位置                                                              | 行数 | 实现方式                                                | 调用点                                                                                                                                                       |
| ----------------------------------------------------------------- | ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/shared/widgets/skeleton_loading.dart`                        | 192  | `package:shimmer` + `SkeletonText`/`SkeletonCard`       | `HistorySkeletonList`（history_screen:78）、`KnowledgeSkeletonList`（knowledge_screen:103）、`HistoryDetailSkeletonList`（history_detail_screen:71/124/181） |
| `lib/shared/widgets/skeleton_widgets.dart`                        | 181  | 自写 `ShimmerWrap`/`_ShimmerBox`（AnimationController） | `PracticeSkeleton`（practice_screen:80）、`QuestionListSkeleton`（question_list_screen:125）                                                                 |
| `lib/features/wrong_book/presentation/wrong_book_screen.dart:614` | ~45  | 内联静态灰块（无动效）                                  | `_buildSkeleton()`                                                                                                                                           |

`ShimmerWrap` / `_ShimmerBox`（skeleton_widgets.dart:31 / :6）**全仓零调用点**，约 85 行死代码。

### M-01 依赖引入 ｜0.5h｜无依赖

- **落点**：`mobile_app/pubspec.yaml`。
- **改法**：只加两个包，`animations` 不加（D-1）：
  ```yaml
  skeletonizer: ^3.0.0
  material_symbols_icons: ^4.2960.0
  ```
  `shimmer` / `state_notifier` 暂留（M-05 统一删，避免中间态）。
- **验收**：CI `pub get` 成功；`pubspec.lock` 的 `sdks:` 段未变；`flutter analyze` 仍 0 error。
- **回滚**：只改 pubspec + lock。

### M-02 抽出六屏卡片 widget ｜4h｜依赖 M-01

- **落点**（全部是 State 私有方法，抽成公共 widget，**行为不变**）：

  | 现位置                                  | 现名                                                     | 抽成                                                   |
  | --------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
  | `history_screen.dart:127`               | `_buildHistoryCard(HistoryItem)`                         | `HistoryCard`                                          |
  | `history_detail_screen.dart:447 / :541` | `_buildListQuestionCard` / `_buildImmersiveQuestionCard` | `HistoryQuestionCard`（两态合一，用 `immersive` 参数） |
  | `knowledge_screen.dart:196`             | `_buildCardItem(KnowledgeCard)`                          | `KnowledgeCardView`                                    |
  | `wrong_book_screen.dart:207`            | `_buildQuestionCard(WrongQuestion, bool)`                | `WrongQuestionCard`                                    |
  | `practice_screen.dart:190`              | `_buildQuestionView(PracticeSessionState)`               | `PracticeQuestionBody`                                 |
  | `question_list_screen.dart:165`         | 内联 itemBuilder                                         | `QuestionListCard`                                     |

- **改法约束**：抽出时**只搬代码不改样式**；回调一律显式传参（`onTap`、`onSelect`），禁止新 widget 里读 provider——
  一旦新 widget 内部读 provider，M-04 就没法用 fake 数据渲染。
- **验收**：CI analyze/test 绿；六屏真机逐个走一遍（loading / 有数据 / 错误 / 空），视觉与改前一致（附前后截图）；
  `grep -c "Widget _build.*Card\|Widget _buildQuestionView" lib/features` 递减到 0。
- **回滚**：单 PR revert（纯重构，无依赖牵连）。

### M-03 fake 模型工厂 + CI 栅栏 ｜1.5h｜依赖 M-02

- **落点**：新增 `lib/shared/skeletons/skeletons.dart`（唯一允许出现 fake 数据的地方）。
- **改法**：
  ```dart
  // 只放"形状够画出骨架"的最小实例，字段值必须是明显的假值（"示例标题" 之类），
  // 防止有人把它当真数据接到 provider 上。
  HistoryItem fakeHistoryItem({int i = 0}) => HistoryItem(...);
  KnowledgeCard fakeKnowledgeCard({int i = 0}) => ...;
  ```
  `PracticeQuestionBody` 需要 `PracticeSessionState`，为此只造**最小可渲染**版本（`state.copyWith` 不可用就写构造器），
  不在 fake 里造任何回调副作用（`onTap: () {}` 之类必须为空实现）。
- **栅栏**：`.github/workflows/android.yml` 的 `analyze` job 加一步（放在 `flutter analyze` 前）：
  ```bash
  if grep -rn "skeletons/skeletons.dart" lib/features; then
    echo "::error::fake 数据不允许出现在 feature 层（见 docs/mobile-ui-kit.md D-2）"; exit 1
  fi
  ```
- **验收**：故意在某个 feature 里 import 一次，CI 报红；删掉后转绿。
- **回滚**：删文件 + 删 CI 步骤。

### M-04 六屏接真 widget 骨架 ｜5h｜依赖 M-03

- **落点**：六个 screen 的 loading 分支 + 删除三处旧骨架实现。
- **改法**：
  ```dart
  Skeletonizer(
    enabled: true,
    child: ListView.builder(                     // 真实卡片，真实布局
      itemCount: 3,
      itemBuilder: (_, i) => HistoryCard(item: fakeHistoryItem(i: i)),
    ),
  )
  ```
  - 卡片外的区域（`wrong_book` 统计条、`history_detail` 筛选栏、`knowledge` 顶部分类条）**没有对应真实 widget 的**，
    用 `Skeletonizer.zone` + `Bone.rectangle` 画，不强行造假 widget。
  - 亮/暗色跟随 `SkeletonizerConfig`（在 `app_theme.dart` 挂一次，不要每屏各配一遍）。
  - 删除：`skeleton_loading.dart`、`skeleton_widgets.dart`、`wrong_book_screen.dart:614` 的内联骨架。
- **验收**：六屏 loading→loaded 切换无塌陷、无闪白（录屏）；CI 绿；`grep -rn "ShimmerWrap\|_ShimmerBox\|SkeletonText" lib` 为 0。
- **回滚**：单 PR revert。

### M-05 移除 `shimmer` 与 `state_notifier` ｜0.5h｜依赖 M-04

- **落点**：`pubspec.yaml`；`ai_analysis_card.dart:4` 与 `_buildShimmer`（:113–）。
- **改法**：AI 分析卡的加载态改 `Skeletonizer.zone + Bone.text(lines: 4)`，保持卡片高度不变（现在 4 行 14.h 灰块）。
- **验收**：`grep -rn "package:shimmer" lib` 为 0；`pubspec.lock` 无 `shimmer`；`state_notifier` 从 `dependencies` 直依赖降为 transitive；
  AI 分析卡真接口截图（加载/成功/失败三态）。
- **回滚**：单 PR revert。

### M-06 补骨架 widget 测试 ｜1h｜依赖 M-04

- **落点**：新增 `mobile_app/test/shared/skeleton_test.dart`（`test/` 现有 9 个文件，全是 provider/纯逻辑，0 条 widget 测试）。
- **改法**：① fake 渲染不抛异常（六屏各一次 `pumpWidget`）；② `Skeletonizer(enabled: false)` 时渲染真实内容；
  ③ 亮/暗主题下颜色不越界（`tester.binding.platformDispatcher.platformBrightnessTestValue` 切换）。
- **验收**：CI `flutter test` 文件数 9 → 10，全绿。
- **回滚**：删文件。

---

## 5. 批次 2：页面过渡（跟随平台默认）

### M-07 `PageTransitionsTheme` 接入预测性返回 ｜1h｜无依赖

- **落点**：`lib/core/theme/app_theme.dart`（`lightTheme` / `darkTheme` 两处 `ThemeData`，:37 / :111）。
- **改法**：
  ```dart
  pageTransitionsTheme: const PageTransitionsTheme(
    builders: {
      TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
    },
  ),
  ```
  **前置校验**：`PredictiveBackPageTransitionsBuilder` 在 Flutter 3.38.4 是否存在，用 CI 编译结果判定
  （本机无 SDK，无法提前确认；若不存在，回报并停在本卡——不要自己换 `ZoomPageTransitionsBuilder` 蒙混）。
- **不做什么**：不改 `app_router.dart`（19 条 `builder:` 产出的 `MaterialPage` 自动吃 theme）；
  **不**在 Manifest 加 `enableOnBackInvokedCallback`（targetSdk 36 下系统已默认启用，加了反而可能与 Flutter 侧重复处理）。
- **验收**：CI analyze/test 绿；真机（Android 15+）返回手势拖动时能看到上一页预览且松手动画连贯；
  iOS 侧滑返回仍可用。
- **回滚**：删 `pageTransitionsTheme` 三行。

### M-08 过渡回归测试与说明 ｜0.5h｜依赖 M-07

- **落点**：新增 `test/core/navigation/page_transitions_test.dart`；`docs/mobile-ui-kit.md` §3 D-1 补一句真机验证结论。
- **改法**：`GoRouter` 起最小两页，push/pop 各一次，断言目标页渲染、返回后首页渲染、无异常。
- **验收**：CI 新增用例绿；PR 描述附真机录屏（Android 预测性返回 + iOS 侧滑）。

---

## 6. 批次 3：图标全量替换（129 处）

现状：`Icons.*` **129 处**、`CupertinoIcons` **0 处**、无图标抽象层。
分布：`practice` 4 文件、`history` 2、`textbook` 2、`auth` 2、`shared/widgets` 2、`wrong_book` 1、`settings` 1、`profile` 1、`pricing` 1、`mastery` 1。

### M-09 语义映射层 ｜1.5h｜依赖 M-01

- **落点**：新增 `lib/core/theme/app_icons.dart`。
- **改法**：只暴露语义名，不暴露 `Symbols`：
  ```dart
  class AppIcons {
    static const IconData navPractice = Symbols.edit_note;  // 基础名即 outlined 变体
  }
  ```
  轴统一：导航栏选中态 filled、普通态 outlined；**页面里禁止直接写 `Symbols.xxx`**。
- **验收**：`grep -rn "Symbols\." lib` 只在 `app_icons.dart` 出现。

### M-10 全量替换（三个 PR）｜6h｜依赖 M-09

- **切分**：PR-1 `practice`+`history`+`textbook`（8 文件）→ PR-2 `wrong_book`+`settings`+`profile`+`pricing`+`mastery`（5）→ PR-3 `auth`+`shared`（4）。
- **改法**：逐处映射；**找不到等价物**的保留原 `Icons.*` 并写进 `docs/mobile-ui-icons-exceptions.md`（图标名 + 原因 + 保留理由），
  不允许"用个差不多的符号顶上"。
- **验收**：CI analyze 绿；每屏截图对比（图标粗细/实心空心不混排）；异常清单在批次结束时汇总为 N 处。
- **回滚**：按 PR 粒度 revert。

### M-11 APK 体积与 tree-shake 校验 ｜0.5h｜依赖 M-10 第一个 PR

- **落点**：CI `apk` job 产物（`workflow_dispatch` 手动触发）。
- **判据**：相对 `main` 上一个 release 包增量 **≤ 300KB**；超了只保留单一变体（仅 `MaterialSymbolsOutlined`），
  删掉 `*_rounded` / `*_sharp` 引用（多 family 会注册多套字体，tree-shake 救不回）。
- **验收**：PR 贴两个 `ls -l` 输出 + 结论。

---

## 7. 不做（明确写下，避免反复讨论）

| 不做                                                         | 原因                                                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `animations` / `SharedAxisTransition` 接管全站页面过渡       | D-1：与 Android 15+ 默认启用的预测性返回割裂；`animations` 3.x 还要求 Flutter 3.44 + `material_ui`        |
| `material_3_expressive` / `m3e_core` / `material_expressive` | 要 Flutter ≥3.47 + `material_ui`，且 v1.1+ **禁用** `package:flutter/material.dart`——等于全仓 import 迁移 |
| `getwidget` / `shadcn_ui` / `forui`                          | 与现有 Notion 风自建 token（`#F7F7F5` / `#37352F`）冲突，换库等于重做视觉                                 |
| 在 Manifest 加 `enableOnBackInvokedCallback`                 | targetSdk 36 下系统默认已启用，显式加会引入重复处理风险（Flutter issue 185257 已有类似报告）              |
| 动 Web 侧（`my-next-app`）与 `ui-guard`                      | 那套护栏是 Playwright + 20 路由 web 用例，**不覆盖 Flutter**                                              |
| 上调 Flutter / Dart 版本                                     | 会让 `pubspec.lock` 的 `sdks:` 与 CI 钉的 3.38.4 不一致，属独立决策                                       |

---

## 8. 执行中若卡住，按这个顺序处理

1. **`PredictiveBackPageTransitionsBuilder` 在 3.38.4 不存在**（M-07）→ 停下，回报，不要降级成别的 builder。
2. **`PracticeQuestionBody` 的 fake 造不出来**（M-03）→ 该屏退回 `Skeletonizer.zone + Bone` 手写，并在 PR 说明原因；其余五屏不受影响。
3. **APK 增量超 300KB**（M-11）→ 砍到单 family 再测；仍超则把图标替换回退到"只换高频 25 处"，**这是唯一允许偏离 D-3 的情形，且必须回报用户确认**。
4. **CI 上 `flutter test` 因 fake 渲染报布局溢出** → 骨架用 `Viewport` 固定高度测试，不要改真实卡片样式。
