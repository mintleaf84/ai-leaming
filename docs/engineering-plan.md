# 工程质量计划（2026-11）

目标：把「靠人记得」改成「靠机制拦住」。规范见 [`engineering.md`](./engineering.md)。

## 基线（2026-11-17 实测）

| 指标                                                                                   | 现状                                                                                       | 上一版（2026-11-11） |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------- |
| ESLint warning（棘轮）                                                                 | **7**                                                                                      | 536                  |
| ├ `no-unused-vars`                                                                     | **0**                                                                                      | —                    |
| └ 其余（exhaustive-deps 3 / require-imports 2 / anonymous-default 1 / explicit-any 1） | 7                                                                                          | —                    |
| `: any`（源码 / 测试）                                                                 | 20 / 171                                                                                   | 269                  |
| `as unknown as`                                                                        | 44（服务层 13 处里 **9 处是同一句** `tx as unknown as typeof drizzleDb`）                  | —                    |
| 自定义 Error 类                                                                        | 9 个（recall 一个功能占 5 个），映射各写各的                                               | —                    |
| 混职责页面（>400 行且同时有取数/状态机/渲染）                                          | 8（最大 882）                                                                              | —                    |
| 源码 / 测试规模                                                                        | 70,468 / 33,144 行                                                                         | —                    |
| 页面/组件直连 `drizzleDb`                                                              | **0 处**（分层干净）                                                                       | —                    |
| a11y 静态（`jsx-a11y` 棘轮）                                                           | **96**（4 条规则 / P1 64 / P2 32），见 [`ux-a11y-audit.md`](./ux-a11y-audit.md)            | 新增                 |
| 闸门                                                                                   | lint 棘轮 / catch 零容忍 / 布局 61 条 / schema 列级 / 判分基准棘轮 / a11y 棘轮（工具就绪） | 4 项                 |
| Node 版本固定                                                                          | `engines` + `.nvmrc` + `preinstall` 守卫                                                   | 无                   |
| E2E                                                                                    | 10 条关键路径在 CI 真跑（生产构建）                                                        | 26 spec，不在 CI     |

## 基线（2026-11-11，历史对照）

| 指标             | 数值                                               |
| ---------------- | -------------------------------------------------- |
| CI 闸门          | 4 项（Lint&Type / Vitest / Build / autofix），可用 |
| Node 版本固定    | 无 `engines` / `.nvmrc`（本机 22.6 vs CI 20）      |
| ESLint warning   | 536（棘轮基线，原 542；补测试后回落）              |
| `npm audit`      | 0 high / 58 moderate / 7 low                       |
| 测试文件         | 132，其中 49 个 mock 掉数据库                      |
| `catch` 只打日志 | 127 / 336                                          |
| `console.*`      | 239 处（pino 仅 15 个文件使用）                    |
| `as any`         | 269 处                                             |
| E2E spec         | 26 个，不在 CI 运行                                |

## P0 闸门硬化（3h）

- [x] `engines`（`>=20.19.0 <21`）+ `.nvmrc`（`20.19.0`，视为最低版本）+ `preinstall` 守卫，本机用 `micromamba run -n node20`
- [x] `scripts`：`typecheck` / `test:run` / `lint:ci`（棘轮 `--max-warnings 536`）
- [x] CI：lint job 改用 `npm run lint:ci` + `npm run typecheck`
- [x] CI 新增 `npm audit --audit-level=high` 步骤
- 验收：新增步骤在 PR 上全绿；`npm run typecheck` 本地 0 error

## P1 真实契约测试（7h）

- [x] **迁移/测试 schema 一致性门禁**：`src/lib/db/__tests__/schema-parity.test.ts`（逐表逐列比对真实迁移与手写 DDL；已抓出 `practice_sessions.id` 缺 NOT NULL）
- [x] 更正 SRS 根因结论（不是 id NOT NULL，而是事务内用全局连接）
- [x] 真实依赖集成测试：**2 文件 → 5 文件 / 18 例**
  - [x] 练习答题提交（`practice-answer.test.ts`，3 例：日志 + 会话统计 + 掌握度）
  - [x] 40/40/20 调度（`scheduling-composition.test.ts`，5 例：配比、去重、顽固题配额、题目有效性、题库不足）
  - [x] 导入幂等 **并发**（同 sourceKey `Promise.all` 两次）
  - [x] SRS 同步（`srs-sync.test.ts`，4 例）
  - [x] 迁移/测试 schema 一致性（`schema-parity.test.ts`，2 例）
  - [x] admin 题库 CRUD（含批量导入）—— 见 M3
  - [x] 鉴权边界（未登录 / 跨用户）—— 见 M3 归属矩阵（欠账 11 → 0）
  - [x] RAG 向量写入（sqlite-vec）—— 契约已写（12 例），但**功能本身仍不可用**，见 M5
  - [x] 备份与恢复 —— 见 M3（10 例，含凭据加密断死）
- [x] 把 5 个最没价值的 mock-db 测试改成真实库（在 M3 完成：history / mastery / knowledge / settings / textbook）
- 验收：集成测试 ≥10；至少 1 个新 bug 被发现并修复
- **实际收获（写测试过程直接抓到 2 个真 bug）**：
  1. `practice_sessions.id` 在测试内存 schema 里缺 `NOT NULL`，与迁移漂移（`schema-parity` 抓出）；
  2. `isUniqueViolation` 只看外层错误，drizzle 把 `SqliteError` 包在 `cause` 里 —— 并发窗口下的唯一索引冲突会被当成真实错误抛出，幂等兜底形同虚设（并发用例抓出）。

## P2 错误语义与日志（5h）

- [x] 服务端 `console.*` 全部收敛：**154 → 0**（46 个文件），新增 `log` 兼容垫片保留原调用形态
- [x] 新增 `no-console` lint 规则（服务端目录 warning + 棘轮；`logger.ts`/测试/脚本豁免）
- [x] `docs/error-handling.md` 落盘（三形态判定流程 + 台账 + 分类进度）
- [x] 修正被机械替换误伤的示例字符串（`welcome.ts` 里的代码高亮样例）
- [x] **catch 形态机械化审计**（TypeScript AST 解析）：`scripts/audit-catches.cjs` 把每个 catch 归类为
      `rethrow` 21 / `degraded` 90 / `allowed` 40 / `fallback` 39 / `logged` 68 / `silent` 71；
      支持 `// audit-allow: <理由>` 显式接受（单独计数、可 grep 审计），
      基线写入 `docs/catch-audit.baseline.json`（178 个标记项签名），
      CI 中 `logged/fallback/silent` 出现**新增签名**即失败（修好一个、新增一个不会互相抵消）
- [x] 长尾治理：六批把 218 个标记项全部收口（`rethrow` 39 / `degraded` 222 / `allowed` 52），
      基线刷为 **0**，门禁转为零容忍；分布见 `docs/error-handling.md`
- [x] 前端 `ErrorBoundary` + 统一 `sonner` 错误提示；loading/empty/error 三态复用 `ui/empty-state.tsx`
      （客户端 110 处：写操作 toast + 首屏 `ErrorState(onRetry)` + 解析回退 `audit-allow`）
- [x] 依赖安全：`npm audit` 65 项（0 high / 0 critical）逐条判定可达性，台账见
      `docs/dependency-audit.md`；Dependabot 每周安全更新（`novel` 不忽略，安全修复要能被自动提出；仅忽略 `@tiptap/*` 的 major）
- 验收：`npm run lint:ci` 通过且 `no-console` 计数为 0（以 lint 结果为准，不用 grep —— `welcome.ts` 的代码示例字符串里应保留 `console.log`）；`docs/error-handling.md` 落盘
- **零计数覆盖范围**：`src/lib/**/*.ts`、`src/server/**/*.ts`、`src/app/**/*.ts`、`src/app/{page,layout}.tsx`、`src/instrumentation.ts`
- **显式豁免**（因 Edge/客户端共享，必须保留 `console`）：`src/middleware.ts`、`src/lib/utils/retry.ts`、`src/lib/ai/rag.ts`、`src/lib/services/{srs,knowledge,question-folder}.ts`、`src/app/**/hooks/**`、`src/app/**/components/**`、全部测试与 `scripts/**`

## P3 类型收紧（5h）

