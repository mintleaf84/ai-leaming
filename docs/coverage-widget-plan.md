# Widget 测试批次计划（screens 56% → 70%+）

> 状态：草案（未提交）
> 基线：`origin/main@cf2e4df7`，CI run `44705937765`（`android.yml` analyze job，2026-11-20）
> 相关：覆盖率门禁 `mobile_app/tool/coverage_gate.dart`、基线 `mobile_app/coverage_baseline.json`
> 上一阶段：Flutter 端覆盖率从 21.3% 提到 68.0%（P0–P5 棘轮，PR #248 起）

---

## 1. 现状（实测，不是估的）

`flutter test --coverage` → **836 passed / 2 skipped**；门禁通过。

| scope       | files | lines |  hit |      cov% | floor |
| ----------- | ----: | ----: | ---: | --------: | ----: |
| **global**  |   129 | 10615 | 7213 | **68.0%** | 59.5% |
| domain_data |    36 |  1609 | 1410 |     87.6% | 80.2% |
| core        |    26 |   712 |  609 |     85.5% | 80.9% |
| shared      |    10 |   784 |  672 |     85.7% | 84.7% |
| providers   |    16 |   955 |  840 |     88.0% | 86.2% |
| **screens** |    40 |  6473 | 3626 | **56.0%** | 47.3% |
| other       |     1 |    82 |   56 |     68.3% |  0.0% |

**结构结论**：`screens` 占 61% 的可执行行（6473/10615）。逻辑层已经 87–88%，再补逻辑对 global 的边际只有 1–2pp；**唯一能把 global 推到 75%+ 的杠杆就是屏**。

screens 里 lcov 统计的 6245 行中 **2661 行未覆盖**，且高度集中：

| 屏                              | 可执行行 | 命中 |  未覆盖 | cov% |
| ------------------------------- | -------: | ---: | ------: | ---: |
| practice/question_list_screen   |      292 |    1 | **291** |  0.3 |
| knowledge/knowledge_screen      |      243 |    1 | **242** |  0.4 |
| profile/profile_screen          |      179 |    1 | **178** |  0.6 |
| textbook/textbook_detail_screen |      176 |    0 | **176** |  0.0 |
| practice/result_screen          |      174 |    1 | **173** |  0.6 |
| auth/login_screen               |      167 |    1 | **166** |  0.6 |
| practice/practice_screen        |      381 |  219 |     162 | 57.5 |
| history/history_screen          |      150 |    1 | **149** |  0.7 |
| settings/settings_screen        |      398 |  254 |     144 | 63.8 |
| auth/register_screen            |      130 |    1 | **129** |  0.8 |
| pricing/pricing_screen          |      114 |    1 | **113** |  0.9 |
| mastery/mastery_screen          |       97 |    1 |  **96** |  1.0 |
| chat/chat_screen                |      329 |  236 |      93 | 71.7 |
| textbook/textbook_list_screen   |       92 |    1 |  **91** |  1.1 |
| history/history_detail_screen   |      421 |  339 |      82 | 80.5 |
| wrong_book/wrong_book_screen    |      344 |  277 |      67 | 80.5 |

已达标（**不要再投入**）：dashboard 98.0、question_form 92.7、drafts 91.1、draft_review 89.6、practice_setup 91.5、knowledge_provider 98.0。

---

## 2. 原则（先定，避免做成"覆盖率表演"）

1. **只测屏自己的分支**：渲染、三态（骨架/空/失败）、交互后的状态迁移、导航。判卷/解析/调度逻辑已有 87–88% 覆盖，**不在屏测试里重复**。
2. **不写 golden**：像素比对在本项目没有维护预算；溢出用 `tester.takeException()` + 375×667 + textScale 1.3 覆盖。
3. **不联网**：一律 `pumpScreen(...)` + `test/support/fake_providers.dart` 的 fake；需要新 fake 时**只加在 `fake_providers.dart`**（集中，避免每个测试自造）。
4. **测行为契约，不测文案全文**：断言"出现「重试」且请求次数 +1"，而不是把整段中文当快照。
5. **一个屏 4–6 条**为准：加载态、空态、失败+重试、主路径交互、一条溢出/大字。超过 6 条通常说明在测内部实现。
6. **先补 fake，再写测试**：缺 fake 的屏集中在 B0 补，避免每个批次各造一份。

