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

### M-02 每屏新增 `_buildSkeleton()`（复用屏内既有卡片方法）｜3h｜依赖 M-01

> **相对 D-2 原文的偏离（执行时修正）**：原计划先把 6 个卡片渲染器抽成公共 widget 再骨架化，理由是
> "`lib/shared/skeletons/` 调不到 State 的私有方法"。实际实现改为**在屏内 `_buildSkeleton()` 里直接调用
> 同一个私有方法**——同样满足"真 widget 骨架"（布局来自真实卡片，改布局不用改骨架），但省掉 6 个文件的
> 重构 diff 和随之而来的回归面。代价：不产出可单测的公共卡片 widget（原计划的附带收益取消）。

- **落点**：六屏各加一个私有方法，形如：
  ```dart
  Widget _buildSkeleton() => Skeletonizer(
        enabled: true,
        child: ListView.builder(
          padding: <沿用真实列表 padding>,
          itemCount: 3,
          itemBuilder: (context, index) => _buildHistoryCard(fakeHistoryItem(index: index)),
        ),
      );
  ```
  | 屏                               | 复用的私有方法                                  | 假数据                     |
  | -------------------------------- | ----------------------------------------------- | -------------------------- |
  | `history_screen.dart:127`        | `_buildHistoryCard(HistoryItem)`                | `fakeHistoryItem`          |
  | `history_detail_screen.dart:447` | `_buildListQuestionCard(PracticeLog)`           | `fakePracticeLog`          |
  | `knowledge_screen.dart:196`      | `_buildCardItem(KnowledgeCard)`                 | `fakeKnowledgeCard`        |
  | `wrong_book_screen.dart:207`     | `_buildQuestionCard(WrongQuestion, bool)`       | `fakeWrongQuestion`        |
  | `practice_screen.dart:190`       | `_buildQuestionView(PracticeSessionState)`      | `fakePracticeSessionState` |
  | `question_list_screen.dart:165`  | 先抽 `_buildQuestionCard(Question)`（只搬代码） | `fakeQuestion`             |
- **附带改动**：`main.dart` 的 `MaterialApp.builder` 里挂一层 `SkeletonizerConfig`，
  用 `Theme.of(context).brightness` 决定明暗——否则 App 内手动切暗色时骨架仍是浅色。
- **验收**：`flutter analyze --no-fatal-infos` 的 error/warning 为 0；六屏 loading 分支不再 import 旧骨架 widget。
- **回滚**：单 PR revert。

### M-03 fake 模型工厂 ｜1h｜依赖 M-02

- **落点**：新增 `lib/shared/skeletons/skeleton_fakes.dart`（唯一允许出现假数据的地方）。
- **改法**：六个 fake 工厂：`fakeHistoryItem` / `fakePracticeLog` / `fakeKnowledgeCard` /
  `fakeWrongQuestion` / `fakeQuestion` / `fakePracticeSessionState`，字段值一律是明显的假值（`骨架占位文本`）。
- **泄漏防治**：文件头写死引用约束——只允许 `lib/features/*/presentation/*_screen.dart` 与
  `lib/shared/skeletons/**` 引用。**取消原计划里的 CI grep 栅栏**：假数据本来就要被各屏骨架引用，
  grep 会把合法用法一起拦掉；改为 review 清单项（在 PR 模板/评审时人工核对 import）。
- **验收**：`grep -rn "skeleton_fakes" lib` 的结果只出现在六屏 screen 与 shared/skeletons 自身。

### M-04 删除旧骨架实现 ｜0.5h｜依赖 M-02

- **落点**：`lib/shared/widgets/skeleton_loading.dart`（192 行）、`lib/shared/widgets/skeleton_widgets.dart`（181 行）。
- **改法**：`git rm` 两个文件（仓库规矩：移动/删除 Dart 文件用 `git mv` / `git rm`），确认无引用残留。
- **验收**：`grep -rn "SkeletonText\|SkeletonCard\|HistorySkeletonList\|KnowledgeSkeletonList\|HistoryDetailSkeletonList\|PracticeSkeleton\|QuestionListSkeleton\|ShimmerWrap" lib` 为空。

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

**执行结果（2026-11-19，判据通过）**：

