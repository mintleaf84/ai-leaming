# Flutter 移动端开发计划

> 状态：草案（2026-11-18）
> 范围：`mobile_app/` 继续开发至「日常可用 + 可安装 APK + 离线刷题」
> 前置必读：`.agents/skills/flutter-pro-engineering/`（code-quality / migration / full-stack 三篇）

---


## 0. 目录与状态

| 段 | 内容 | 状态 |
| --- | --- | --- |
| §1–§10 | 复用分析、现状基线、P0–P5 阶段规划、工期 | 历史方案（部分已被 §11 覆盖） |
| §11 | 执行进度（2026-11-18） | **[已完成]** |
| §12 | 覆盖率门禁与测试补强 | **[已完成]**（PR #248） |
| §13 | 覆盖率门禁第二轮（PR 作用域 / 豁免 / 净变化） | **[已完成]**（PR #250） |
| §14 | 覆盖率后续（P5 与 §12.7 分级） | P5 已完成，见 §17 |
| §15 | #247 收口 | **[已完成]**（#247） |
| §16 | P0 缺陷修复（登录漏发 token / logout 无 guard） | **[已完成]**（PR #251） |
| §17 | P5 逐屏冒烟清单 | **[已完成]**（PR #255） |
| §18 | 门禁第三轮（diff coverage） | **[不做]** |
| §19 | 设置持久化 | **[已完成]**（PR #253） |
| §20 | 离线边界与提示 | 方案 A 已完成，B 待反馈 |
| §21 | 移动端可访问性 | **[已完成]**（PR #252） |
| §22 | P5 测试基建与反模式 | **[已完成]**（随 PR #255） |
| §23 | 真机验收闭环 | 计划（需真机） |
| §24 | 错误文案统一 | **[已完成]**（PR #253） |
| §25 | 备考主路径摩擦（F1–F5） | 计划 |
| §26 | APK 发布链路（R1–R6） | 计划 |
| §27 | CI 时长与测试预算 | 计划 |

> 维护约定：新增段落追加到末尾并在此表登记；状态只有四种——`[已完成]` / `计划` / `[不做]` / `待决策`。

---

## 1. 结论：现在这套 Next.js 代码，能复用什么

**一句话**：不能复用一行 UI 代码，但**后端已经把该复用的都分离好了**——Flutter 端要做的不是重写 Next.js，而是把已存在的第二个客户端接到同一份契约上，并补它接错的口。

| 层                                                               | 复用度           | 说明                                                                                                       |
| ---------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Next.js 页面 / React 组件                                        | **0**            | JSX 与 Dart Widget 无任何机械转换路径，只能按 `ui参考/` 设计稿重画（已完成）                               |
| Server Actions（35 文件 / ~150 导出）                            | **0**            | 非 HTTP 契约，是 Next 私有 RPC，任何外部客户端都调不到                                                     |
| Hono REST（72 条路由，`/api/*`）                                 | **100%**         | 单一 catch-all 挂载；认证同时接受 `auth_token` cookie 与 `Authorization: Bearer`，登录响应体直接回 `token` |
| `src/lib/services/*`（44 个领域服务）                            | **100%（间接）** | 只吃 `userId` + POJO，不 import `next/headers`、不碰 cookies，天然与传输协议无关                           |
| OpenAPI（`/api/openapi.json` + `/api/doc`）                      | **100%**         | 运行时生成，可直接作为两端契约的单一事实来源                                                               |
| 幂等 / FSRS / 判分算法（`lib/recall/*`、`question-idempotency`） | 逻辑可搬         | `recall/{normalize,matcher,rating,scheduler}` 是零依赖纯函数，可逐行移植 Dart                              |
| PWA / Service Worker 缓存                                        | 0                | 策略思路可借鉴，代码不可用（Web 有 SW + IndexedDB 语义，原生没有）                                         |

**因此本计划的定位是**：`mobile_app/` 已有 17 屏、约 12.1k 手写行、Riverpod 3 + go_router + dio + retrofit + freezed 全套；不重起炉灶，只做「接线 + 补断层 + 加离线 + 出包」。

**最大的复用红利**：错题本不是独立表，而是由 `practice_logs` 聚合而来（`services/wrong-question.ts:85`），掌握度也是按 tags 从答题日志增量累加。这意味着**只要离线答案能写进 `practice_logs`，错题本 / 掌握度 / 历史 / 统计会全部自动生效**——离线功能不需要另写一套学习闭环。

---

## 2. 现状基线

| 面           | 事实                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flutter 规模 | 85 个 dart 文件 / 15,984 行（去生成物 12,100 行），17 条 GoRoute，Riverpod 3 + go_router 17 + dio 5.9 + retrofit 4.9 + freezed 3                                                            |
| 已跑通       | auth（JWT 存 secure storage、401 自动登出）、题库列表分页、练习答题、练习配置、结果页、历史列表/详情、知识卡列表、掌握度树、stats、profile、教材库、错题本（列表/按标签/标记掌握/生成练习） |
| 断在半路     | AI 聊天（4 个会话端点 404 + 流协议不匹配）、第一性原理、「套餐」页、练习模式（后端只支持 random）、设置页（大量硬编码 mock）                                                                |
| 本地存储     | **只有一枚 JWT**；无 sqflite/drift/isar/hive，无缓存、无离线队列、无同步                                                                                                                    |
| 契约来源     | 两端各自手写：Flutter 4 个 retrofit 方法 + 5 个手写 repository；无 OpenAPI→Dart 生成链路                                                                                                    |
| 质量基线     | `analyze.txt` / `test_output.txt` 都是**陈旧快照**（前者 3 个 error 现已被源码修掉，后者记录 0 通过 / 2 编译失败）。必须先复跑一次才有真基线                                                |
| 构建能力     | **本机无 Flutter/Dart/JDK17/Android SDK**（只有 JDK 8、glibc 2.17）→ 本地出包不可行，验证与打包全部走 GitHub Actions；真机调试用你的 Windows 机                                             |

---

## 3. P0：契约对齐（先做，否则后面全是沙上建塔）

逐条已在本机核实（不是推测）。改法标注归属端。

| #   | 现象                       | 证据                                                                                                                                                                                                                                                 | 修法                                                                                                                                                                       | 端      |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | 聊天首条消息即失败         | Flutter 调 `/chat/sessions*` 四个端点（list/create/get/delete，`chat_repository_impl.dart:96-139`），后端 `chat.ts` 只有一个 `POST /`                                                                                                                | 后端补 REST：`GET/POST /chat/sessions`、`GET/DELETE /chat/sessions/:id`，直接调用现成的 `services/chat.ts`（`createSession/listSessions/getSession/deleteSession` 已就绪） | 后端    |
| 2   | 聊天屏会显示 SSE 原始 JSON | 后端 `POST /chat` 返回 AI SDK **UIMessageStream**（`data: {"type":"text-delta",...}`），Flutter 把 chunk 原样拼进气泡（`chat_provider.dart:155`）                                                                                                    | 二选一：① 后端加 `/chat/stream`（标准 SSE，`event: delta`）；② Flutter 侧按 UIMessageStream 协议解析。**选 ①**：协议归后端，Web 端不受影响                                 | 后端    |
| 3   | 第一性原理必 400           | 后端 zod 要求 `{questionContent, correctAnswer, explanation?, wrongAnswer?}`（`practice.ts:195`），Flutter repository 发 `{questionId, content}`（`practice_repository_impl.dart:66`）；domain 里 `FirstPrinciplesParams` 字段其实是对的，只是没人用 | 改 repository 接口签名带上 `correctAnswer`，用 `FirstPrinciplesParams.toJson()` 发送                                                                                       | Flutter |
| 4   | 练习模式选了就 400         | 后端 `if (mode !== "random") return 400`（`practice.ts:70`），但 setup 页提供多种模式                                                                                                                                                                | 短期：setup 页只暴露 random + 从错题本进入的入口；中期：后端按 `mode` 分派到 `wrongQuestionService.getList` / tag 过滤                                                     | 两端    |
| 5   | 错题本「开始练习」丢了会话 | `context.go('/practice?sessionId=$sessionId')`（`wrong_book_screen.dart:505`），但 `/practice` 只读 `state.extra`（`app_router.dart:48`）→ 静默新建随机练习                                                                                          | 改为 `context.go('/practice', extra: {'sessionId': sid})`，PracticeScreen 增加按 sessionId 续练分支                                                                        | Flutter |
| 6   | 套餐页永远降级             | 请求 `/billing/plans`，后端无此路由                                                                                                                                                                                                                  | 后端从 `subscription_plans` 表补 `GET /billing/plans`；或本期直接删降级逻辑，标为「未上线」                                                                                | 后端    |
| 7   | 注册页邮箱被吞             | 表单有 email 输入（`register_screen.dart:14`），提交只发 username/password                                                                                                                                                                           | 要么后端 `POST /auth/register` 加 email 字段并落库，要么删掉该输入框。**先删**——users 表没有 email 列                                                                      | Flutter |

**验收**：7 条逐条真机回归（或 CI 集成测试）通过；`analyze` 无 error。

---

## 4. P1：契约单一事实来源

现状是「两端各自手写、靠人对齐」，这次侦察就抓到 7 处漂移。成本极低的对策：