- [x] **生产代码 `as any`：6 → 3**（`subscription`/`config`/`history` 改为精确的 `Parameters<typeof fn>[0]`；剩余 3 处为 ReportView 的 recharts 类型不兼容 + 2 个测试工具）
- [x] ESLint `no-explicit-any` 在测试/mock 目录关闭（那里的 `as any` 是构造非法输入的正当手段），生产代码仍受约束
- 结论：warning 总数 **536 → 82**（`no-explicit-any` 449 → 1）
- [x] `noUncheckedIndexedAccess` 已评估：当前开启会产生数百处索引断言噪音，收益低于维护成本，暂不启用（记录于此）

## P4 前端专项（4h）

- [x] CI 新增 `e2e` job（chromium-only）：auth / practice-flow / review-flow / dashboard / wrong-book / history / questions-import / admin 八条关键路径；用 **生产服务**（`next build` + `next start`）而不是 dev，避免按路由现编译；CI 上 `retries=1`、`workers=2`
- [x] 三态组件规范化：新增 `ui/error-state.tsx` + `app/error.tsx`（路由级错误边界）+ `app/global-error.tsx`（根布局兜底）
- [x] e2e 建库改为**回放真实迁移**（不再手写 DDL）；并打开 `ENABLE_INTELLIGENT_REVIEW` 开关，让复盘用例真正生效
- 验收：CI 出现 `e2e` job 且绿；覆盖清单写入 `docs/test_cases.md`

## M0 收口与安全（0.5d）

- [x] ESLint 基线 **76 → 7**：清掉 69 条 `no-unused-vars`（42 删导入 / 16 删局部绑定 /
      8 改 `_name` / 2 `_error` / 1 解构项），未动规则强度、未加 `eslint-disable`
- [x] **`pdf-import` 归属校验（IDOR）**：`chunkCache` 条目带 `userId`，
      `parseSingleChunk` / `cleanup` 校验归属；「不存在」与「不是你的」返回同一个 404
      （`PdfImportTaskNotFoundError`），清理失败返回 `ok:false` 但保持 200 幂等
- [x] 补 2 处日志缺口：`ai/client.ts` 文本降级带原因；`pdf-question-parser` 首次失败带原因
- 验收：`src/lib/api/routes/__tests__/pdf-import-ownership.test.ts`（5 例）+
  `pdf-import.test.ts` 的「任务归属」组（3 例）全绿

## M1 减少咒语（2–3d）

- [x] `type Executor` + `withTransaction()`：9 处 `tx as unknown as typeof drizzleDb` **全部消除**
      （`import-service`×2、`recall-import`×3、`chat`/`pdf-import`/`recall`/`srs` 各 1）
- [x] 错误映射收敛：`AppError` + 5 类语义（validation / business / not-found / conflict / forbidden）+ domain code；`toErrorResponse()` 是唯一 HTTP 映射点（9 个类只换父类、不改名）
- [x] server action 侧**不按字面统一**（见 `decisions.md` 2026-11-17）：`next-safe-action`
      的 `handleServerError` 只回字符串，透传 `kind` 要改 40+ 客户端调用点的契约；
      取舍是「HTTP 边界用 5 类语义，action 边界只保证 message 可读」，不为了打勾去改调用点
- [x] `affectedRows(result)` 封装（2 处 `rowsAffected` 断言）；顺带修 `rowsAffected || ids.length`
      把「一行没删」当「全删」的 bug
- 验收：新增 `no-as-unknown-as-tx` 形式的检查（lint 规则或 grep 计数棘轮）；
  外部 API 状态码语义不变（`docs/api.md` 状态码表同步）

## M2 页面职责拆分（3–5d）

判据不用行数：**同一文件里同时出现 ① 取数 `await *Action`/`fetch` ② 状态机（>5 个 state 或串行 effect）
③ 渲染**，且 >400 行。范式见 `app/practice/hooks/use-practice-controller.tsx`。

- [x] `admin/users/page.tsx`（795）→ **135 行**（`useUsersData` + 动作 hook + 7 个展示组件）
- [x] `admin/api-keys/page.tsx`（882）→ **165 行**
- [x] `RecallSession.tsx`（682）→ **119 行**（状态机抽到 `useRecallSession`，五条语义各有用例）
- 验收：新增 hook 有独立单测；纯重构不改行为，由 10 条 E2E + 61 条布局护栏兜底

## M3 机制补齐（2–3d）

- [x] **归属矩阵门禁**（`src/lib/api/__tests__/ownership-matrix.test.ts`）：18 个路由模块
      必须登记归属语义（user / admin / global / public）；`user` 必须指向真实的跨用户测试，
      `global` 必须写「为什么不是越权」；外部 API 每条写路由必须声明 `write` 作用域
- [x] 欠账清单 `KNOWN_UNCOVERED`（11 个 user 模块，逐条写明「拿哪个 id 定位资源」），
      **只许减**：补完测试必须从清单删除，新增 user 模块必须补测试或进清单
- [x] 清掉前 4 条欠账（`history` / `practice` / `annotations` / `wrong-book`）：**11 → 7**，
      并顺带抓到两个真缺陷 —— `practice` 提交越权（IDOR，已修）与 `GET /wrong-book/` 恒 500
      （`ORDER BY` 引用 JS key，已修）
- [x] 清掉剩余 7 条（`chat` / `feedback` / `generate` / `knowledge` / `mastery` / `profile` / `stats`）：
      24 例；其中 mastery / profile / stats 没有资源 id，改测「聚合口径漏 `user_id`」
      （如 mastery 共享标签 B 应 80 而非 50）；`KNOWN_UNCOVERED` 现为空对象
- [x] admin 题库 CRUD 真实契约测试（19 例，含幂等键/删除行数/鉴权）
- [x] RAG 向量写入、备份恢复契约测试（12 + 10 例）—— 顺带钉住 9 个真缺陷，见下方 M5
- [x] 剩下的 5 个 mock-db 测试改真实库（history / mastery / knowledge / settings / textbook）：
      断言从「方法被调用」升级为「库里真是那行」；`vi.mock("@/lib/db")` 21 → 16；
      顺带钉住 2 个真 bug（正确率筛选 SQL 多一个右括号、北京时区日期差一天），已修
- 验收：矩阵覆盖全部 `src/lib/api/routes/*.ts` 的路由；新增 4 类真实契约测试

## M4 入口与本地闭环（0.5d）

- [x] README 指向 `engineering.md` / `engineering-plan.md` + `drizzle/README.md`
- [x] `npm run verify` = `typecheck` + `lint:ci` + `test:run` + `audit:catches`（实测一次跑完）
- [x] 审计 `.agents/skills/` 的 16 个技能：`drizzle-orm-engineering` 与 `sqlite-migration-automation`
      在教 `drizzle-kit generate`（本仓库禁止），已加 WARNING 并改流程；其余抽查无冲突
- 验收：新 clone 按 README 能一条命令跑完四闸

## M5 缺陷处置（契约测试与跨用户测试钉住的 9 个真缺陷）

- [x] 题库批量导入无幂等键（硬规则 1）→ 内容指纹 `admin:` 命名空间，批内去重 + 先查后写 + `onConflictDoNothing`
- [x] 删不存在的题仍报成功 → `affectedRows()`（`??` 而非 `||`）
- [x] `POST /restore` 忽略 `DB_FILENAME` → 新增 `db-file.ts` 唯一路径解析
- [x] 恢复只校验 magic header → 恢复前校验核心业务表，缺表 400 且不动线上库
- [x] `practice` 提交越权（IDOR）→ 事务内校验会话归属，404 回滚
- [x] `GET /wrong-book/` 恒 500（`ORDER BY` 引用 JS key）→ 改用聚合表达式
- [x] **维度 1536 vs 1024**：`vector-setup` 不再写死维度，改为初始化时问 `getAiConfig("embedding")`
      （动态 import 避免 `db → vector-setup → ai/config → db` 静态环），表维度与应用实际
      使用的 embedding 维度对齐；对应 `it.fails` 已转正
- [x] **向量表从未创建 / 检索恒空**（#193）→ 方向 ② 落地：新增 `src/lib/db/vec-store.ts` 作为向量唯一入口，
      全部走已加载 `sqlite-vec` 的 legacy better-sqlite3 连接；`vector-setup.ts` 改薄委托；
      `searchSimilarQuestions` 拆成「向量取 id → drizzle 按 id 批量取题 → 按 distance 排序」（跨连接不能 join）。
      顺带修「`IF NOT EXISTS` 但维度不一致仍报就绪」：回读 `sqlite_master.sql` 的 `float[N]` 比对，不一致明确失败