---

## 3. 批次

### B0 基础设施与零覆盖公共件（0.3 会话，先做）

| 目标                                                        |        未覆盖行 | 要测的契约                        | 实际结果（2026-11-20，已落地）                                                                                              |
| ----------------------------------------------------------- | --------------: | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `shared/datasources/api_client.dart`                        |  61（文件行数） | Dio 桩断言 retrofit 路径/查询参数 | **无可执行行**：只有注解与抽象签名（redirecting factory），lcov 里根本不存在该 SF。9 条测试保留了契约价值，但对覆盖率恒为 0 |
| `practice/domain/practice_repository.dart`                  |              27 | —                                 | 纯抽象声明，无方法体 → **exempt**（实现由 `practice_repository_impl_test` 覆盖）                                            |
| `practice/presentation/widgets/first_principles_panel.dart` |             102 | 三态渲染 + 关闭交互               | 0% → **51%**（5 例）。注：源码并不读 `state.error`，"失败可重试"在实现里不存在                                              |
| `core/compat/app_version.dart`                              |               4 | —                                 | **exempt**（构建期常量）                                                                                                    |
| `core/local/local_db.dart`                                  | 9（实为 35 行） | —                                 | **exempt**（懒加载单例 + 建表；表结构由 `local_schema_test` 覆盖）。若日后要收这 9 行，需 `ffi_db.dart` 单独一单            |

实际：**+53 hit（global 68.0% → 68.5%）**，远低于预估的 +190——原因是三个目标里两个不可测、一个远小于预估。**这条修正对后续批次是重要的**：估算未覆盖行必须用 lcov 的 `LF`，不能用 `wc -l`。

### B1 认证与会话入口（0.5 会话）

屏：`login_screen`(166)、`register_screen`(129)、`splash_screen`(26)

契约点：

- 登录：空用户名/空密码的拦截、提交中禁用、401 与网络错误分别有可读文案且**不跳转**、成功后 `replace` 到首页（用 fake router 断言落地路径）；
- 注册：与登录共用表单口径、重复用户名的错误分支（若无则记录为"后端未提供"并跳过）；
- 启动屏：有 token → 首页、无 token → 登录、token 过期 → 登录（`TokenUtil.isExpired` 已有单测，这里只测屏的落点）。

预估：**+220 hit / +2.1pp**（这三个屏几乎全未覆盖）。

### B2 题库与知识（0.5 会话）

屏：`question_list_screen`(291)、`knowledge_screen`(242)

契约点：

- 题库：搜索输入触发 `applySearch`（断言请求参数，不是渲染结果）、分页到底加载更多、空结果与失败+重试、列表骨架不闪空态；
- 知识卡：三态、分类筛选后新建卡**清空筛选**（代码注释里写明的行为）、FAB 新建对话框的校验、创建成功后列表刷新。

预估：**+330 hit / +3.1pp**（两块最大的未覆盖集中区）。

### B3 练习结果与历史（0.5 会话）

屏：`result_screen`(173)、`history_screen`(149)、`mastery_screen`(96)

契约点：

- 结果页：分数/对错统计渲染、庆祝动画的**存在性**（不比对像素）、「返回首页」不走 pop（断言回到 dashboard 且栈已清）；
- 历史：骨架 / 空 / 失败+重试、滚动加载更多、点击进入详情（断言路由与参数）；
- 掌握度：树渲染、空树、失败+重试。

预估：**+260 hit / +2.4pp**。

### B4 教材与定价（0.4 会话）

屏：`textbook_list_screen`(91)、`textbook_detail_screen`(176)、`pricing_screen`(113)

契约点：

- 教材库：空/失败/点击进入详情；
- 教材详情：章节列表渲染、空章节、加载失败重试；
- 定价：**接口失败时静默降级到内置套餐**（这是明确写在代码注释里的行为，必须有用例锁住），以及成功时用服务端价格。

预估：**+230 hit / +2.2pp**。

### B5（可选）profile / settings / chat 的剩余分支（0.4 会话）

`profile_screen`(178)、`settings_screen`(144 剩余)、`chat_screen`(93 剩余)：个人中心入口跳转、退出登录清 token、设置页各分组与危险操作确认、聊天失败重发。