1. **快照**：加脚本 `npm run contract:dump`（`GET /api/openapi.json` 落盘到 `docs/openapi.json`），提交入库，视为契约的版本化事实。
2. **CI 闸**：`ci.yml` 增加一步——启动服务、dump openapi、与入库快照 diff，不一致就失败并提示改「要么改路由、要么提交新快照」。新增/修改接口必须同时更新快照，任何一端漂移都会在合并前暴露。
3. **Dart 侧**：不引入完整的 OpenAPI codegen（现有 retrofit 手写方法仅 16 个，生成器会引入大量样板）。改为**轻量校验**：单测里读 `docs/openapi.json`，断言 Flutter 用到的 path + 关键字段名都存在。三十行的测试，挡住绝大多数漂移。
4. **命名统一**：`textbook.dart` 用 snake_case（对齐后端），`user_profile.dart` 用 camelCase。统一成 camelCase + `@JsonKey(name:)`，与 `.agents/skills/flutter-pro-engineering/references/full-stack.md` §3.2 的写法一致。

**验收**：故意改一条后端字段名 → CI 红。

---

## 5. P2：离线刷题 + 回连同步（最大一块）

用户明确要求：断网能刷题，回连自动同步。这是本次唯一需要新增存储层与后台任务的阶段。

### 5.1 架构

```
Widget ──> Notifier ──> Repository（唯一读出口）
                          ├── RemoteDataSource（Dio / retrofit）
                          └── LocalDataSource（drift）
                                 ↑
                          SyncService（唯一写出口）
                           ├── 出题/答题：先写本地，标记 pending
                           └── 回连：批量 flush → 清理 pending
```

规则三条：

1. **UI 层不直连 Dio**。现在 7 个 feature 的 provider 自己 `_dio.get(...)`，是离线化的第一个障碍——必须先把这 7 处收进 repository（这是一次机械重构，但必须先做）。
2. **写路径只经 SyncService**，读路径只经 Repository，两边不互相调用。
3. 在线时命中远端失败 → 自动降级读本地 + 顶部提示「离线模式」，不弹错误对话框。

### 5.2 本地库选型

**drift**（SQLite + codegen）。理由：类型安全、迁移有版本号、和现有 `build_runner` 流程一致；sqflite 靠手写 SQL 字符串（离线题面/日志字段多，易错）；isar 维护活跃度与 Flutter 3.38 兼容性风险。体积代价约 +2MB APK。

表设计（只存必需，不镜像服务端全量）：

| 表                 | 关键列                                                                                                                   | 说明                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `cached_questions` | `id`(int PK)、`content`、`options`(json)、`type`、`tags`(json)、`answer`、`explanation`、`material`、`fetched_at`        | 题面只读缓存；答案一并缓存，离线判分靠它 |
| `local_sessions`   | `local_id`(uuid PK)、`mode`、`question_ids`(json)、`started_at`、`synced_session_id`                                     | 离线生成的练习                           |
| `pending_answers`  | `client_key`(uuid PK)、`local_id`、`question_id`、`user_answer`、`is_correct`、`duration_ms`、`answered_at`、`synced_at` | 待上报队列                               |
| `sync_meta`        | `key`(PK)、`value`                                                                                                       | 题库游标、上次同步时间、设备 id          |

体积估算：题面纯文本，千题约 0.6–1 MB；全量题库（万题级）也在 10 MB 内，不做增量淘汰，直接全量持有。

### 5.3 同步协议（关键：复用现成幂等语义）

- **拉**：`GET /api/external/questions?page&limit`（已存在，API Key 读）。增量优化（`updated_since` 游标）作为 P2 后段可选，先全量拉一次、按 `fetched_at` 定期刷新。
- **推**：**复用 `importService.importAgentAnswers`**（`external.ts:810`）——它已经做到：`sessionKey` 唯一索引幂等（重复提交返回 `duplicated: true`，不会把掌握度刷虚高，`import-service.ts:461`）、事务内写 `practice_sessions` + `practice_logs`、按 tags 增量累加掌握度（`:364`）。
- **需要新增一个 JWT 版入口**：`POST /api/practice/offline-answers`，body 与 `AgentAnswersRequestSchema` 同形，内部原样调 `importService.importAgentAnswers(user.id, body)`。这样 Flutter 不必持有 API Key，鉴权和现有登录共用 JWT。
  - 幂等键：`sessionKey = local_id`（uuid v4，客户端生成，跨重试稳定）——符合仓库硬规则 1「优先用上游操作 ID」。
- **回连策略**：`connectivity_plus` 监听恢复 → 批量 flush（每批 ≤ 500 条，即后端上限）→ 成功则 `synced_at` 落库；失败按指数退避 1s/5s/30s/2min，不阻塞 UI。
- **冲突**：题面以服务端为准（本地缓存按 `id` 覆盖，不做双向合并）；本地未同步答案只追加、永不覆盖服务端记录；时间以服务端写入时间为准，`answered_at` 只作展示。

### 5.4 两个必须提前定的取舍

- **判分归属**：离线状态只能客户端判分（答案已缓存），而导入接口信任客户端传来的 `is_correct`。对个人自用可接受，但要在计划里写明：**离线判分结果 = 客户端判定**，联网作答仍走 `POST /practice/session/:id/submit`（服务端判分）。
- **离线不做的功能**：AI 聊天、第一性原理、知识卡创建、教材库正文——这些标为在线专属，离线时入口置灰并说明原因，不要做「点了转圈再失败」。

### 5.5 验收

- 飞行模式下：拉题库 → 随机练习 10 题 → 答完看结果 → 杀进程 → 重开仍能看到本次练习（本地）。
- 恢复网络 → 30 秒内 flush 成功 → Web 端「历史」出现该次练习、错题本出现错题、掌握度变化。
- 同一次 flush 故意重发 3 次 → 历史里只有 1 条（幂等成立）。

---

## 6. P3：功能补齐（按真实使用频率排序）

| 优先 | 项             | 现状                                                                 | 工作量                               |
| ---- | -------------- | -------------------------------------------------------------------- | ------------------------------------ |
| 高   | 设置页真数据   | 用户名/邮箱/目标/缓存全是硬编码 mock（`settings_screen.dart:21-25`） | 接 `/api/profile` + 本地真实缓存大小 |
| 高   | 掌握度页无入口 | `mastery_screen.dart` 数据能拉，全库无 `context.go('/mastery')`      | 在 profile 或 dashboard 加入口       |
| 中   | 知识卡新建     | FAB 只弹「开发中」（`knowledge_screen.dart:164`）                    | 调已存在的 `POST /knowledge/cards`   |
| 中   | dashboard 待办 | 固定占位文案                                                         | 接真实数据或删掉                     |
| 低   | 题库搜索       | 搜索框 `TODO`（`question_list_screen.dart:110`）                     | 后端 `GET /questions?search=` 已支持 |

**明确不做**（本期排除，避免范围膨胀）：笔记、思维导图、SRS 面板、订阅管理、题目/用户管理后台、PDF 导入、观察区、排行榜。这些只有 Server Action 没有 REST，且与「手机上刷题」无关。

---

## 7. P4：APK 交付链路

本机无工具链，走 GitHub Actions（仓库已有 `ci.yml`，且支持 `vars.SELF_HOSTED` 切换——但自建 runner 就在这台 HPC 上，同样没有 Android SDK，因此**必须跑 `ubuntu-latest`**）。

新增 `.github/workflows/android.yml`：

```yaml
name: Android APK
on:
  workflow_dispatch:
  push:
    tags: ["v*"]
jobs:
  apk:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: mobile_app } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: "17" }
      - uses: subosito/flutter-action@v2
        with: { flutter-version: "3.38.4", channel: stable, cache: true }
      - run: flutter pub get
      - run: dart run build_runner build --delete-conflicting-outputs
      - run: flutter analyze --no-fatal-infos
      - run: flutter test
      - run: flutter build apk --release --dart-define=API_BASE_URL=${{ vars.API_BASE_URL }}
      - uses: actions/upload-artifact@v4
        with:
          {
            name: app-release,
            path: mobile_app/build/app/outputs/flutter-apk/app-release.apk,
          }
```

配套前置改动（都在 `mobile_app/`）：

1. **baseURL 参数化**：`ApiConstants.compileTimeBaseUrl` 取 `String.fromEnvironment('API_BASE_URL')`（无默认值）。三级回落：运行时设置（App 内「设置 → 服务器地址」，存 flutter_secure_storage）> 编译期 `--dart-define` > 都没有则进入「需要配置服务器地址」页，不发请求。早期硬编码 `localhost:3000`，装到手机上必然连不上。
2. **applicationId 改掉**：`com.example.mobile_app` → `com.mintleaf84.aileaming`（`android/app/build.gradle.kts:22`）。`com.example.*` 无法上架，且与别的 demo 冲突。
3. **签名**：现在 release 用 debug 签名（`:35`）。要长期自用升级，**必须**生成一个固定 keystore，`key.properties` 走 secrets（`ANDROID_KEYSTORE_BASE64` / `_PASSWORD` / `_KEY_ALIAS`），`key.properties` 与 `*.jks` 加进 `.gitignore`。否则每次换签名都得卸载重装、丢本地数据。
4. **版本号单一事实来源**：`pubspec.yaml` 的 `version: 1.0.0+1` 为唯一来源（`versionCode` 由 Flutter 从 `+N` 推），tag `v1.0.0` 与之一致。
5. **首次跑通**：先只出 debug APK 下载安装，验证能登录、能刷题；再切 release 签名。