- [x] `rag.ts` 的 `Math.sin` 兜底向量不得进入检索路径（#196）→ 由**产生方显式标记**：
      `getEmbeddingResult(): { vector, degraded }`，`getEmbedding` 退化为薄包装（既有调用方零改动），
      降级即 `skipped` 不入库。不用长度/方差启发式去猜
- [x] embedding 写入路径（#196）：`indexQuestion` / `reindexQuestions` + `scripts/reindex-question-vectors.ts`；
      仅接管理员**单题**编辑（且只在 `content/options/answer` 变更时），批量导入故意不接（会打出几百次 API 调用）
- [x] **检索路径也堵住降级伪向量**（PR #199 评审抓出）：`#196` 只堵了写入路径，两处**查询**入口仍用
      `getEmbedding` 并忽略 `degraded` —— 伪向量当查询向量跑 KNN，返回"看起来正常但与问题无关"的结果。
      `searchSimilarQuestions` 与 `ragService.search` 改为 `getEmbeddingResult`，降级直接返回 `[]`、**不执行 MATCH**
- [x] **编辑后降级会留旧向量**（评审抓出）：`indexQuestion(id, { pruneOnSkip: true })` 删掉描述旧题干的向量；
      **批量回填永不 prune**（API 抖动删光索引是从"部分过期"升级成"全空"）
- [ ] **`content_vec` 写入路径同样会存降级伪向量**（本轮范围外发现，未修）：
      `ragService.addChunk` / `addChunksBatch` 仍用 `getEmbedding`。该链路独立的 `content_vec`
      表并非 `vec-store` 创建，需与"RAG 分块索引是否继续维护"一起决策
- [ ] **存量回填**（运维动作）：需有题目的库 + 可用的 embedding 配置。脚本**不保存进度**，
      `--offset` 默认 0 —— 重复跑 `--limit 100` 会**再次处理前 100 题**（重复计费，后面的题永远轮不到）。
      正确顺序：`--limit 100 --dry-run` → `--limit 100 --offset 0` → 抽样 10 题验召回
      （判据：≥7 题首条与人工判断同考点）→ 之后每批把 `--offset` 递增 100
      （`--offset 100`、`--offset 200`…，直到 `剩余 0`）。脚本每批结束会打印下一批该用的 `--offset`

## M6 前端可用性与无障碍（审计完成 → 分三批清理）

审计报告：[`ux-a11y-audit.md`](./ux-a11y-audit.md)。基线：静态 **96**（`a11y-baseline.json`）/ 人工 **65**。

**每批一个 PR，门禁绿才合；基线只许降、测试只许增、不加 `eslint-disable`、不新增 `it.fails`。**
顺序按「用户会不会被咬到」排，不按规则编号排。

### 已完成（审计基建）

- [x] 静态通道：`eslint.a11y.config.mjs`（独立于 `eslint.config.mjs`，不污染 89 基线）+
      `scripts/audit-a11y.cjs`（棘轮 / `--json` / `--update` / 异常退出码 2）+ `a11y-baseline.json`（96）
- [x] 补 `settings['jsx-a11y'].components = { Image: 'img' }`：此前 `next/image` 的 `<Image>` 对
      `alt-text` **完全不可见**，`0 命中` 是假清白（A/B 探针已证伪，补后仍 96 —— 6 处 `<Image>` 都有 `alt`）
- [x] 人工通道 9 条规则逐条 `file:line` + 「查了没违规」位置清单（沉默不算清白）

### 批次 A：会咬到用户的 ✅ 已完成（PR #204）

落地结果与计划的三处差异（都是实现时才发现的）：

- **A1 门禁先写后修**：脚本在动手前报出的正是 13 处；修完 `--update` 收紧到 **0 条**（零容忍）。
  另外把「守卫位置在 `preventDefault()` 之后」当**独立违规项** —— 顺序反了会吞掉 IME 的确认动作，
  用户连候选词都选不了，比原 bug 更严重
- **A2 的数值是算出来的**：勾选 20→40、文件夹确认/取消 14→26（原 `gap-1` 会让外扩重叠 8px，
  同步改 `gap-3`）、色板 20→**44px 格 + 20px 圆点**（pitch 52 > 44，不用 `-m-*`）
- **A6 的门禁落在 helper 里**：写进 `assertLayoutIntact` 后由 20 条路由在 375 视口各验一次
  （比计划的"1 条 e2e"更强）；但布局护栏本机跑不了（GLIBC），只能由 CI 验

> ESLint 基线因 #201（eslint-config-next 16.4.6 新规则先降 warn）变为 **128**，批次 A 落地时实际 **90**。
> 上面「基线（2026-11-17 实测）」表的 ESLint 行还是 11-17 早间的数，等 perf 批次统一刷新。
>
> 遗留（不在 A 的范围，留给 B）：`FolderTreeView.tsx:197` 的「新建文件夹」按钮是 `h-5 w-5 p-0`（20×20）。

| #     | 事项                                                                                                    | 门禁（可复现）                                                                                                                                                                                                                                                                                           | 验收                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A1 ✅ | **IME 组合态**：13 处 Enter handler 加 `isComposing` 守卫                                               | 共享判定 `isImeComposing(e)`（`nativeEvent.isComposing \|\| keyCode===229`）+ 新增 `scripts/audit-ime-enter.cjs`（**TS AST**，照 `audit-catches.cjs`）：凡 `onKeyDown`/`addEventListener("keydown")` 里判 Enter 且未经过该判定的，一律报出；白名单 `docs/ime-enter.baseline.json` 逐条写理由。**13 → 0** | 3 条主路径各一条单测（合成事件 `isComposing:true` 断言未提交）；脚本计数归零 |
| A2 ✅ | **触屏热区**：`WrongQuestionCard.tsx:61`、`FolderTreeView.tsx:242/250/270`、`AddToFolderDialog.tsx:114` | 渲染后断言热区 ≥24（`getBoundingClientRect`）；色板**不得**用 `-m-*` 外扩（会重叠 12px），按 pitch ≥ 视觉+间距改                                                                                                                                                                                         | 6 个控件各一条；layout-guard 的 `<44×44` 报告里这几处消失                    |
| A3 ✅ | **错题本失败态**：`use-wrong-book-controller.ts:115` 加 `try/catch/finally` + `loadError`               | 契约测试两条：action **throw** → 渲染 `ErrorState`（不再永久转圈）；action 返回 **`{success:false}`** → 渲染 `ErrorState`（**不再**显示"太棒了！暂无错题"）                                                                                                                                              | 两条用例 + 手动断网走查一次                                                  |
| A4 ✅ | **删文件夹加确认**：`use-wrong-book-controller.ts:428` + `FolderTreeView.tsx:281`                       | 用例：点"删除"后 `deleteFolderAction` **未被调用**、出现含文件夹名的确认框；取消则不调用                                                                                                                                                                                                                 | 1 条用例                                                                     |
| A5 ✅ | **答题写库失败不再静默**：`use-practice-controller.tsx:317`                                             | 用例：action reject → 出现带重试的 toast，且重试会再次调用                                                                                                                                                                                                                                               | 1 条用例                                                                     |
| A6 ✅ | **底部预留算安全区**：`layout.tsx:118`                                                                  | 375 视口断言 `main` 的 `padding-bottom ≥ 96px`；再加一条**静态断言**：CSS 必须含 `env(safe-area-inset-bottom)`，防止退回固定值                                                                                                                                                                           | 1 条 e2e + 1 条静态                                                          |

> A6 的诚实边界：浏览器里 `env(safe-area-inset-bottom)` 恒为 0，**自动化只能验 88+8 那部分**，
> 安全区只能靠 `calc()` 写法保证（人工/真机）。别把它写成"门禁覆盖了 iPhone"。

### 批次 B：结构与无障碍债 ✅ 全部完成