预估：**+250 hit / +2.4pp**。

---

## 4. 目标与棘轮

| 里程碑      | global | screens | 操作                                        |
| ----------- | -----: | ------: | ------------------------------------------- |
| 现在        |  68.0% |   56.0% | —                                           |
| B0+B1       |   ~72% |    ~62% | `dart run tool/coverage_gate.dart --update` |
| +B2         |   ~75% |    ~67% | 同上                                        |
| +B3         |   ~77% |    ~71% | 同上                                        |
| +B4         |   ~79% |    ~75% | 同上                                        |
| +B5（可选） |   ~81% |    ~78% | 同上                                        |

规则沿用现有门禁：`--update` 取 `floor = 实测 - 1.0` 且只升不降；单文件允许 2pp 抖动；新增文件（逻辑层）仍要 ≥60%。

**不要追的几个数字**：`app_version.dart`(4 行)、`local_db.dart`(9 行)、`provider` 文件（已 87%+）、`*.g.dart`（分母已排除）。为它们写测试只会增加维护面。

---

## 5. 执行方式

本机 Flutter SDK 位于 `/tmp/opencode/sdk`，**已被系统清理**，重建约 1.4GB（当前链路 ~100KB/s，不建议在会话里等）。两条可行路径：

1. **本机装 SDK**（一次性，约 20–40 分钟，取决于带宽）：
   ```bash
   mkdir -p /tmp/opencode/sdk && cd /tmp/opencode/sdk
   curl -fL -o flutter.tar.xz https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.38.4-stable.tar.xz
   tar xf flutter.tar.xz && rm flutter.tar.xz
   export PATH=/tmp/opencode/sdk/flutter/bin:$PATH PUB_CACHE=/tmp/opencode/sdk/pubcache
   ```
   然后：`flutter test --coverage && dart run tool/coverage_gate.dart`
2. **走 CI 取数**（无 SDK 时）：
   ```bash
   gh workflow run android.yml --ref <branch>
   gh run view <run-id> --json jobs   # 取 analyze job id
   gh api repos/<owner>/<repo>/actions/jobs/<job-id>/logs | grep -A20 "覆盖率门禁"
   ```
   代价是每轮 2–4 分钟等待，且看不到逐行 lcov。**每批建议本机跑，合并前再靠 CI 复核一次。**

验证口径（每批必须全绿才合并）：

```bash
flutter analyze               # 0 error / 0 warning（存量 29 info 不算）
flutter test                  # 全量，不是只跑新增
flutter test --coverage && dart run tool/coverage_gate.dart
```

---

## 6. 已知坑（写测试时会撞到）

1. `Skeletonizer` 是抽象类 + 工厂构造，`find.byType(Skeletonizer)` 永远找不到 → 用 `find.byWidgetPredicate((w) => w is Skeletonizer)`（`practice_screen_test.dart` 已有先知）。
2. `ScreenUtil` 必须走 `pumpScreen()`（`ScreenUtilInit`），否则 `.w/.h` 全按 1.0 算，375 宽下断言会假过。
3. 带 `Transform.scale` 的卡片 `tester.tap(finder)` 会报 would-not-hit → `tapAt(getCenter(...))`。
4. 骨架/庆祝动画是无限或延迟动画时不要 `pumpAndSettle()`（会超时）→ 固定 `pump()` 次数，或只断言组件存在。
5. 安全存储：`setUpAll(useFakeSecureStorage)`，否则平台通道抛 `MissingPluginException`。
6. 时间相关（连续天数、04:00 学习日切换）不要依赖真实时钟 → 注入 `now` 或用已有 fake。
7. 契约协商（`contractDecisionProvider`）会影响首页入口可见性：屏测试里默认注入 `ok`，否则 `recall` 入口会时隐时现。
8. **经 `ApiClient`（真 dio）的屏必须带时长 pump**：dio 用零延时定时器推进请求，纯 `pump()` 只跑微任务 → 请求永远停在"已发起"，骨架不消失、`adapter.requests` 恒为 0。用 `await tester.pump(const Duration(milliseconds: 50))`。纯 `Future` 仓库（如题库屏）不需要。
9. 分页/滚动加载类用例要断言**请求参数**（`page`/`search`）而不是列表文字，否则测的是渲染巧合。