**验收**：GitHub 上点一次 `workflow_dispatch` → 下载 artifact → 手机安装 → 登录 → 刷 10 题 → 历史可见。

---

## 8. P5：质量门禁

| 项                | 现状                                                                                  | 动作                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `flutter analyze` | 日志陈旧，真实状态未知                                                                | 首次进 CI 前本地（Windows）或 CI 跑一次 `build_runner build` + `analyze`，拿到真基线；规则按仓库「棘轮」思路，禁止新增 error          |
| 测试              | 7 文件 / 28 个 `test()`，其中 2 个是**打真网**的集成脚本（硬编码 `127.0.0.1:3000`）   | 真网脚本改为注入式 baseURL 并标 `@Tags(['integration'])`，默认 `flutter test` 不跑；纯逻辑测试（provider / fromJson / copyWith）进 CI |
| `avoid_print`     | 17 处，其中 3 处在生产代码（`chat_repository_impl.dart:70,75,78`）                    | 换 `debugPrint` 或删                                                                                                                  |
| 陈旧产物          | `analyze.txt` / `analyze_output*.txt` / `test_output.txt` / `flutter_0*.png` 都入了库 | 删除，改由 CI 产出                                                                                                                    |

---

## 9. 工期

按「AI 可代劳的部分」与「只能由你把关的部分」分开，不混算。

| 阶段                | AI 密集（可连续跑）                         | 人工/外部闸口                                        | 说明                                                             |
| ------------------- | ------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| P0 契约对齐         | 1 个工作会话（4 后端端点 + 2 Flutter 修改） | 真机回归 30 min                                      | 后端 4 处都是调现成 service，风险低                              |
| P1 契约快照 + CI 闸 | 半个会话                                    | —                                                    | 脚本 + 一个 job step                                             |
| P2 离线 + 同步      | 8–12 个会话                                 | 真机断网/回连实测 1–2 h（必须真人做）                | 最大块：drift 建表 → 7 个 provider 收口 → SyncService → 幂等测试 |
| P3 功能补齐         | 每项 0.5–1 个会话                           | —                                                    | 5 项合计 3–4 个会话                                              |
| P4 APK 链路         | 1–2 个会话                                  | 首次 CI 跑通（下载 Flutter 约 2–3 min/次）+ 签名决策 | 卡点通常在签名与 minSdk                                          |
| P5 质量门禁         | 1 个会话                                    | —                                                    | 需要先有一次真实 analyze 结果                                    |

**合计约 3–5 个 AI 密集工作日**，但**日历时间由你的会话数决定**（备考期每天 45 分钟的话，按 2–3 周排）。每阶段都可独立交付，P0 完成即可先出一个能用的 APK。

**关键路径**：P0 → P4（先让你手机上有个能用的包）→ P2（离线）→ P3（体验）→ P1/P5（护栏）。P1/P5 是工程债，不阻塞使用，但拖到后面成本会上升——建议 P4 后立刻插队做 P1。

---

## 10. 开工前要拍的两件事

1. **离线判分信任客户端**（5.4）——接受还是不接受？接受则 P2 简单一半。
2. **签名 keystore 现在就建**，还是先用 debug 签名凑合一段时间（后面要卸载重装）？

---

## 11. 执行进度（2026-11-18）

### 已完成

| 阶段    | 内容                                                                                | 证据                                                                                                                                                                        |
| ------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 #3   | 第一性原理请求体改为 `{questionContent, correctAnswer, explanation?, wrongAnswer?}` | `practice_repository.dart` / `_impl.dart` / `practice_provider.dart` 三处签名一致                                                                                           |
| P0 #4   | 练习模式收敛：仅 `random` 可选，其余置灰「暂未开放」                                | `practice_setup_screen.dart` 四个 `_PracticeMode` 均带 `enabled`                                                                                                            |
| P0 #5   | 错题本「开始练习」真正续练                                                          | 新增后端 `GET /api/practice/session/:sessionId`；Flutter `repo.getSession()` + `provider.loadSession()`；错题本改走 router `extra` 传参                                     |
| P0 #1   | 聊天会话 REST 四端点                                                                | `chat.ts` 新增 `GET/POST /sessions`、`GET/DELETE /sessions/:id`，复用 `services/chat.ts`                                                                                    |
| P0 #2   | 聊天流不再显示裸 JSON                                                               | `chat_repository_impl.dart` 改为跨 chunk 行缓冲 + 按 `type=="text-delta"` 取 `delta`；`Utf8Decoder.bind` 避免多字节字符被 chunk 边界截断                                    |
| P0 #6   | 套餐页不再永远降级                                                                  | 新增 `GET /api/billing/plans`（需登录），字段 `plans[].priceCents/features/name/slug` 对齐 `pricing_screen.dart`                                                            |
| P1      | 契约快照 + CI 闸                                                                    | `scripts/dump-openapi.ts` + `contract:dump/check` + ci.yml 的 `contract` job；实测「一致→0 / 漂移→1」                                                                       |
| P4      | APK 流水线                                                                          | `.github/workflows/android.yml`（ubuntu-latest，10 步），`baseUrl` 改 `--dart-define`，`applicationId` → `com.mintleaf84.aileaming`，签名脚手架（无 keystore 时回落 debug） |
| P2 后端 | 离线答题回传端点                                                                    | `POST /api/practice/offline-answers`，复用 `importService.importAgentAnswers`（`sessionKey` 幂等），走 JWT 而非 API Key                                                     |

另：`app/doc` 的 Hono app 从 `route.ts` 抽到 `src/lib/api/app.ts`，让快照脚本能在不起服务的前提下取到同一份文档（本机跑不了 `next build`）。

### 本机验证配方（原以为不可行，实际可用）

```bash
export PATH="/public/home/cjb/micromamba/envs/node20/bin:$PATH"
export NODE_OPTIONS=--experimental-require-module
export LD_PRELOAD=/public/home/cjb/local/lib/libcxa218.so
npm run typecheck && npm run lint:ci && npx vitest run --maxWorkers=8 && npm run audit:catches
```

`next build` 仍然不可行（`@next/swc-linux-x64-gnu` 要 GLIBC_2.27），构建校验走 CI。

### P2 的一处取舍变更

原计划用 **drift** 做本地库。现实约束：drift 依赖 `build_runner` 生成代码，而这台机器没有 Flutter SDK，**改了表结构无法本地重新生成**，只能靠 CI 往返——每次改表都要等一轮 Actions，迭代成本过高。

改为 **sqflite（手写 SQL，无 codegen）**：牺牲类型安全，换取「不依赖代码生成即可迭代」。等价收益下这是更稳的选择；若将来本机或 CI 能常驻跑 `build_runner`，再评估迁回 drift。

### P2 完成情况（2026-11-18 二次更新）

| 组件                                                   | 文件                                                   | 状态 |
| ------------------------------------------------------ | ------------------------------------------------------ | ---- |
| 本地库（4 表 + 索引）                                  | `lib/core/local/local_db.dart`                         | 完成 |
| 题目缓存 / 随机抽题 / 本地会话 / 待同步聚合            | `lib/features/practice/data/local_practice_store.dart` | 完成 |
| 同步服务（幂等 flush、401 中止、单会话失败不拖垮整批） | `lib/core/sync/sync_service.dart`                      | 完成 |
| 接线（远端失败降级本地出题、本地判分、启动补交）       | `practice_repository_impl.dart` + `main.dart`          | 完成 |
| 离线可见性（练习页提示条、设置页真同步与待同步条数）   | `practice_screen.dart` / `settings_screen.dart`        | 完成 |

离线判分口径（2026-11-18 修订）：

- 多选题提交值是 `jsonEncode(["A","B"])`，判分前先解出选项再比较，否则所有多选都会判错；
- 只有选项类题型（single/multi/truefalse）按字母集合比较（忽略顺序），填空/简答按整串比较（避免 `CAT`/`ACT` 被判相同）；
- 出题与判分都会检查缓存新鲜度（`cacheMaxAgeDays = 7`）：`pickRandom` 只取有 `answer` 且未过期的题，`questionById` 同样过期即视为不可用——宁可报「请联网」，也不用旧答案污染掌握度。

**仍未做**：`cached_questions` 没存 `dimension`（离线重建的题目该字段为 null，目前无 UI 依赖它）；离线只覆盖练习，recall/聊天仍是在线专属。

### P5 完成情况

- 两个打真网的集成测试加 `@Tags(['integration'])` + `dart_test.yaml` 默认 skip，需要时 `flutter test --run-skipped -t integration`
- 删除入库的陈旧产物：`analyze.txt` / `analyze_output*.txt` / `test_output.txt` / `flutter_0*.png`

### CI 现状（PR #210）

`flutter analyze`、`lint:ci`、`typecheck`、`vitest`（210 文件 / 1716 用例）、`next build`、`OpenAPI 契约快照`、UI 护栏全部通过。APK 打包 job 仍未真正跑过一次。

### API_BASE_URL 是可选配置

`android.yml` 的 `apk` job 只在 `vars.API_BASE_URL` 为空时给 `::warning::` 并继续出包——
产物启动后进入「需要配置服务器地址」页，用户可在 App 内填写并持久化（三级回落：运行时设置 >
编译期 dart-define > 未配置）。因此它不阻塞出包；有部署域名时设置变量只是为了省掉用户首次配置。