| # | 事项 | 门禁 | 依赖 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 ✅ | `label` 无关联控件 **41 → 0**（第 42 条是 forwardRef 误报，永久保留） | a11y 静态 **96 → 55** 后 `--update`；棘轮自动拦新增 | 无 | ✅ 完成：41 处按「补 htmlFor / Radix id / 隐式关联 / `<fieldset>`」分四类改，基线 96 → **55**；`ui/label.tsx` 的 forwardRef 误报**故意不动** |
| B2 ✅ | 自建 `fixed inset-0` 浮层 **8 处换 Radix**（`dialog.tsx`/`alert-dialog.tsx`），不再手写焦点陷阱 | 每个浮层一条：打开后 `document.activeElement` 在浮层内、`Esc` 可关、关闭后焦点回到触发按钮 | **必须排 T-12（滚动模型归一）之后**：`fixed` 浮层在 body 滚动与内滚容器下行为不同，先改会白做 | ✅ 完成：8 处全部换 Radix（4 处 `DialogContentBare` 裸壳 / 3 处 `DialogContent` / 1 处 `AlertDialog`）；`layoutId` 配对测试钉住动画；`StudyModeOverlay` 把 Esc 显式让回全局监听。a11y 55 → **48** |
| B3 ✅ | `focus-states` **8 处**补可见焦点环 + 焦点环对比度实测 | 8 条：`focus()` 后 `outline`/`box-shadow` 非 none；对比度给出实测数字（**1.4.11 是 AA，3:1**，不是 AAA） | 无 | ✅ 完成（7/8）：先算对比度再选 token —— `--ring` 三套主题 3.93–6.49:1 达标，`--border`/`--muted` 只有 1.08–1.44:1 被排除；第 8 处 `SimpleMindMapViewer:109` 是误判（该 div 无 `tabindex`，拿不到焦点），真缺口是库塞的 `contenteditable`，留给设计 |
| B4 ✅ | `live region`：聊天流式、答题切题、计数变化 | 断言 `role="status"` 存在且切题后文本随之更新 | 无 | ✅ 完成：聊天**不用逐字 live**（会念几十遍），改 sr-only `role=status` 播三档整句 + 正文 `aria-busy`；切题移动焦点到题干；计数播整句；登录失败 `role=alert` + 聚焦 |
| B5 ✅ | **交互类命中分诊 45 → <10**（`click-events-have-key-events` 22 + `no-static-element-interactions` 23）：合法的遮罩/卡片浮起改成真语义（`<button>`、`role="button"`+`tabIndex`+`onKeyDown`），遮罩类随 B2 换 Radix 自动消失 | 每条降下来的都在报告里写「改了什么语义」；终态：交互类 <10 且总数 ≤54 | **与 B2 同批做**：换 Radix 会让大部分遮罩命中直接消失，分成两批会撞同一批文件 | ✅ 完成：交互类 **45 → 0**（a11y 总数 48 → **9**，只剩 `no-autofocus` 8 条与 `label` 那条 forwardRef 误报）；手法统一是「删容器 onClick、让事件从真控件冒上来」，**没有一处贴 `role="button"`**，因此没有嵌套 button；顺带修掉「≤5 题时点播放不开始练习」这个真 bug |

### 批次 C：RAG 残留与门禁收口（1d）

| #   | 事项                                                                                                                                      | 门禁                                                                                                 | 备注                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| C1  | `addChunk`/`addChunksBatch` 改用 `getEmbeddingResult`，降级**不写** `content_vec`；`initRagTable` 做维度回读校验（照 `vec-store` 的做法） | 两条：降级时 `content_vec` 行数不变；表维度与配置不一致时明确失败而非静默                            | 现在 `textbook.ts:137/197` 与 `question-recommend.ts:254` 都会把伪向量写进索引                    |
| C2  | **存量回填**（运维）：`--dry-run` → `--limit 100 --offset 0` → 抽样 10 题 → 递增 `--offset`                                               | 判据：≥7 题首条与人工判断同考点                                                                      | 需有题目的库 + 可用 embedding 配置                                                                |
| C3  | a11y 棘轮进 `npm run verify`                                                                                                              | 前置：**B5 完成**（交互类 <10 且总数 ≤54）；接进 `verify` 后再验证一次「存量不动不红、新增 +1 才红」 | 棘轮对存量沉默，所以要先分诊 **B5** 的 45 条交互类，否则闸门会把合法写法判违规（见 decisions.md） |

### 明确不做

| 不做                             | 理由                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 把 96 条静态命中修到 0           | `no-static-element-interactions`(23) + `click-events-have-key-events`(22) 多为遮罩/卡片外层浮起事件，机械加 `role="button"` 是伪语义 |
| 修 `no-autofocus` 9 条           | 全在 Dialog 输入框，是焦点管理惯例                                                                                                   |
| 给 Dialog 手写焦点陷阱           | 已有 Radix，自建浮层应**换用**而不是再写一套                                                                                         |
| 全局 `focus:ring-1` → 3:1 一刀切 | 先量再改；`ring-1` 的实际对比度未实测前不承诺"AA 已满足"                                                                             |
| 给每条 toast 加 `aria-live`      | sonner 上游已有 polite 区域，重复包裹会播报两次                                                                                      |

## 明确不做

| 不做                                        | 理由                                             |
| ------------------------------------------- | ------------------------------------------------ |
| 全量颜色令牌化（334 `bg-*` + 530 `text-*`） | 镀金且不可验收，棘轮足够                         |
| 拆 `external.ts`（1629 行）                 | 单域、schema 与 handler 同处可读；等第二个域再拆 |
| 继续追 `: any`                              | 171/192 在测试里，规则已在测试目录关闭           |
| 开 `noUncheckedIndexedAccess`               | 已评估：数百处索引断言噪音大于收益               |
| 给函数补注释                                | 注释密度已偏高，问题不在注释                     |

## 本轮收口（2026-11-20）

覆盖率门禁（PR #248）合入 main 后，仓库里积了 5 个开放 PR 和 8 个陈旧 worktree，先收口再开新坑。

### PR 积压

| PR                                | 现状                                  | 动作                                                                          | 阻塞点             |
| --------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- | ------------------ |
| #245 JSON 列再收敛                | 无失败、无 pending                    | 直接 squash 合并                                                              | 无                 |
| #247 暗色主题语义色（UI 审计 P0） | 红 7 项（含 2 条门禁误报 + 1 条真降） | 先按 `flutter-mobile-plan.md` §13.3 二选一，再重跑                            | 门禁第二轮（§13）  |
| #239 日志来源与作答状态           | CONFLICTING，1 pending                | rebase 到 main，重跑                                                          | 与 #238 的改动重叠 |
| #243 deps minor 批量（13 个）     | 红 3 项（Lint + Playwright×2）        | 先看是不是依赖真坏了；若是审计/类型噪音，按既有口径（门禁只拦运行时依赖）收敛 | 未知               |
| #222 zod 3→4（mcp-server）        | 红 1 项（MCP 构建与文档验收）         | 同上；zod 4 是大版本，可能需改 schema 写法                                    | 未知               |

顺序：#245（无风险）→ #247（等 §13）→ #239（rebase）→ #243/#222（排障）。

### worktree 清理

判据（**不要**用"分支是否 main 的祖先"——squash 合并永远不是）：分支自有改动涉及的文件，
在 main 上是否已有相同内容。

| worktree        | 分支                          | PR        | 实测                                      | 处置                                   |
| --------------- | ----------------------------- | --------- | ----------------------------------------- | -------------------------------------- |
| wt-mockdb       | fix/history-filters           | #187 已合 | 2 个文件与 main 完全一致                  | **已删**（2026-11-20）                 |
| wt-recall-races | fix/recall-session-races      | #183 已合 | 2 个文件与 main 完全一致                  | **已删**                               |
| wt-ainative     | refactor/json-columns-batch2  | #245 开放 | 10 文件 +138/−62                          | 保留（等 PR）                          |
| wt-mobile       | fix/mobile-ui-tokens          | #247 开放 | 37 文件 +1482/−842，另有 4 个未提交测试   | 保留（#247 收口，见 mobile §15）       |
| wt-regrade      | feat/practice-log-origin      | #239 开放 | —                                         | 保留（等 PR）                          |
| wt-cross-rest   | test/cross-user-rest-fresh    | **无 PR** | 9 文件 +1371/−18                          | 待决：开 PR / 丢弃 / 保留              |
| wt-create-q     | feat/external-question-create | #233 已合 | 3 个文件与 main 仍有差异（main 多 55 行） | 待核：确认是 main 后续改动还是分支独有 |
| wt-dbaudit      | audit/prod-db-20261114        | #237 已合 | 1 个文件 20/20 行不同                     | 待核                                   |
| wt-sandbox      | chore/deps-libsql-0.18        | #203 已合 | 2 个文件，分支有 49 行 main 没有          | 待核（可能有未合并的后续提交）         |