---

## 6.5 B0 期间发现的真实缺陷（未修，待单独处理）

1. **`first_principles_panel.dart` 内容分支必崩（用户可见）**：`FirstPrinciplesResponse` 只有 `analysis`/`cached`，面板却读 `response.coreEssence` / `fundamentalComponents` / `reconstructedUnderstanding`（形参 `dynamic`，编译期不报）→ AI 分析一返回，`practice_screen` 的「第一性原理解读」bottom sheet 就抛 `NoSuchMethodError`。B0 的用例目前以"缺陷锁定"形式守住该分支，模型与面板对齐后必须改成断言三段正文。
2. **该面板没有失败态**：不读 `state.error`，失败与「尚未分析」共用同一句「暂无分析数据」，也没有「重新生成」——计划里"失败可重试"是假设，实现里不存在。
3. **375×667 + 1.3 倍字号下头部 Row 溢出 6.9px**（图标 + 两行标题 + 关闭按钮没有 `Flexible`）。
4. `coverage_baseline.json` 的 `measured` 字段已落后实测 8pp（68.5% vs 60.46）——只影响"回退检测"的参考值，汇总批次跑 `--update` 时一并刷新。

## 6.6 执行结果（2026-11-20，四条 lane 并行）

| lane     | 范围                                               |                  用例 |    global |   screens |
| -------- | -------------------------------------------------- | --------------------: | --------: | --------: |
| 基线     | —                                                  |                   836 |     68.0% |     56.0% |
| B0       | infra + exempt                                     |                   +15 |     68.5% |         — |
| B1       | login / register / splash                          |                   +25 |     70.9% |     60.9% |
| B2       | question_list / knowledge                          |                   +12 |     72.9% |     64.2% |
| B3+B4    | result / history / mastery / textbook ×2 / pricing |                   +26 |     75.4% |     68.1% |
| **合并** | —                                                  | **902（+3 skipped）** | **83.8%** | **81.9%** |

合并后已执行 `--update`：global floor **82.8%**、screens floor **80.9%**、domain_data 86.6%、core 84.8%、providers 87.0%、other 78.3%。

单屏结果（before → after）：question_list 0.3%→98.6%、knowledge 0.4%→98.8%、login 0.6%→97.6%、register 0.8%→98.5%、splash 3.7%→100%。其余六个屏（result/history/mastery/textbook_list/textbook_detail/pricing）见各 lane 报告，均从 <1.1% 提到 55%+ 区间。

**B5（profile / settings / chat 剩余分支）不再需要**：目标（screens 70%+、global 76%+）已超额完成（81.9% / 83.8%）。剩余未覆盖主要是 `profile_screen`(178 行)、`settings_screen`(144)、`textbook_detail` 的深层分支以及既有 legacy 屏，边际收益低于维护成本。

## 6.7 期间发现但未修的 lib 缺陷

1. `first_principles_panel.dart` 读 `response.coreEssence/fundamentalComponents/reconstructedUnderstanding`，而模型只有 `analysis`/`cached` → **AI 分析返回即 `NoSuchMethodError`**（用户可见崩溃）。B0 用"缺陷锁定"用例守着，修模型后必须改成断言正文。
2. `first_principles_panel` 无失败态（不读 `state.error`），且 375×667×1.3 字号下头部 Row 溢出 6.9px。
3. `question_list_screen` 无空态：搜索无结果是整片空白。
4. `login_screen` 失败只 `debugPrint`，界面无可读错误提示（B1 留了一条 skip 的 TODO 用例）。
5. `KnowledgeController` 在异步路径用 `ref.watch(dioProvider)`（应为 `ref.read`）。

## 7. 排期与风险

- AI 协作约 **2.5 个会话**（B0 0.3 + B1–B4 各 0.4–0.5 + 缓冲）；每批可独立合并，不必等齐。
- 主要风险不是"写不出测试"，而是**假测试**：塞假状态证明"屏会读 state"。判断标准——把被测屏的某个分支删掉，测试必须变红；做不到就说明测的是实现细节。
- 覆盖率只是副产品：本计划的验收是"删掉分支则测试红"，覆盖率上涨只是必然结果。