### 最终收口（2026-11-18）

P0 七条全部落地：契约对齐四项（第一性原理请求体、练习模式收敛、错题本续练、套餐页）+
聊天会话四端点 + 聊天流解析；追加第七条——**注册页删掉邮箱输入框**（后端 `POST /auth/register`
只接受 username/password，users 表无 email 列）。

P3 全部完成：

| 项           | 结果                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| 设置页真数据 | 用户名读 `profileControllerProvider`；邮箱行删除（后端无此字段）；「清理缓存」显示本地真实题数           |
| 掌握度入口   | profile 快捷区新增「掌握度」，`/mastery` 从无人可达变为可达                                              |
| 知识卡新建   | FAB 打开对话框（正面/背面/可选分类），复用 `KnowledgeController.createCard`，字段对齐 `CreateCardSchema` |
| 首页待办     | 由 `LearningStats` 推导（今日还差几题 / 今日错题复盘 / 连续天数），无占位文案                            |
| 题库搜索     | `applySearch()` 走 `GET /questions?search=`，搜索框不再是「开发中」                                      |

### 未做（明确记录，不是遗漏）

- **APK 实际打包**：按用户决定暂不出包。`android.yml` 的 `apk` job 已就绪（`API_BASE_URL` 未配置时只告警，
  产物由用户在 App 内填服务器地址），需要时设置仓库变量并触发一次即可，无需改代码。
- `cached_questions` 未存 `dimension`；离线只覆盖练习，recall 与 AI 聊天仍是在线专属。

## 12. 覆盖率门禁与测试补强（2026-11-20）

### 12.1 为什么先立门禁

改之前 Flutter 端只有 182 个用例、全部落在纯逻辑层，`android.yml` 里 `flutter test` 是硬闸但**没有覆盖率环节**，
所以"补测试"是一次性努力：谁都可以加代码不加测试，数字只会往下漂。因此先落门禁，再补测试。

口径有三条是刻意的：

1. **分母来自文件系统枚举 `lib/**/*.dart`**，不是 lcov 里出现的文件。`flutter test --coverage` 只上报被测试
   传递 import 到的文件——按 lcov 当分母，"新增一个没人 import 的文件"反而会让全局数字变好看。
   未出现在 lcov 的手写文件按"非空非注释行数"补 LF 代理、命中记 0（本次有 7 个，含
   `shared/widgets/server_config_gate.dart`、`features/recall/data/recall_providers.dart`）。