| 项                                                                                                                                              | 值                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 基线包（main @10:28，run [44506006197](https://github.com/mintleaf84/ai-leaming/actions/runs/44506006197)，commit 612f2db）                     | `app-release.apk` **55,540,733 B（52.98 MB）**     |
| 改后包（`feat/mobile-icons`，run [44519273867](https://github.com/mintleaf84/ai-leaming/actions/runs/44519273867)，含骨架屏 + 图标 + 过渡三批） | `app-release.apk` **55,696,432 B（53.11 MB）**     |
| 增量                                                                                                                                            | **+155,699 B = +152 KB**（判据 ≤ 300KB，**通过**） |

tree-shake 证据（`unzip -l` 对比同一路径）：

| 资源                                                              | 改前    | 改后                                                 |
| ----------------------------------------------------------------- | ------- | ---------------------------------------------------- |
| `fonts/MaterialIcons-Regular.otf`                                 | 8,772 B | **1,992 B**（只剩 `apple` 一个图标）                 |
| `packages/material_symbols_icons/.../MaterialSymbolsOutlined.ttf` | —       | **112,728 B**（4264 个图标的全量字体被裁到 112KB）   |
| `MaterialSymbolsRounded.ttf` / `MaterialSymbolsSharp.ttf`         | —       | 2,608 B / 2,380 B（只有极少数图标用到这两个 family） |

结论：**不需要**砍到单 family；`--tree-shake-icons` 对 Material Symbols 生效，多 family 只多付约 5KB。

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

---

## 9. 执行记录（2026-11-19）

> 本机的验证通道：HPC 上没有 Flutter SDK，本次下载了 Flutter 3.38.4 + Dart 3.10.3 到 `/tmp/opencode/sdk/flutter`
> （`flutter_tester` / `impellerc` 需要 GLIBC_2.18，用 `conda env ct-glibc` 的 2.28 loader 包装后可用），
> 因此 `flutter analyze` 与 `flutter test` **都在本机跑通**，不再依赖 CI 反馈。

| 批次                              | 分支                                       | PR    | analyze                      | test                       |
| --------------------------------- | ------------------------------------------ | ----- | ---------------------------- | -------------------------- |
| 依赖 + 页面过渡（M-01/M-07/M-08） | `feat/mobile-deps-transitions`             | #226  | 0 error / 0 warning，30 info | 56 → 58 passed / 2 skipped |
| 骨架屏（M-02~M-06）               | `feat/mobile-skeletons`（stacked on #226） | #227  | 0 error / 0 warning，30 info | 63 passed / 2 skipped      |
| 图标（M-09~M-11 代码部分）        | `feat/mobile-icons`（stacked on #227）     | #228  | 0 error / 0 warning，30 info | 63 passed / 2 skipped      |

CI 侧复核（GitHub Actions，`Android` workflow）：

| 分支 / PR                           | Flutter 静态分析与测试                                         | Release APK                        |
| ----------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| `feat/mobile-deps-transitions`（#226） | pass 1m29s（run 44520942655）                                | skipping（PR 不打包）              |
| `feat/mobile-skeletons`（#227）        | pass（run [44521689946](https://github.com/mintleaf84/ai-leaming/actions/runs/44521689946)，手动 dispatch） | success |
| `feat/mobile-icons`（#228）            | pass 1m30s（run 44521620278）                                | success（run 44519273867）         |

> 注：#227 的 PR 事件没有自动触发 `Android` workflow（同仓 #226/#228 都正常触发，原因未查明），
> 因此对该分支用 `workflow_dispatch` 补跑，结论与本地一致。


执行中修正的三处计划假设：

1. **D-2 的"先抽公共 widget"不必要**：改为屏内 `_buildSkeleton()` 直接复用私有卡片方法（见 §4 M-02 的偏离说明）。
2. **CI grep 栅栏取消**：假数据本来就要被六屏引用，grep 会拦掉合法用法 → 改为 review 清单项（见 §4 M-03）。
3. **`pubspec.lock` 存量漂移**：原 lock 缺 `connectivity_plus` / `sqflite` 等已声明的直接依赖，本次 `pub get` 一并修正（随 #226 提交）。

已闭环的补充项：

- **M-11 APK 体积/tree-shake 校验通过**：+152 KB（≤300KB），字体被裁到 112KB，明细见 §6 M-11 的执行结果。
- **CI 复核**：`#226` 的 `Flutter 静态分析与测试` pass（1m26s）；`feat/mobile-icons` 上手动触发的
  `Android` run 44519273867 两个 job（analyze + Release APK）全 success。

仍未完成（只能在真机上做，非代码可闭环）：

- **真机观感验收**：六屏 loading→loaded 录屏、Android 15+ 预测性返回手势、iOS 侧滑、图标三处视觉差异
  （见 `docs/mobile-ui-icons-exceptions.md` §1）。
- **三个 PR 的合并**：#226 → #227 → #228 顺序合并（stacked），需要仓库管理员操作。