待核三个的判据：`git log --oneline <main>..<branch>` 看是否只有 merge 提交；若含实质提交，
要么补 PR，要么 `git diff` 后确认无用再删。

### PR 排障步骤

| PR   | 步骤                                                                                                                                                          | 停止条件                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| #245 | `gh pr view 245 --json mergeable,mergeStateStatus` 复核（当前 `UNKNOWN`）；MERGEABLE 且 12 项绿 → squash 合并                                                 | 出现冲突则先 rebase                                        |
| #239 | 冲突来自与 #238 的同文件改动 → `git rebase origin/main`；冲突按"保留 #238 的服务端判分 + 保留 #239 的来源字段"解；解完跑相关 vitest                           | 若两者语义真冲突（同一字段两种写法）→ 回退 #239 重开       |
| #243 | 失败日志已过期 → 本地 `npm ci && npm run verify` 复现；若失败源于依赖本身（类型/ESLint 规则变化），按"门禁只拦运行时依赖"口径收敛，**不改业务代码迁就新版本** | 需要改业务代码 > 20 行 → 关闭该 PR 并锁回旧版本            |
| #222 | zod 3→4 是大版本（`z.string().email()` 迁移、`.passthrough()` 语义变化）→ 先 `cd mcp-server && npm run build` 复现，逐处改                                    | 工作量 > 半天 → 关闭并锁 `zod@3`，等 mcp-server 有测试再升 |

### 移动端

门禁第二轮与覆盖率后续见 `flutter-mobile-plan.md` §13–§18。

## 体验收口（2026-11-20）

来源：`docs/ui-audit-2026-11-20.md` 的 P0/P1 中**尚未修**的部分，按"用户会以为产品坏了"排序。
移动端两条见 `flutter-mobile-plan.md` §19、§20。

### W1 Web 接口失败显示成空态（P0，最伤信任）

| 项                         | 内容                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 证据                       | `my-next-app/src` 共 **22 处 `useQuery`，0 处解构 `isError`**；`components/ui/error-state.tsx` 已在 19 个文件里用过，缺的是数据入口区分三态                                                |
| 后果                       | 500/断网时走空列表分支，用户看到"暂无数据"，会以为数据被删 → 反复刷新、重录                                                                                                                |
| 约定                       | 渲染顺序固定 **loading → error → empty → data**；错误态必须带 `onRetry`（接 `refetch`）；文案区分"没有数据"与"加载失败，点击重试"                                                          |
| 批次 A（6 个高频页，0.5d） | `knowledge` / `history` / `wrong-book` / `stats` / `dashboard` / `textbook`                                                                                                                |
| 批次 B（其余 16 处，0.5d） | 逐处解构 `isError` + `error`，共用 error-state                                                                                                                                             |
| 判据                       | 每处渲染分支里出现 `isError`（grep 可核）；`npm run typecheck` 0 error；`lint:ci` 不新增；CI 的 layout-guard 61 条不回归；每个页面加一条 vitest：mock 抛错 → 渲染错误态且 `onRetry` 被调用 |
| 验证限制                   | **本机 glibc 2.17 跑不了 Chromium**，UI 只能靠 CI 的 Playwright + 真机自查；不承诺本地截图                                                                                                 |

### W2 手机上点不到的按钮（P1，功能不可用）

| 项     | 内容                                                                                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 证据   | 12 处 `opacity-0 group-hover:opacity-100`，其中 5 处是真功能：`components/textbooks/DeleteTextbookButton.tsx:59`、`app/notes/NoteSidebar.tsx:160`、`app/mindmap/MindmapSidebar.tsx:99`、`components/chat/ChatSidebar.tsx:153`、`app/admin/activity/_components/ActivityList.tsx:238` |
| 后果   | 触屏没有 hover → 按钮永不出现，删除/编辑类功能在手机上等于不存在                                                                                                                                                                                                                     |
| 修法   | 改用 `@media (hover: hover)` 判定（已落地为 `globals.css` 的 `.hover-reveal`）：只有真正支持悬停的设备才隐藏，触屏与混合设备常显；保留 `:focus-visible` 与 `.group:focus-within` 供键盘。**不要用 `md:` 断点**——宽度达标的触屏设备仍无法 hover                                       |
| 判据   | Playwright 375×667 视口断言 5 个按钮 `toBeVisible()`；桌面视口仍为悬停出现；`npm run typecheck` 0 error                                                                                                                                                                              |
| 工作量 | 0.5d                                                                                                                                                                                                                                                                                 |

### W1.1 防复发：把"裸 useQuery"变成门禁

补完 22 处只是清账，新页面仍会写裸 `useQuery`。按既有棘轮习惯，同批加门禁：

| #   | 动作                                                                                                                                                                              | 判据                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | 封装 `hooks/useAppQuery.ts`：内部固定 `loading → error → empty → data`，`error` 时返回可直接渲染的 `{isError, error, retry}`                                                      | 单测：抛错 → 返回 isError；成功 → 返回 data |
| 2   | 静态扫描测试（照 `navigation_rules_test.dart` 的做法，纯文本扫描）：`app/**/page.tsx` 与 `app/**/components/**` 禁止直接 import `react-query` 的 `useQuery`，只允许 `useAppQuery` | 新增一处裸 `useQuery` → 测试红              |
| 3   | 迁移白名单：现有 22 处记在 `useQueryAllowlist`，只减不增；每迁一处从名单划掉                                                                                                      | 名单长度只能变小                            |

工作量：封装 + 扫描 0.5d；迁移随 W1 批次 A/B 走。

### 执行顺序

W2（改动小、可当天合）→ W1 批次 A → W1 批次 B。两者互不依赖，可并行。

## 服务端性能与索引（计划，2026-11-20）

来源：`docs/mobile-performance.md` §8 的审计结论。**先复核再动手**——审计基于旧提交，部分项已被修掉。

### 复核结果（当前 main）

| #   | 审计项                                                    | 现状（`src/lib/db/drizzle-schema.ts`）             | 动作                         |
| --- | --------------------------------------------------------- | -------------------------------------------------- | ---------------------------- |
| 1   | `practice_logs.session_id`                                | **已加** `idx_session`（:187）                     | 无需动作                     |
| 2   | `session_reviews(session_id)`                             | 表零索引（:192）                                   | 加                           |
| 3   | `practice_logs(question_id, user_id, is_correct)`         | 有 `idx_question` + `idx_user_correct`，缺三列复合 | 先 `EXPLAIN QUERY PLAN` 再定 |
| 4   | `textbook_chapters(textbook_id)`                          | 表零索引（:551）                                   | 加                           |
| 5   | `knowledge_cards(user_id, created_at)` / `notes(user_id)` | 前者两个单列索引，后者零索引（:26）                | 加复合 / 加单列              |

结论：5 条里 1 条已修，4 条仍缺。**后续进展（PR #256）**：4 条缺失索引已全部补上（迁移 `drizzle/0021_perf_indexes.sql`），`EXPLAIN` 从 SCAN 变 SEARCH；本节保留为当时的复核记录。

### S1 索引快赢（0.5d）

| 动作                                                                                                                                   | 判据                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 加 4 个索引：`session_reviews(session_id)`、`textbook_chapters(textbook_id)`、`notes(user_id)`、`knowledge_cards(user_id, created_at)` | 每条的 `EXPLAIN QUERY PLAN` 从 `SCAN` 变 `SEARCH ... USING INDEX`（在线上库快照副本上跑，不碰生产） |
| 同步 schema-parity：`test-schema-utils.ts` 里手写 DDL 必须一起改                                                                       | schema-parity 测试绿（漏改必红）                                                                    |
| 迁移用项目既有方式（drizzle generate + 应用启动时迁移），**不手写 UPDATE**                                                             | 迁移在空库与线上快照副本上各跑一次，行数不变                                                        |

风险：`knowledge_cards` 是写多表（每次建卡），加复合索引会让写略慢；数据量小（千级），可接受。

### S2 查询上限与字段裁剪（0.5–1d）

