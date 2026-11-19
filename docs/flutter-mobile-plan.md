# Flutter 移动端开发计划

> 状态：草案（2026-11-18）
> 范围：`mobile_app/` 继续开发至「日常可用 + 可安装 APK + 离线刷题」
> 前置必读：`.agents/skills/flutter-pro-engineering/`（code-quality / migration / full-stack 三篇）

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