2. **生成代码不计入**（`*.g.dart` / `*.freezed.dart`）与 `lib/main.dart` 排除，避免拿生成物冲数字。
3. **分 scope 设底线**，因为单一全局数字会被最好的模块掩盖：`domain_data`（features/*/domain|data）、
   `core`、`shared`、`providers`、`screens`、`other` 六个互斥 scope 各有 floor。

### 12.2 落地物

| 文件                                 | 作用                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `mobile_app/tool/coverage_gate.dart` | 纯 Dart（仅 `dart:io`），解析 lcov + 枚举分母 + 四条拦截规则 + markdown 报告                     |
| `mobile_app/coverage_baseline.json`  | 各 scope 的 floor 与逐文件 measured，**只升不降**                                                |
| `.github/workflows/android.yml`      | `flutter test --coverage` → 覆盖率门禁 → 上传 `coverage/lcov.info`（`if: always()`，保留 14 天） |

四条拦截规则：全局 < floor、任一 scope < floor、基线内单文件回退 > 2pp、基线外新增文件落在
domain/data/core/shared 且 < 60%。

用法：

```bash
dart run tool/coverage_gate.dart                    # 判定（CI 跑的就是这条）
dart run tool/coverage_gate.dart --update           # 只升不降地抬底线（floor = max(旧, 实测-1pp)）
dart run tool/coverage_gate.dart --update --allow-lower   # 确需下调，并在 PR 描述写理由
```

### 12.3 前后对比（P0–P4 已落地）

| 指标          | 改前（2026-11-19，origin/main） | 改后（2026-11-20）                       |
| ------------- | ------------------------------- | ---------------------------------------- |
| 用例数        | 182 passed / 2 skipped          | **429 passed / 2 skipped**               |
| 全局行覆盖    | 21.7%（1628 / 7499）            | **34.2%（2574 / 7528）**                 |
| `domain_data` | 44.5%                           | **80.7%**                                |
| `core`        | 35.3%                           | **74.1%**                                |
| `shared`      | 4.6%                            | **20.5%**（P5 未做）                     |
| `providers`   | 24.5%                           | **84.4%**                                |
| `screens`     | 17.8%                           | 17.8%（P5 未做；其中 recall 贡献大部分） |

分阶段：P0–P2 → 26.5%；P3（9 个 provider）→ 33.0%；P4（本地库/同步）→ 33.6%（P4 的分母主要落在 `screens`，所以全局涨幅小但风险降得最多）。

关键文件（单文件覆盖率）：

| 文件                                                   |            改前 |       改后 |
| ------------------------------------------------------ | --------------: | ---------: |
| `core/auth/token_util.dart`                            |              0% |      95.2% |
| `core/navigation/app_nav.dart`                         |              0% |      83.3% |
| `core/theme/theme_provider.dart`                       |              0% |       100% |
| `core/utils/haptic_util.dart`                          |              0% |      93.3% |
| `shared/widgets/server_config_gate.dart`               | 0%（未进 lcov） |       100% |
| `features/practice/data/practice_repository_impl.dart` |            2.3% |      83.0% |
| `features/wrong_book/data/wrong_book_repository.dart`  |              0% |      92.6% |
| `features/chat/data/chat_repository_impl.dart`         |              0% |      77.8% |
| `features/auth/data/auth_repository_impl.dart`         |              0% |      81.2% |
| `features/practice/data/local_practice_store.dart`     |              0% |      99.3% |
| `core/local/local_schema.dart`（本次抽出）             |               — |      90.9% |
| `core/sync/sync_service.dart`                          |            2.7% |      80.0% |
| 9 个 `*_provider.dart`                                 |         0–15.6% | 87.5%–100% |

新增 22 个文件（20 个测试文件 + 2 个共享桩 `test/support/{recording_adapter,ffi_db}.dart`），
另在既有 `textbook_provider_test.dart` 追加 211 行（零删除）。测试文件数 18 → 38。
全部沿用既有写法（手写 fake、`ProviderContainer` override、断言"发出去的请求"而不是服务端实现），
未引入除 `sqflite_common_ffi` 之外的新依赖。

### 12.4 本机跑测试的配方

```bash
export PATH=~/local/sdk/flutter/bin:$PATH PUB_CACHE=~/local/sdk/pubcache
cd mobile_app && flutter test --coverage && dart run tool/coverage_gate.dart
```

本机 glibc 2.17，`flutter_tester.real` 需要 2.18，`bin/cache/artifacts/engine/linux-x64/flutter_tester`
是一个 loader 包装脚本。**注意**：以 loader 直接执行时 `/proc/self/exe` 指向 loader，引擎按它找不到
`icudtl.dat`，所以包装脚本必须显式传 `--icu-data-file-path=<engine>/icudtl.dat`（2026-11-20 修复，
缺这一条时所有测试都会以 `icu_util.cc Check failed` 崩溃）。重建 SDK 后要重新打这个补丁。

`flutter test` 会改 3 个 plugin registrant（macos / windows），提交前 `git checkout --` 还原。

### 12.5 后续阶段（只剩 P5）

| 阶段 | 范围                                                                                                                                                                                | 预计增量                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| P5   | 6 个高风险屏的 widget 冒烟（practice 367、history_detail 401、wrong_book 332、settings 341、dashboard 332、chat 254）+ `shared/widgets` 的 5 个自建组件，只断言渲染/关键交互/不溢出 | +10pp，全局到 ~43%，`screens` 从 17.8% 到 ~30% |

P3（9 个 provider）与 P4（本地库/同步）已完成，见 12.3。

不做的：14 个屏全铺 widget 测试、给生成代码写测试、追 80% 这个数字本身。

### 12.5.1 P4 的环境坑：`sqflite_common_ffi` 必须锁 2.3.7+1

`sqflite_common_ffi` 2.4.x 起依赖 `package:sqlite3` 3.x，用 Dart build hooks 下载官方预编译
`libsqlite3.so`——那个二进制要求 **GLIBC 2.33**，本机 CentOS 7（glibc 2.17）加载即失败
（`version 'GLIBC_2.33' not found`），且到 `release-assets.githubusercontent.com` 也不通。
因此锁 `sqflite_common_ffi: 2.3.7+1`（走系统 `libsqlite3.so.0`），并在 `test/support/ffi_db.dart` 里：

- `open.overrideFor(OperatingSystem.linux, () => DynamicLibrary.open('libsqlite3.so.0'))`——本机只有运行时库，没有 `-dev` 的 `.so` 软链；
- 用 `databaseFactoryFfiNoIsolate`——`overrideFor` 只作用于当前 isolate，isolate 版本会重新 dlopen 丢掉 override。

CI（ubuntu-latest）两样都有，不受影响；但**不要**顺手升级这个依赖，会直接打挂本机测试。

### 12.6 补测试时发现、**已修**的缺陷（2026-11-20 第二轮）

这些是补测试时"按当前行为锁定"的问题，随后单独修掉，测试断言同步改严（没有删用例、没有放宽）：

| 缺陷                                                                                                                                      | 修法                                                                                                                                                                                                                                        | 回归护栏                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `chat_provider.retryLastMessage` 重试会再追加一条相同的用户消息，且 `_streamSubscription` 单字段被覆盖，`stopGeneration` 只能取消最后一次 | `sendMessage` 加 generation 令牌（`_generation`）+ `appendUserMessage` 开关；流回调、`onDone`、`onError` 全部先比对令牌；`clearMessages` 复位生成标志                                                                                       | 重试后 `role=='user'` 恰好 1 条；"连续两次 sendMessage，第一次流的迟到回调不污染第二次"（用可迟到的假流构造）                    |
| 登出后旧账号的历史与对话仍留在内存；`history.loadMore` 会把新账号第 2 页拼到旧账号第 1 页之后                                             | 新增 `authEpochProvider`（登录/注册成功、登出各 +1），`history`/`chat` 改 watch 版本号并重建。**不能**直接 watch `authControllerProvider`：它的 state 是 `AsyncValue<void>`，登出写入的 `AsyncData(null)` 与旧值相等，Riverpod 判等后不通知 | 登出后列表/对话清空、`currentSessionId == null`；loadMore 不含旧账号数据；变异验证：注释掉 `logout` 里的 `bump()` → 4 条用例变红 |
| `history` / `knowledge` / `textbook` 无请求序号防护，先发后到的旧响应覆盖新结果                                                           | 三个 controller 统一 `int _requestSeq`，成功与失败分支都在写 state 前比对                                                                                                                                                                   | 并发用例改为"最新请求胜出"；另加"旧请求的 500 不能盖掉新结果"                                                                    |
| `wrong_book.startPractice` 抛异常/服务端 `success=false` 时静默返回 null（界面"点了没反应"）；`markAsMastered` 失败无提示                 | 两条失败路径都写 `error`；标记掌握/取消掌握失败也写 `error` 且不清空列表                                                                                                                                                                    | 断言 `error` 文案存在且列表长度不变                                                                                              |
| `SyncService.startAutoSync` 的连通性回调无并发闸，网络抖动可并发跑多个 `flush()`                                                          | `bool _flushing` + `try/finally`，重复调用直接返回 `SyncResult.empty()`                                                                                                                                                                     | 用 `Completer` 卡住第一次响应构造并发，断言 `adapter.requests` 只有 1 条                                                         |

### 12.7 仍未修（需产品/lib 决策）

1. `AuthRepositoryImpl.login/register`：服务端漏发 `token` 时 `_storage.write(value: null)` 静默不写并正常返回，
   用户看到"登录成功"但下一个请求 401。建议加 `if (token == null) throw ...`。
2. `ChatRepositoryImpl` 的 `if (response.statusCode != 200)` 不可达（Dio 对非 2xx 先抛），是死代码。
3. `PracticeRepositoryImpl.submitAnswer` 在线路径 `int.parse(questionId)`：非数字题号抛 `FormatException`
   而不是可读业务错误。
4. `chatRepositoryProvider` 的"克隆 dio + 剔除 LogInterceptor"逻辑无测试（provider 级）。
5. `AppNav.replace` 与 go_router 的 `GoRouterHelper.replace` 签名相同：任何同时 import 两者并调
   `context.replace(...)` 的文件会报 "defined in multiple extensions"。当前生产代码没踩到。
6. `auth_provider.logout` 没有 `AsyncValue.guard`：仓库抛异常时异常冒到调用方、状态不变，
   界面无法提示"登出失败"。
7. `createLocalSession` 用 `microsecondsSinceEpoch` 生成 localId，同一微秒内建两个会话会主键冲突（概率极低）。
8. `settings_provider`（复习模式）与 `theme_provider`（主题）都没有持久化层，重启回默认。
9. 三个状态类的 `copyWith` 里 `error` 是无条件覆盖，无法"保留错误 + 更新其他字段"；
   反过来说任何一次 `copyWith(isLoading: ...)` 都会顺手吞掉错误。

## 13. 覆盖率门禁第二轮：PR 作用域（2026-11-20）

### 13.1 为什么要改：第一轮当天误伤两个 PR

§12 的门禁把两条规则当成**全局**规则，而 CI 跑的是「分支 + 最新 main」的合并结果：

| PR   | 误报                                                        | 根因                                                |
| ---- | ----------------------------------------------------------- | --------------------------------------------------- |
| #248 | `lib/core/compat/app_version.dart` 被拦"新增文件 <60%"      | 文件是 main 新增的，不在基线里，被当成"本 PR 新增"  |
| #247 | `lib/shared/skeletons/skeleton_fakes.dart` 被拦单文件回退   | 本 PR 改了这个文件（行数变化 → 95.5% vs 基线 100%） |
| #247 | `lib/core/theme/app_colors.dart`（50 行配色常量）被要求 60% | 口径过宽：常量文件没有行为可测                      |

结论：规则本身没错，缺的是**作用域**——"这个文件是不是本 PR 引入/改动的"必须问 git，而不是问基线。

### 13.2 六条口径（G1–G6）

| #   | 口径                                                                                                                                                                     | 实现位置                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| G1  | 默认基线 `git merge-base HEAD origin/main`，回退 `origin/master`；都失败则**降级**并明确警告，只跳过 G2/G4，global/scope 底线与"基线外文件"规则照旧；支持 `--base=<sha>` | `coverage_gate.dart::_resolveBase` + `runGate` 的 `degraded` 分支 |
| G2  | "新增文件 <60%"只看 `git diff --diff-filter=A <base>...HEAD -- lib`                                                                                                      | `runGate` 第 4 段                                                 |
| G3  | 该规则再收窄到逻辑层：`features/*/{data,domain}/**`、`lib/core/**`（排除 `lib/core/theme/**`）、`lib/shared/datasources/**`                                              | `requiresNewFileCoverage`                                         |
| G4  | 单文件回退（>2pp）只对本 PR **未触碰**的文件生效（`git diff --name-only <base>...HEAD -- lib`）                                                                          | `runGate` 第 3 段                                                 |
| G5  | 报告"本 PR 净变化"：`git diff -U0` 的 `@@` 头取 `+` 侧行号，与 lcov `DA:` 行号求交；再报 global − 基线 measured                                                          | `parseAddedLineRanges` + `_netChange`                             |
| G6  | 基线新增 `exempt` 清单：跳过两条拦截，但**仍计入分母**                                                                                                                   | `exemptPathsOf` / `applyUpdate` 原样保留                          |

### 13.3 代码结构

门禁拆成三层，判定逻辑全部可单测（不读 git、不依赖 cwd）：

- `tool/coverage_lib.dart`：`parseLcov` / `enumerateLibFiles` / `proxyLineCount` / `scopeOf` /
  `requiresNewFileCoverage` / `parseAddedLineRanges` / `runGate(GateInput) → GateResult` /
  `applyUpdate` / `buildReport`。输入（`coverage`、`baseline`、`addedFiles`、`touchedFiles`、
  `addedLineRanges`、`proxyLineCounts`、`exemptPaths`、`base`）全部显式传入。
- `tool/coverage_gate.dart`：只剩参数解析 → 读 lcov/基线 → 调 git → `runGate` → 输出与退出码。
- `test/tool/coverage_lib_test.dart`：8 条纯 Dart 用例，覆盖上表每一条（含两次误报的最小复现）。

### 13.4 验收结果（本机，2026-11-20）

| 项                                                | 结果                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| `dart analyze tool/`                              | No issues found                                                            |
| `flutter analyze`                                 | 0 error / 0 warning（29 info 为存量）                                      |
| `flutter test test/tool`                          | 8 passed                                                                   |
| `flutter test --coverage`                         | 521 passed、2 skipped                                                      |
| `dart run tool/coverage_gate.dart`                | PASS；103 文件 / 7837 行 / 36.6%（floor 35.6%），7 个 LF 代理，exempt 1 个 |
| `--base=HEAD~6`（演示非零净变化）                 | 新增可执行行 403 行、覆盖 384 行（95.3%）                                  |
| 变异 a（清空 `addedFiles`，基线外低覆盖文件存在） | 不再报"新增文件"，exit 0                                                   |
| 变异 b（把 touched 文件从 `touchedFiles` 移除）   | 报单文件回退（81.3% vs 99.0%），exit 1                                     |
| 变异 c（`--base=deadbeef`）                       | 打印"无法解析成 commit，已跳过 PR 作用域规则（G2/G4）"，exit 0             |
| `--update`（对基线副本）                          | 只升不降逻辑不变，`exempt` 原样保留                                        |

### 13.5 与计划不一致处

1. 计划说"在 §13 末尾追加 13.6"，但本分支文档只到 §12，没有 §13；本次新建 §13 并把实施记录放在 13.6。
2. 计划用 `lib/core/theme/app_colors.dart` 当 G3 的反例，该文件在本分支**不存在**（属 PR #247 的另一处改动），
   因此 G3 只用纯路径单测锁定口径，未对真实文件断言。
3. G5 需要可解析的 base：本分支改动未提交时 `merge-base HEAD origin/main == HEAD`，净变化自然是 0 行；
   验收里另用 `--base=HEAD~6` 演示非零统计（403 行 / 95.3%）。
4. G1 降级不是"完全跳过新增文件规则"：按计划原文，它退化为"基线外文件全量检查"，报告里以警告说明。
5. `*.g.dart` / `*.freezed.dart` / `lib/main.dart` 的排除仍写在 `enumerateLibFiles` 内部（未参数化）。

### 13.6 实施记录（2026-11-20）

- 新增 `mobile_app/tool/coverage_lib.dart`（判定逻辑）、`mobile_app/test/tool/coverage_lib_test.dart`（8 条用例）。
- 重写 `mobile_app/tool/coverage_gate.dart` 为薄 CLI：`--update` / `--allow-lower` / `--lcov=` / `--baseline=`
  语义不变，新增 `--base=<sha>`。
- `mobile_app/coverage_baseline.json` 增加 `exempt`，初值 `lib/core/theme/app_icons.dart`（lcov 只认 1 行、实测 0%）。
- `.github/workflows/android.yml` 的 analyze job 改为 `fetch-depth: 0`（`merge-base` 需要完整历史）。
- 未改 `lib/` 下任何生产代码；未 commit。

## 14. 覆盖率后续（P5 与 §12.7 分级）

| 阶段 | 范围                                                                                                                                                                    | 预计                            | 前置                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------- |
| P5   | 6 个高风险屏（practice 367 / history_detail 401 / wrong_book 332 / settings 341 / dashboard 332 / chat 254）+ `shared/widgets` 5 个自建组件，只断言渲染/关键交互/不溢出 | global → ~43%，`screens` → ~30% | 无（可与 §13 并行） |
| P5b  | 4 个最大屏的"错误态/空态"分支（配合 #247 引入的 `state_views`）                                                                                                         | `screens` → ~35%                | #247 合入           |

§12.7 的 9 条按影响分级，不做一次性清理：

| 级别 | 条目                                                                                       | 理由                                              |
| ---- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| P0   | ①登录漏发 token 静默成功 ⑥`auth.logout` 无 guard                                           | 用户可见的错误被吞掉，且会让人误以为已登录/已登出 |
| P1   | ⑧settings/theme 无持久化 ③`int.parse(questionId)` 抛 `FormatException`                     | 体验问题；后者是错误文案不可读                    |
| P2   | ②死代码 ④provider 无测试 ⑤`AppNav.replace` 扩展冲突 ⑦localId 微秒冲突 ⑨`copyWith` 吞 error | 无当前触发路径，随相关改动顺带处理                |

## 15. #247 收口（计划）

### 15.1 现状

- 分支 `fix/mobile-ui-tokens`（worktree `~/ai-leaming-wt-mobile`），37 文件 +1482/−842
- CI 红 7 项：global 34.5%<35.6、core 69.3<75.5、shared 41.4<46.0、screens 16.6<16.8、
  `skeleton_fakes.dart` 回退 4.5pp、`app_colors.dart` 2%、`state_views.dart` 1.3%
- **该 worktree 里已有 4 个未提交测试（493 行）**：`test/shared/state_views_test.dart`、
  `test/core/theme/app_colors_test.dart`、`test/features/recall/recall_widgets_test.dart`、
  改过的 `test/shared/skeleton_fakes_test.dart` —— 正好对应上面两条"新增文件"和一条"回退"

### 15.2 步骤

| #   | 动作                                                                                 | 判据                                                                      |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 1   | 确认那 4 个测试的归属（另一个会话在写就等它收尾，不并发改）                          | 文件 mtime 与 git status 稳定                                             |
| 2   | 在 wt-mobile 跑 `flutter test test/shared test/core/theme test/features/recall`      | 全绿；`state_views`/`app_colors` 覆盖 ≥60%                                |
| 3   | rebase 到含门禁第二轮的 main                                                         | 无冲突；`flutter pub get` 后全量 `flutter test` 绿                        |
| 4   | 本地跑 `flutter test --coverage && dart run tool/coverage_gate.dart`                 | 只剩"真该拦"项：不得再出现 touched 文件的单文件回退、常量文件的"新增"违规 |
| 5   | 若 global 仍低于 floor：二选一 —— 补测 / `--update --allow-lower` 并在 PR 描述写理由 | 二选一必须显式记录，不许静默改基线                                        |
| 6   | push → CI 全绿 → squash 合并                                                         | 12 项检查                                                                 |

### 15.3 不做

- 不给 20 个屏补 widget 测试（那是 P5，不是这个 PR 的职责）
- 不把 `app_colors.dart` 塞进 `exempt` 来"绕过"——既然已有测试，就让它正常计入

## 16. P0 缺陷修复（计划）

两条都属于"错误被吞掉、用户误以为成功"：

| 缺陷                                                            | 修法                                                                                     | 新增测试                                                                            | UI 影响                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| `AuthRepositoryImpl.login/register` 在响应无 `token` 时静默成功 | 取到 token 后判空，抛 `AuthException('登录响应缺少 token')`（消息面向用户）              | 3 条：无 token → 抛错且**不写** `jwt_token`；有 token → 写入；空串 token 同无 token | 登录页已有 error 展示，无需改 UI             |
| `auth_provider.logout` 无 `AsyncValue.guard`                    | `state = await AsyncValue.guard(() => repo.logout())`；`authEpoch.bump()` 只在成功后调用 | 2 条：仓库抛错 → `state.hasError` 且 epoch 不变、界面不跳转；成功 → epoch +1        | 设置页目前不显示登出失败，**是否加提示待定** |

顺序：先登录 token（纯数据层，零 UI 风险），再 logout（要决定 UI）。

### 16.1 修复时发现的两个补充点

1. **`state.hasValue` 不能用**：Riverpod 3 的 `AsyncError` 会合并上一次的 `AsyncData` 的值，
   因此 `AsyncValue.guard` 失败后 `hasValue == true`。判据必须写 `!state.hasError`（已用变异测试证明
   原写法会把失败当成功）。
2. **第三个 logout 调用点**：`splash_screen.dart:36` 直接调 `repo.logout()`（不经过 controller），
   没有 guard 也没有 epoch。它不在本次 5 文件范围内，列为 P0 尾项一并处理（改走 controller 即可）。

## 17. P5 逐屏冒烟（计划）

原则：**只断言"渲染不崩 + 关键状态可见 + 不溢出"**，不追像素、不断言长文案原文（文案会改）。
统一用假 repository / override provider 喂数据，禁止打真实网络。

| 屏                       | 行数 | 必须覆盖的状态                                    | 断言什么                                                   | 不做什么                      |
| ------------------------ | ---: | ------------------------------------------------- | ---------------------------------------------------------- | ----------------------------- |
| `practice_screen`        |  367 | loading / 作答中 / 判分反馈 / 提交失败（断网）    | 题干与选项渲染；选中态切换；失败时停在当前题且有可重试入口 | 不测计时器精度、不测音效/触感 |
| `history_detail_screen`  |  401 | 有 logs / 空 logs / 加载失败                      | 会话摘要与 log 行数；空态文案；失败可重试                  | 不测图表像素                  |
| `wrong_book_screen`      |  332 | 列表 / 按标签 / 已掌握 / 多选                     | 三视图切换后列表内容正确；多选计数；"开始练习"按钮可用性   | 不测动画                      |
| `settings_screen`        |  341 | 服务器地址已配/未配 / 清理缓存                    | 表单回填；清理后题数归零提示；登出入口存在                 | 不测键盘行为                  |
| `dashboard_screen`       |  332 | 有待办 / 无待办                                   | 三张待办卡按 `LearningStats` 显示；无数据时不出现假数字    | 不测下拉刷新动画              |
| `chat_screen`            |  254 | 空对话 / 生成中 / 失败可重试                      | 发送后出现占位；停止按钮出现；失败消息带重试               | 不测流式逐字动画              |
| `shared/widgets`（5 个） |  449 | 四态（loading/empty/error/data）、选中/禁用、折叠 | 每个组件 2–4 条渲染断言                                    | 不测配色像素值                |

预计：全局 → ~43%，`screens` 17.8% → ~30%。**前置**：#247 合入（它引入了 `state_views` 统一四态，P5 直接复用）。

## 18. 门禁第三轮（明确不做，记录理由）

"只统计本 PR 新增行被覆盖的比例"（diff coverage）是业界标准做法，但在 G5 已给出净变化、
G1–G4 已修掉两类误报的前提下，收益递减：需要把 lcov 行号与 diff hunk 精确对齐，误判成本高于收益。
等出现"G5 报告看不懂"或"PR 反复因 1 行未覆盖卡住"再考虑。

## 19. 设置持久化（计划）

### 19.1 现状

- `mobile_app/lib` 里 **0 处 `shared_preferences`**（`pubspec.yaml` 也没有该依赖）
- `theme_provider.dart`：`build()` 恒返回 `ThemeMode.system`，切了只活在内存
- `settings_provider.dart`：复习模式默认 `ReviewMode.list`，重启回默认
- 后果：每次冷启动主题跳回浅色、复习模式重置——用户每天要重设一次，且会以为"设置没生效"

### 19.2 修法

| #   | 动作                                                                                                                     | 判据                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| 1   | `pubspec.yaml` 加 `shared_preferences`                                                                                   | `flutter pub get` 后 `pubspec.lock` 有对应条目 |
| 2   | 新增 `core/storage/preferences.dart`：`PreferencesStore` 抽象（`readString/writeString`）+ `SharedPreferencesStore` 实现 | 便于测试注入，不在 provider 里直接调静态 API   |
| 3   | `theme_provider` 启动读 `theme_mode`（`system/light/dark`），非法值或读失败 → 回 `system`                                | 单测：往返、非法值兜底、读抛错兜底             |
| 4   | `settings_provider` 同理读写 `review_mode`                                                                               | 单测：同上                                     |
| 5   | 写入失败**不能**让 UI 报错或回滚（设置仍然生效，只是下次启动丢）                                                         | 单测：写抛错 → 状态仍更新，仅 `debugPrint`     |

### 19.3 验收

- `flutter test` 全绿（新增 6 条）；`flutter analyze` error/warning = 0
- 门禁：`domain_data`/`providers` 不应下降（新增代码都有测）
- 手工：改主题 → 杀进程 → 重开仍是暗色

工作量：0.5 天。

## 20. 离线边界与提示（计划）

### 20.1 现状

- 离线只覆盖练习（`cached_questions` + `pending_answers` + `SyncService`）
- recall（记忆卡）与聊天**没有本地层**：断网进入 recall 会先转圈再报错，聊天发送后卡在占位
- 没有统一的"当前无网"信号（`connectivity_plus` 只被 `SyncService` 用）

### 20.2 两个方案

| 方案          | 范围                                                                                                                                       | 判据                                                                               | 工作量 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------ |
| **A（先做）** | 断网时给明确提示并禁用入口：recall/chat 的入口按钮显示"需要联网"，点进去显示统一离线态（复用 #247 的 `state_views`）；聊天发送前拦截并提示 | 断网 → recall 入口禁用且文案明确；聊天点发送不产生空占位；恢复网络后入口自动可用   | 0.5 天 |
| B（后续）     | recall 队列本地缓存 + 提交入队，复用 `pending_answers` 的幂等键模式                                                                        | 断网可打开缓存的队列、可提交（入队）、回网 flush 幂等；`pendingCount` 覆盖两类数据 | 1–2 天 |

### 20.3 决策点

- 是否值得为 recall 做离线（备考场景地铁/教室无网）—— 取决于真实使用里"无网时是否想背卡"
- 若做 B，需要给 `pending_answers` 加 `kind` 列（`practice` / `recall`），涉及 v2→v3 迁移，**必须**有迁移测试（`local_schema_test.dart` 已有 v1→v2 先例）

先做 A；B 等 A 上线后用真实反馈决定。

## 21. 移动端可访问性（计划）

### 21.1 现状（`grep` 实测，main）

| 指标                                      |                  数量 | 含义                                                 |
| ----------------------------------------- | --------------------: | ---------------------------------------------------- |
| `Semantics(`                              | 3（116 个 dart 文件） | 几乎为零                                             |
| `IconButton(`                             |                    33 | 只有 4 处有 `tooltip:` → 约 29 个图标按钮读屏无标签  |
| `SemanticsService`                        |                     0 | 判分对错、同步完成、加载失败全靠视觉，读屏用户全静默 |
| 可点容器（`GestureDetector(`/`InkWell(`） |                    30 | 多半没有 `button: true` 与 label                     |
| `ExcludeSemantics`                        |                     0 | 装饰性图标没被排除，读屏会念出无意义内容             |

Web 侧已有 a11y 棘轮（`eslint jsx-a11y` + 交互类命中 45→0），移动端目前**一条护栏都没有**。

### 21.2 分三批

| 批次        | 范围                                                                                                               | 判据                                                                                        | 工作量 |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------ |
| B1 图标按钮 | 33 处 `IconButton` 补 `tooltip:`（同时作为语义标签）；装饰性 `Icon` 包 `ExcludeSemantics`                          | 静态扫描测试：每个 `IconButton(` 附近必须有 `tooltip:` 或 `semanticsLabel:`，白名单只减不增 | 0.5d   |
| B2 可点容器 | 30 处 `GestureDetector`/`InkWell` 加 `Semantics(button: true, label: ...)`，或换成带语义的 `InkWell` + `Semantics` | 同上：可点容器必须有 label；白名单只减不增                                                  | 0.5d   |
| B3 状态播报 | 判分结果、同步完成、加载失败三处 `SemanticsService.announce`                                                       | 单测：调用发生时播报文案正确（mock `SemanticsService`）                                     | 0.5d   |

### 21.3 验收

- TalkBack（Android）/ VoiceOver（iOS）走查 5 条关键流：登录 → 刷题 → 错题本 → 设置 → recall
- `flutter analyze` 0 error/warning；新增静态扫描测试进 `flutter test`（与 `navigation_rules_test.dart` 同一套路）

## 22. P5 的测试基建与反模式（计划）

P5 要新增约 20 个 widget 测试文件，先定基建，否则每个文件各写一套、且容易变成脆测试。

### 22.1 基建（写进 `test/support/`）

| 文件                  | 内容                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pump_screen.dart`    | `pumpScreen(tester, Widget child, {overrides})`：统一 `ScreenUtil.init`（375×667，`textScaler` 1.0 与 1.3 两档）+ `MaterialApp` + `ProviderScope` |
| `fake_providers.dart` | 每个 provider 一个 override 工厂（`fakePractice(questions: ...)`），集中管理，避免每个测试自己拼                                                  |

### 22.2 反模式（写进文件头，review 时逐条核）

1. 不断言文案原文——用 `find.byKey` 或语义标签（文案会改，测试不该跟着改）
2. 不断言像素/颜色值——那是 golden 的活，P5 不做 golden
3. 不用 `Future.delayed` 等待——用 `pumpAndSettle` + 可控的假流/假 Completer
4. 不测第三方组件内部（`Skeletonizer`/`flutter_markdown` 自己渲染成什么）
5. 每个测试只锁一件事，名字写"行为 + 理由"

### 22.3 覆盖率目标曲线与性能预算

| 阶段                 | global | `screens` | `shared` |
| -------------------- | -----: | --------: | -------: |
| 现状                 |  36.6% |     17.8% |    47.0% |
| P5 完成              |   ~43% |      ~30% |     ~55% |
| P5b（错误/空态分支） |   ~46% |      ~35% |     ~60% |

- 单测耗时预算：每条 < 300ms；`flutter test` 总时长 < 90s（当前约 48s，P5 后需盯住，超了就拆 `integration` 标签）

## 23. 真机验收闭环（计划）

### 23.1 现状

`mobile_app` 从未在真机验收：暗色 20 屏、Android 15 返回手势、iOS 侧滑、三处图标差异都只有"代码层结论"。
`android.yml` 的 `apk` job 已就绪（`workflow_dispatch` / tag 触发），但产物没有形成验收记录。

### 23.2 流程

| #   | 动作                                                                                                             | 产物                           |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | 触发 `Android` workflow（`workflow_dispatch`）                                                                   | APK artifact（约 53MB）        |
| 2   | 装到你的手机                                                                                                     | —                              |
| 3   | 按 12 项清单逐条截图：暗色下 6 屏 / 浅色下 2 屏 / 返回手势 / 侧滑 / 长文本 1.3 倍字号 / 键盘弹出 / 空态 / 错误态 | `docs/verify/2026-11-xx/*.png` |
| 4   | 结论写回 `docs/mobile-ui-kit.md` 的"未完成事项"                                                                  | 逐条"已验/未验 + 结论"         |

### 23.3 判据

清单 12 项逐条有截图或明确标"未验"，不允许只写"应该没问题"。
工作量：清单 0.5d + 你的手机时间；每次 UI PR 合入后复用同一清单。

## 24. 错误文案统一（计划）

### 24.1 现状

用户会直接看到：`'服务器打盹了 (${statusCode ?? "未知"})'`（`login_screen.dart:39`）、
`FormatException: ...` 原文（`practice_repository_impl.dart` 的 `int.parse`）、各 provider 的 `e.toString()`。

### 24.2 修法

1. 新增 `core/error/user_message.dart`：`String userMessageOf(Object error)`，按类型映射：
   超时 / 断网 / 401 / 403 / 404 / 5xx / 解析失败 / 未知，未知兜底「出了点问题，请重试」
2. 所有 UI 侧 `error.toString()` 改为 `userMessageOf(error)`；`debugPrint` 保留原始异常
3. 顺带修 §12.7 ③：`submitAnswer` 的 `int.parse` 改为校验后抛业务错误（`'题目编号异常，请刷新后重试'`）

### 24.3 判据

- 单测 8 条（每种映射一条 + 未知兜底 + 不泄漏堆栈）
- 静态扫描：UI 层（`presentation/**`）不得出现 `error.toString()`，白名单只减不增
- 工作量：0.5d

## 25. 备考主路径摩擦（计划）

前提：这个 App 的真实用法是「每天 45 分钟、4 月考试」，所以判断标准是**从打开到开始今天的第一道题要几步**，
而不是功能有多少。

### 25.1 已核实的摩擦点

| #   | 现象                                       | 证据                                                                                  | 后果                                                   |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| F1  | 首页三张功能卡的数值是字面量占位           | `dashboard_screen.dart:178` `trailingValue: '几分钟'`、`:190` `'--'`、`:201` `'回顾'` | 用户看到"累计 --"，会以为数据没加载/坏了               |
| F2  | 没有底部导航，所有功能都从首页卡片进入     | 全仓无 `BottomNavigationBar`（只有 `wrong_book_screen` 内部用过一次槽位）             | 从记忆卡深处回首页要连按返回；切换功能必须回首页       |
| F3  | 待办条目点击进的是"练习设置"，不是直接开练 | `dashboard_screen.dart:148` `onTap → AppRoutes.practiceSetup`                         | 多一步选择（模式/题量），而待办已经知道"还差 N 题"     |
| F4  | 记忆卡入口不显示"今天到期多少张"           | `:178` 只有"每次/几分钟"                                                              | 用户不知道今天要不要做、要做几张，容易跳过             |
| F5  | 练习中断后没有"继续上次"                   | 当前 sessionId 不持久化（`practice_provider` 只在内存）；离线队列只兜住"已提交的作答" | 中途杀进程/切走太久 → 这场的剩余题目丢失，只能重开一场 |

### 25.2 修法与判据

| #   | 修法                                                                                                    | 判据                                                                    | 工作量 |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------ |
| F1  | 三张卡接真实数据：记忆卡→到期张数、错题→累计条数、历史→最近一次练习时间（都有现成 provider/repository） | widget test 断言三处不再是字面量；无数据时显示"暂无"而不是 `--`         | 0.5d   |
| F4  | 记忆卡卡面显示"今日到期 N 张"（`recall` 队列 provider 已有该数）                                        | 到期 0 → 显示"今天已完成"；>0 → 显示数字                                | 0.5d   |
| F3  | 待办条目直接开练（带 `limit=remaining`、模式沿用上次）                                                  | 点击 → 直接进 `practice_screen` 第 1 题；不再经过 setup                 | 0.5d   |
| F2  | 4 个高频入口做底部导航：首页 / 练习 / 记忆卡 / 错题本；tab 切换不堆栈                                   | 4 个 tab 两两互达 ≤1 次点击；返回键在 tab 根页退出 App 而不是回上一 tab | 1d     |
| F5  | 把当前 `sessionId` + 进度存 `preferences`，首页出现"继续上次练习"                                       | 杀进程重开 → 首页出现"继续"；进入后从第 N 题开始；完成后清除            | 1d     |

### 25.3 顺序与前置

F1 → F4 → F3 → F2 → F5。

- F1/F4 只读现有数据，可与任何批次并行
- F2 会动 `app_router.dart` 与导航结构，**必须在 #247 合入后做**（它改了 20 屏的顶栏/底色）
- F5 依赖 §19 的 `PreferencesStore`，排在 §19 之后

### 25.4 不做

- 不做"智能推荐今天该练什么"（当前没有足够数据支撑，且会掩盖 F1–F4 这些更基础的问题）
- 不重排首页视觉层级（#247 刚统一了颜色层，等真机验收后再谈）

## 26. APK 发布链路（计划）

### 26.1 现状（读 `android.yml` 实测）

| 项 | 现状 | 问题 |
| --- | --- | --- |
| 触发 | `workflow_dispatch` + `push: tags v*`；`needs: [analyze]` | 合理，保持 |
| 版本号 | `pubspec.yaml` 固定 `1.0.0+1`；gradle 取 `flutter.versionCode` | **每次构建 versionCode 都是 1**，系统里版本号永远不变，无法从用户上报区分构建 |
| 签名 | secrets 里的固定 keystore，缺配置直接失败 | 已做对（debug keystore 会导致装不上旧包） |
| 产物 | `upload-artifact: app-release`，未设 retention | 名字不含版本；默认 90 天 |
| 发布 | 无 GitHub Release、无 changelog | 只能去 Actions 页面翻 run |
| 指纹 | 无 | APK 内不知道对应哪个 commit |

### 26.2 修法

| # | 动作 | 判据 | 工作量 |
| --- | --- | --- | --- |
| R1 | 版本号由 CI 派生：`flutter build apk --build-name=<pubspec 语义版本> --build-number=${{ github.run_number }}` | 连续两次 dispatch → versionCode 1→2；设置页"关于"显示 `1.0.0 (2)` | 0.5d |
| R2 | artifact 改名 `app-release-<name>+<code>`，`retention-days: 30` | 两次构建的 artifact 名不同、可在下载页区分 | 同上 |
| R3 | 打 tag 时创建 GitHub Release，APK 作为 release asset（正文取 commit 列表或 `CHANGELOG.md` 对应段） | `git tag v1.1.0 && git push --tags` → Release 自动出现且带 APK | 0.5d |
| R4 | 构建指纹：`--dart-define=BUILD_SHA=${{ github.sha }}`，设置页"关于"显示前 8 位 | 设置页可见；与 `git rev-parse --short HEAD` 一致 | 0.5d |
| R5 | 密钥备份：keystore 只存在 secrets，**丢失即无法覆盖升级**（只能换包名重发）。文档写明离线备份位置（密码管理器/加密介质），不入库 | `docs/deploy.md` 增一节"Android 签名密钥备份" | 0.2d |
| R6 | **回滚**：Android 不允许 versionCode 降级安装，所以回滚 ≠ 装旧包。正确做法是从旧 tag 重新构建，但 build-number 继续用当前 `run_number`（旧代码 + 更大的版本号） | 回滚演练一次：旧 tag 构建 → 能覆盖安装 → 设置页版本号更高、功能是旧版 | 0.5d |
| R7 | ABI 拆分（**不做**）：`--split-per-abi` 可把 53MB 拆成三个约 20MB 的包 | 只有一个真机，多维护 3 个产物不划算 | — |

### 26.3 顺序

R1+R2（先让包可区分）→ R3 → R4 → R5（文档）→ R6（演练一次）。

前置：无。与 §23 真机验收互补——§23 用 APK 做验收，§26 让"哪个 APK"这件事可追溯。

### 26.4 判据汇总

1. 连续两次 `workflow_dispatch`：versionCode 递增、artifact 名不同
2. 打 tag：Release 自动创建且附 APK
3. 回滚演练：旧 tag 重建的包能覆盖安装，设置页版本号更高
4. 文档：密钥备份位置写清，且仓库内不出现 keystore

## 27. CI 时长与测试预算（计划）

### 27.1 实测（`gh run view --json jobs`）

| job | 时长 | 备注 |
| --- | ---: | --- |
| Lint & Type Check | 2.0min | 含 `npm ci` |
| 单元测试 (Vitest) | 3.6min | 含 `npm ci` |
| OpenAPI 契约快照 | 1.2min | 含 `npm ci` |
| MCP 构建与文档任务验收 | 1.0min | 含 `npm ci` |
| Flutter 静态分析与测试（android.yml） | 2.4min | pub get + build_runner + analyze + test --coverage + 门禁 |
| Playwright layout-guard / perf-guard / E2E | 未取到 | 与 CI 并行，`ui-guard.yml` 独立 workflow |
| 构建 Release APK | 45min 超时上限 | 仅 dispatch/tag 触发，实测待测 |

### 27.2 四个问题

1. **`ci.yml` 没有路径过滤**：本次纯文档 PR #249 也跑了全套 8 个 web 检查（lint / vitest / openapi / mcp / 2×playwright / e2e / next build）
2. **每个 job 各自 `npm ci`**：lint、vitest、openapi、mcp、playwright×2、e2e ≈ 7 次安装，是墙钟时间的主要构成
3. **快闸与慢闸同层**：Playwright 61 条与 typecheck 平级，PR 反馈被最慢的拖住
4. **失败日志会过期**：#243 / #222 的失败原因现在已查不到（`--log-failed` 返回空），排障只能重跑

### 27.3 方案

| # | 动作 | 判据 | 工作量 |
| --- | --- | --- | --- |
| C1 | 路径过滤：`ci.yml` / `ui-guard.yml` 加 `paths-ignore: ['docs/**', '**/*.md', 'mobile_app/**']`（`android.yml` 已有 `paths`，保持） | 只改 docs 的 PR：web CI 不触发或 <30s | 0.2d |
| C2 | 分层：PR 只跑快闸（lint/typecheck/vitest/openapi/mcp/next build）；Playwright 与 E2E 改为 **main push + label `run-e2e` + 每晚定时** | PR 反馈 p50 < 4min；main 仍全量 | 0.5d |
| C3 | 合并安装：openapi / mcp 并进 lint job（共用 node_modules），或抽 composite action + `cache` | CI 总时长下降 ≥30% | 0.5d |
| C4 | Flutter 测试预算：518 条 48s → 目标 <90s；单条 <300ms；超预算先查 `pumpAndSettle` 次数与 `--concurrency` | `flutter test` 超过 90s 即视为需要拆分 | 0.2d |
| C5 | 失败证据：`if: always()` 上传关键日志 artifact | 30 天后仍能取到失败原因 | 0.3d |
| C6 | 文档：`AGENTS.md` 写"PR 最小闸门清单"（哪些挡合并、哪些只是信号） | 新 PR 能自答"我该等哪些检查" | 0.1d |

### 27.4 不做

- 自建 runner 承接 web CI（`SELF_HOSTED` 开关已有，但本机 glibc 2.17 跑不了 Chromium）
- 删掉 Playwright：61 条 layout-guard 是 UI 回归的唯一护栏，只是不该挡每个 PR