| 动作                                                                                                                                                                    | 证据                                             | 判据                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| `knowledge.ts` / `questions.ts` 的 `limit` clamp **已落地**（PR #256，走 `parsePagination`，上限 100）；`history` 详情已去掉 `material_html`、`wrong-book` 详情改显式列 | 现状为已实现，后续只需补其它返回体的字段裁剪     | 传 100000 → 实际返回 ≤ 100（已有测试）   |
| `history.ts:216-236`、`wrong-question.ts:363-372` 改为只取需要的列                                                                                                      | 现在整行取回，带 `material_html` / `ai_mnemonic` | 响应体字节数对比（同一请求前后各量一次） |

### S3 请求路径上的同步重活（1–2d，需先量再定）

| 候选                                                          | 证据                     | 前置测量                         |
| ------------------------------------------------------------- | ------------------------ | -------------------------------- |
| `bcryptjs` 10 rounds（60–100ms/次登录）                       | `password.ts:3-8`        | 登录接口 p95                     |
| `admin.ts:213` `readFileSync` 整库 + 同步 `copyFile`/`rename` | 备份路径                 | 备份期间其他请求 p95             |
| `siliconflow-ocr.ts` / `mineru-service.ts` 的 CPU 重活        | 纯 JS/WASM、整包内存解压 | 一次 OCR 期间 `/api/history` p95 |
| AI 调用无队列（`knowledge.ts:244-260` 等 30s）                | 在 web 进程里同步等      | 同上                             |

做法：先做**测量**（并发两条会话：一条触发重活，一条轮询轻接口，记 p95），确认是"秒级抖动"再立项；
外置方案是 `worker_threads` 或独立进程 + 队列表，属架构改动，需单独评审。

#### S3.1 压测执行步骤（脚本已就绪：`scripts/measure-concurrency.mjs`）

| #   | 步骤       | 说明                                                                                                                  |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | 准备库副本 | 线上库 `VACUUM INTO '/tmp/snapshot.db'`，**不要直连生产**；`DATABASE_URL` 指向副本                                    |
| 2   | 起服务     | `node server.js`（生产构建，非 dev），记端口                                                                          |
| 3   | 基线       | `node scripts/measure-concurrency.mjs --base-url http://127.0.0.1:3000 --duration 30 --concurrency 1`（只轮询轻接口） |
| 4   | 压测       | 同命令加 `--heavy /api/practice/first-principles`（或 SQL 模式批写），`--concurrency 2`，跑 60s                       |
| 5   | 记录       | 轻接口 p50/p95/p99 前后对比；重活耗时                                                                                 |

**决策矩阵**（拿到数字后按此定，不凭感觉）：

| 轻接口 p95 抬升   | 结论                                                     |
| ----------------- | -------------------------------------------------------- |
| < 2× 且 < 200ms   | S4 不立项；S3 只做"把 AI 调用移出请求路径"这一项         |
| 2–10×             | 先做 S4 的第一步（两把锁统一成一把）+ S3 的 CPU 重活外置 |
| > 10× 或 p95 > 1s | S4 全量立项（读连接/WAL/统一锁），并考虑单开进程跑重活   |

### S4 单连接串行化（2–3d，架构）

- `db/index.ts:128-140` `@libsql/client` 本地文件单连接 → 所有读写串行
- 两把"互斥锁"（`withImportLock` / `withConfirmLock`）实际是不同队列，可同时进事务
- 方案候选：① 统一成一把锁（低风险，先做）；② 读路径走独立只读连接（需确认 libsql 是否支持）；③ 换 WAL 模式并确认 `busy_timeout`
- 判据：并发压测（SRS 同步 + `/api/history` 轮询）p95 从秒级回到 <100ms

### S5 每请求固定开销（0.5d）

| 动作                                                                                                                                   | 证据                                         |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `getGlobalFeatureFlag` 用 `cache()` 包一层（layout 三次串行 + dashboard 再查一遍）                                                     | `layout.tsx:69-74`、`feature-flags.ts:17-38` |
| middleware matcher 排除静态资源（`icons/`、`fonts/`）**已落地**；`?_rsc=` **不要排除**——排除会让受保护页面的客户端导航绕过未登录重定向 | `middleware.ts`                              |

判据：一次页面请求的 SELECT 次数（打点计数）从 N 降到 N-3。

### 顺序与不做

顺序：S1 → S2 → S5 → S3（先量）→ S4（评审后）。

不做：换数据库（sqlite→pg）；keyset 分页全量改造（`practice_logs` 仅 4990 行，offset 够用）。

## 运维收口（计划，2026-11-20）

三件事都属于"现在不出事，但出事时没有工具"。

### O1 日志表保留策略（0.5d）

| 表                 | 现状                                                     | 建议保留 | 理由                                 |
| ------------------ | -------------------------------------------------------- | -------- | ------------------------------------ |
| `pdf_import_tasks` | **已有**每小时清理（`scheduler.ts:47`，按 `expires_at`） | 现状     | 临时任务                             |
| `admin_logs`       | **无清理**                                               | 180 天   | 操作审计，排查历史问题够用           |
| `api_logs`         | **无清理**                                               | 90 天    | 每请求一行，增长最快                 |
| `api_audit_logs`   | **无清理**                                               | 180 天   | 安全追溯                             |
| `web_vitals`       | **无清理**                                               | 90 天    | 性能趋势，`vitals:report` 只回看近期 |
| `practice_logs`    | **不清理**                                               | 永久     | 学习数据（判分、SRS、统计的来源）    |

做法：`scheduler.ts` 加一个每日任务（与 03:00 备份错开，例如 04:10），每条 `DELETE ... WHERE created_at < datetime('now','-N days')`，**先 dry-run 打印将删行数**，确认后开启实际删除；日志里记每次删除行数。

判据：

- dry-run 输出各表将删行数，与 `COUNT(*) WHERE created_at < cutoff` 一致
- 跑一次后行数下降、`practice_logs` 行数**不变**
- 删除按 `created_at` 走既有索引（`EXPLAIN QUERY PLAN` 确认非全表扫）
- 失败时只记结构化日志并等下一周期（与现有 purge 任务同款 `audit-allow` 注释）

### O2 告警通道（0.5d）

现状：`docs/deploy.md` 的部署脚本有 60s 健康检查（失败会回滚），但**失败后没人知道**——只有你下次打开页面才会发现。

做法（不引依赖）：

- 新增 `scripts/notify.sh`：读 `ALERT_WEBHOOK_URL`（飞书/Telegram 任一），`curl` POST 一段文本；**未配置时打印警告并 exit 0**（不阻塞部署）
- `deploy.md` 的更新脚本在「健康检查失败 / 回滚成功 / 回滚失败」三处调用它，正文含：时间、镜像 tag、失败原因、当前版本
- 判据：把 webhook 指向一个本地 echo 服务，模拟健康检查失败 → 收到一条含 tag 与原因的消息；未配 webhook → 部署行为不变

### O3 zod high 风险处置（0.5–1d）

现状：`gh api .../dependabot/alerts` 显示 1 high（`zod`）+ 4 medium（`glob`/`minimatch`×2/`postcss-selector-parser`）；PR #222（zod 3→4）卡在 MCP 构建。

两条路，**必须先判定可达性再选**：

| 路   | 做法                                                                                                          | 前提                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 升级 | 完成 #222：zod 4 的破坏性变更（`z.string().email()` 迁移、`.passthrough()` 语义）逐处改；MCP 侧 schema 跟着改 | 改动量 ≤ 半天；否则走另一条                                                        |
| 接受 | 锁 `zod@3.x`，在 `docs/decisions.md` 写明：漏洞路径是否可达、为何接受、复审日期                               | 需要确认 zod 只用于服务端入参校验（输入先经框架/路由层），无可控输入直达受影响 API |

判据：

- `npm audit --omit=dev` 的 high 归零，或 decisions.md 有一条带日期的风险接受记录
- 若选升级：`npm run verify` 全绿 + MCP 冒烟通过

### O4 不做

- 不接 Prometheus/Grafana（单人项目，`/metrics` 已有但没人看）
- 不做日志集中采集（stdout + docker logs 足够）
- 不清理 `practice_logs`（学习数据不可再生）

## Web 覆盖率门禁（计划，2026-11-20）

移动端已有三档门禁（global / scope / 单文件回退），Web 侧**只有测试数量，没有覆盖率信号**：
`@vitest/coverage-v8` 装在 devDependencies 里但没人调用，`verify` 四闸里没有覆盖率，
`vitest.config.ts` 也没有 thresholds。

### W-COV1 先量（0.2d）

```bash
cd my-next-app
npx vitest run --coverage --coverage.reporter=text-summary
npx vitest run --coverage --coverage.reporter=json-summary
```

记录：全局行覆盖、`src/lib/**`（逻辑层）与 `src/app/**`+`src/components/**`（UI）分别多少。
**没有这组数之前不设阈值**（设高了挡所有 PR，设低了等于没有）。

### W-COV2 用 vitest 原生 thresholds（0.3d）

不自己写 gate 脚本（mobile 那个是因为 Dart 侧没有原生支持；vitest 有）：

```ts
// vitest.config.ts
coverage: {
  provider: 'v8',
  reporter: ['text-summary', 'lcov'],
  exclude: ['**/*.test.{ts,tsx}', 'scripts/**', 'drizzle/**', '.next/**'],
  thresholds: {
    lines: <实测-1>,
    'src/lib/services/**': { lines: <实测-1> },
    'src/lib/api/**':      { lines: <实测-1> },
    'src/lib/auth/**':     { lines: <实测-1> },
    'src/lib/db/**':       { lines: <实测-1> },
    'src/app/**':          { lines: <实测-1> },
    'src/components/**':   { lines: <实测-1> },
  },
}
```

- 只升不降：每次提升后把 thresholds 抬到「实测 − 1pp」，与 mobile 的 `coverage_baseline.json` 同一口径
- 目录阈值的作用与 mobile 的 scope 相同：防止「服务层写得好」掩盖「页面全没测」

### W-COV3 接进 CI（0.2d）

| 动作                                                     | 说明                                         |
| -------------------------------------------------------- | -------------------------------------------- |
| `package.json` 加 `test:coverage`                        | `vitest run --coverage`                      |
| `ci.yml` 的 `unit-test` job 改跑 `npm run test:coverage` | 耗时从 3.6min 涨到约 5min（v8 插桩），可接受 |
| 失败时上传 `coverage/lcov.info`（`if: always()`）        | 与 mobile 的 `coverage-lcov` 同名风格        |
| `verify` 四闸 → 五闸（加 `test:coverage`）               | 本地一条命令能跑完                           |

### W-COV4 判据

1. 改动前后各跑一次，贴出 `text-summary`（global 与两个分组的行覆盖）
2. 故意删一个测试 → CI 红且报「threshold not met」
3. 故意把某文件覆盖降到阈值下 → 红
4. PR 反馈时长增量 ≤ 2min

### W-COV5 不做

- 不追 80%：Web 有 27 个整页 client 组件、8 个 550–882 行巨型组件，追高必然写大量脆测试
- 不做 per-file 阈值（vitest 的 glob 阈值已够；单文件阈值在 Web 上噪音大于收益）
- 不给 `scripts/**` 与 `drizzle/**` 要求覆盖（一次性脚本与 SQL）

## 数据正确性（计划，2026-11-20）

这两条不是"新功能"，是**已经错了的数据**。先修，否则所有统计与判分都不可信。

### D1 移动端作答时长小 1000 倍（P0）

| 项     | 内容                                                                                                                                                                                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 证据   | `mobile_app/lib/features/practice/presentation/practice_provider.dart:249` 用 `DateTime.now().difference(...).inSeconds`；服务端 `src/lib/api/routes/practice.ts:274` 把 `duration` 直接写进 `practice_logs.duration_ms`；Web 发的是毫秒（`Date.now()-start`） |
| 影响   | 移动端每题的 `duration_ms` 只有真实值的 1/1000；会话 `total_duration_ms`、平均用时、任何按时长做的统计全错                                                                                                                                                     |
| 修法   | Flutter 改 `inMilliseconds`；服务端 schema 的 `duration` 字段加注释写明**毫秒**；**存量不回填**（无法区分每行来源，回填赌错比不动更糟）                                                                                                                        |
| 判据   | Flutter 单测：fake 时间推进 3s → 请求体 `duration == 3000`；服务端路由测试：入库 `duration_ms == 3000`；schema 注释进 codegen 校验                                                                                                                             |
| 工作量 | 0.5d                                                                                                                                                                                                                                                           |

### D2 `type` 为 NULL 的 84 题（P0，判分错）

| 项     | 内容                                                                                                                                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 证据   | `docs/audit/2026-11-19-prod-db-2026-11-14-audit.md`：84 题 `type=NULL`                                                                                                                                                                                                 |
| 影响   | 判分按 `type` 分支：多选忽略顺序、单选/判断按字母集合、填空按整串。`NULL` 会落进 else 分支被当单选处理 → 多选题判错，用户背的答案与系统不一致                                                                                                                          |
| 修法   | ① 先量：导出这 84 题的 `id/题干摘要/选项数/answer`；② 按规则推断（answer 含多个字母 → multi；选项为"正确/错误" → truefalse；否则 single）；③ **dry-run 输出 84 行对照表人工确认**；④ 确认后 apply；⑤ 前端兜底：`type == null` 时按"选项集合比较"判分，避免清洗前继续错 |
| 判据   | dry-run 表逐行有推断依据且可回滚；apply 后 `SELECT COUNT(*) FROM questions WHERE type IS NULL` = 0；抽查 10 题判分与人工一致                                                                                                                                           |
| 工作量 | 0.5–1d（含人工确认）                                                                                                                                                                                                                                                   |

### D3 不做

- 不改 `practice_logs` 历史行的时长（无来源标记）
- 不按"看起来像多选"自动改 `type`（必须人工过一遍 dry-run 表）

## 移动端功能缺口（决策框架，2026-11-20）

Web 有、移动端没有的功能：`notes`（笔记）、`mindmap`（思维导图）、`knowledge-graph`（知识图谱）、`ocr`（拍照识别）、`cultivation`（养成）。

| 功能     | 手机上真的会用吗           | 建议                                           | 成本                  |
| -------- | -------------------------- | ---------------------------------------------- | --------------------- |
| 笔记     | 碎片时间大概率不会写长笔记 | 不做移植；如需查看，深链到 Web（浏览器打开）   | 移植 3–5d / 深链 0.5d |
| 思维导图 | 编辑需要大屏与拖拽         | 只读查看可考虑；编辑不做                       | 只读 2d               |
| 知识图谱 | 探索型功能，屏幕小体验差   | 不做                                           | —                     |
| OCR      | 拍照搜题在手机上反而合理   | 优先级高于前三者，但要先确认题库覆盖率是否值得 | 2–3d                  |
| 养成     | 纯 Web 趣味功能            | 不做                                           | —                     |

**决策点（待你定）**：只做"深链跳 Web"（0.5d），还是连 OCR 一起做（2–3d），还是都不做。

## 模块化收口（计划，2026-11-20）

### 0. 实测基线（评价依据，不是感觉）

| 指标                        | 值                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web 规模                    | 739 文件 / 131,836 行；测试 47,892 行（0.36×）                                                                                                                                                   |
| Mobile 规模                 | 148 文件 / 30,564 行；测试 24,028 行（0.79×）                                                                                                                                                    |
| 依赖方向                    | `lib→app` 反向 **0**、`services→routes` **0**、`routes→services` 39 ✅                                                                                                                           |
| **路由直连 db**             | **7 / 23 个生产路由文件**（`admin` `annotations` `external` `practice` `profile` `textbook` `wrong-book`）❌                                                                                     |
| 最大文件                    | `routes/external.ts` **3,242 行**（占全部路由 9,178 行的 35%）                                                                                                                                   |
| 错误映射                    | **码表已存在**：`AppError.kind → STATUS_BY_KIND` + 唯一渲染点 `toErrorResponse`（44 行）。26 个生产 Error 类中 **19 个已继承 `AppError`**，5 个仍为裸 `Error`，路由里 `instanceof` 链剩 **3 处** |
| 移动端跨 feature import     | **28 处**（其中 `auth_provider → practice_resume_provider` 方向错误）                                                                                                                            |
| 移动端 >500 行 presentation | **10 个**（`dashboard_screen` 1,047、`history_detail` 898、`settings` 840、`practice` 797；已排除 `.freezed.dart` 生成文件）                                                                     |
| 分页重复                    | 5 个路由用共享 `parsePagination`，`history.ts`/`external.ts`/`questions.ts:71` 仍手写                                                                                                            |
| 类型逃逸                    | `as any` 非测试仅 **2** 处；`as unknown as` 非测试 43 处                                                                                                                                         |

> **口径注**：`路由直连 db` 只统计**生产代码**。宽口径 22 个文件里有 **15 个在 `__tests__/` 下** —— 测试用 `vi.mock("@/lib/db")` / `await import("@/lib/db")` 造真实依赖 fixture 是合法写法，把它们算进门禁会让 15 条白名单永远删不掉，"只减不增"就失去意义。

### 1. 六个问题与修法

| #   | 问题                                  | 修法                                                                                                                                                                                                                                                              | 判据                                                                                     |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P1  | 7 个生产路由直连 db，service 层被绕过 | 加**分层门禁**：`scripts/audit-layering.cjs` **按模块路径解析**判定（覆盖 `@/lib/db` 及 `drizzle-schema`/`executor`/`db-file` 等子模块，含相对路径），白名单存量、只减不增；随后按资源分批把查询搬进 service                                                      | 新增一处 route→db import 直接红；白名单 7 → 0                                            |
| P2  | `external.ts` 3,242 行                | 按资源拆 `routes/external/{questions,srs,recall,notes,misc}.ts` + `routes/external/index.ts` 聚合路由表                                                                                                                                                           | **OpenAPI 快照零 diff**（路径与字段完全不变）+ 全量测试绿                                |
| P3  | 码表已存在，缺口在别处                | **不新建 error-codes.ts**（会与 `app-error.ts` 重表漂移）：① 给 `InvalidQuestionIdsError`/`ReservedExternalIdError` 补 `AppError` 血统当安全网（响应不变，漏写分支时从 500 变 400）；② 修 3 处 `code: "custom"` 泛化码；③ 收敛 `practice.ts` 的 `instanceof` 分支 | 26 类错误的 `status` + `body.error` 对拍逐条不变；`custom` 码归零                        |
| P4  | 移动端跨 feature 依赖 28 处           | ① `Question`/`PracticeResume`/`WrongQuestion` 等跨域模型上提到 `lib/shared/domain/`；② **`auth→practice` 依赖反转**：auth 只 bump `authEpoch`，由 practice 侧 `watch(authEpochProvider)` 自己清断点                                                               | 跨 feature import 28 → **≤10**；`auth` 目录 0 处 import practice；`dart analyze` 0 error |
| P5  | 10 个 >500 行 presentation            | 按 section 拆（`dashboard_screen` 的 `_buildXxx` 已是天然边界），每屏不超过 500 行                                                                                                                                                                                | 单文件 <500 行且**行为零改动**（仅搬移，不改逻辑）                                       |
| P6  | 3 处手写分页                          | `history.ts`/`external.ts`/`questions.ts` 改用 `parsePagination`                                                                                                                                                                                                  | 相同 query 解析结果与现在一致（对拍）                                                    |

### 2. 明确不做

- 不追「每个文件 <300 行」：行数是症状不是目标，拆到 500 行以内即可
- 不新建第二张错误码表：`app-error.ts` 已是唯一事实来源
- 不把 26 个 Error 合并成 1 个：它们承载不同业务语义（`InvalidQuestionIdsError` / `OfflineCacheUnavailable`…），合并会丢可分类性
- 不动外部分页语义（offset 保持，不趁机改 keyset）
- 不在本计划里改渲染层（27 个 client 页面 / 8 个巨型组件另属 §9 的渲染层治理）

### 3. 并行切分（按文件冲突，不按编号）

**Wave 1（4 条 lane，互不碰同一文件）**

| Lane | 范围                                                                      | 独占文件                                                                                                     | 工作量 |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| W1   | P2 拆 `external.ts` + 该文件 route→service 迁移 + **P6 的 external 分页** | `routes/external/**`（新）、`routes/external.ts`（删）                                                       | 1d     |
| W2   | P3（补血统 / 修泛化码 / 收 instanceof）                                   | `lib/errors/app-error.ts`、`services/{import-service,question-batch}.ts`、`routes/practice.ts`、对拍测试     | 0.5d   |
| W3   | P1 门禁脚本（**只加脚本与白名单，不动路由**）                             | `scripts/audit-layering.cjs`（新）、`ci.yml` 加一步、白名单 json                                             | 0.5d   |
| M1   | P4 模型上提 **+ auth→practice 依赖反转**                                  | `lib/shared/domain/**`（新）、各 feature 的 import 行、`auth_provider.dart`、`practice_resume_provider.dart` | 1d     |

**Wave 2（W3 落地后，白名单量化进度）**

| Lane | 范围（白名单 7 条，external 归 W1）                              | 说明                                                                      |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| W4a  | `routes/{admin,profile}.ts` → `services/{admin-service,user}.ts` | admin 还引 `@/lib/db/db-file`（备份/表检查/重连），一并下沉               |
| W4b  | `routes/{wrong-book,practice,annotations,textbook}.ts`           | wrong-book 17 处引用最多；`annotations`/`textbook` 目前无 service，需新建 |
| M2a  | P5 拆分：`dashboard_screen`(1047)、`history_detail`(898)         | 必须在 M1 之后（dashboard 依赖 practice 模型）                            |
| M2b  | P5 拆分：`settings`(840)、`practice`(797) + 其余 6 个            | 与 M2a 不同文件，可并行                                                   |
| W5   | P6 分页收敛（`history.ts`、`questions.ts:71`）                   | 与 W4b 不同文件；external 已归 W1                                         |

**依赖关系**：W1/W2/W3/M1 可同时开；W4a/W4b 需等 W3 的脚本（否则没有"迁移进度"的量化）；M2a/M2b 需等 M1。白名单终态 **7 → 0**：W1 吃掉 `external.ts`，W4a 吃掉 2 条，W4b 吃掉 4 条。

### 4. 验收（每条 lane 各自做，不跑全量）

| Lane    | 验收                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| W1      | `npm run contract:check` 快照零 diff；`npx tsc --noEmit` 0 error；external 路由测试全绿；分页对拍                                       |
| W2      | 对拍测试：26 种错误 + 未知错误，`toErrorResponse` 的 `status` + `error` 文案与改前逐条一致；`node scripts/audit-catches.cjs` 无新增标记 |
| W3      | `npm run audit:layering` 通过（白名单 7）；故意加一处 route→db import → 脚本红并指名                                                    |
| M1      | 跨 feature import 28 → ≤10（grep 可核）；`grep -rn "import '.*practice" lib/features/auth` = 0；`flutter test` 全绿；覆盖率门禁不降     |
| M2a/M2b | 目标屏各 <500 行；`flutter test` 全绿（行为零改动）                                                                                     |
| W4a/W4b | 每批迁移后 `contract:check` 一致 + route 定向测试绿；白名单相应递减（`--update` 删条目）                                                |

### 5. 风险与止损

| 风险                                               | 止损                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| route→service 迁移误改查询语义                     | 契约快照 + 每批只动"搬移"，不顺手优化 SQL；有争议的查询留在白名单里下一批           |
| 拆 `external.ts` 时路由注册顺序变化导致 404        | 快照零 diff 是硬判据；额外加一条"所有 external 路径逐个可达"的路由表测试            |
| 补 `AppError` 血统改变既有 4xx 文案 → 前端文案回归 | 对拍测试锁死；`instanceof` 分支保持优先命中，响应逐字节不变                         |
| domain 上提引发 import 大面积改动                  | `dart analyze` 硬闸；先上提模型文件、再改引用，两步提交                             |
| 大文件拆分产生"仅搬移的假绿"                       | 每条 PR 声明"零行为改动"，判据是全量测试绿 + 无逻辑 diff（review 时只看是否只移动） |

### 6. 工期

| 批次   | 内容                    | AI 墙钟  | 你的时间            |
| ------ | ----------------------- | -------- | ------------------- |
| Wave 1 | W1+W2+W3+M1 并行        | 1.5–2d   | 0.5d（review/合并） |
| Wave 2 | W4a+W4b+M2a+M2b+W5 并行 | 1.5–2d   | 0.5d                |
| 合计   |                         | **3–4d** | 1d                  |

## 执行约定

- 每个 phase 一个 PR，合入前 CI 全绿；
- 取舍类决策按默认值自定，记录进 [`decisions.md`](./decisions.md)；
- 数字型指标（warning 数、`as any` 数、集成测试数）在 PR 描述里给出前后对比。
