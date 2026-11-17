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
- [x] 错误映射收敛：`AppError` + 5 类语义（validation / business / not-found / conflict / forbidden）
      + domain code；`toErrorResponse()` 是唯一 HTTP 映射点（9 个类只换父类、不改名）
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

### 批次 A：会咬到用户的（0.5–1d，先做）

| #   | 事项                                                                                                    | 门禁（可复现）                                                                                                                                                                                                                                                                                           | 验收                                                                         |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A1  | **IME 组合态**：13 处 Enter handler 加 `isComposing` 守卫                                               | 共享判定 `isImeComposing(e)`（`nativeEvent.isComposing \|\| keyCode===229`）+ 新增 `scripts/audit-ime-enter.cjs`（**TS AST**，照 `audit-catches.cjs`）：凡 `onKeyDown`/`addEventListener("keydown")` 里判 Enter 且未经过该判定的，一律报出；白名单 `docs/ime-enter.baseline.json` 逐条写理由。**13 → 0** | 3 条主路径各一条单测（合成事件 `isComposing:true` 断言未提交）；脚本计数归零 |
| A2  | **触屏热区**：`WrongQuestionCard.tsx:61`、`FolderTreeView.tsx:242/250/270`、`AddToFolderDialog.tsx:114` | 渲染后断言热区 ≥24（`getBoundingClientRect`）；色板**不得**用 `-m-*` 外扩（会重叠 12px），按 pitch ≥ 视觉+间距改                                                                                                                                                                                         | 6 个控件各一条；layout-guard 的 `<44×44` 报告里这几处消失                    |
| A3  | **错题本失败态**：`use-wrong-book-controller.ts:115` 加 `try/catch/finally` + `loadError`               | 契约测试两条：action **throw** → 渲染 `ErrorState`（不再永久转圈）；action 返回 **`{success:false}`** → 渲染 `ErrorState`（**不再**显示"太棒了！暂无错题"）                                                                                                                                              | 两条用例 + 手动断网走查一次                                                  |
| A4  | **删文件夹加确认**：`use-wrong-book-controller.ts:428` + `FolderTreeView.tsx:281`                       | 用例：点"删除"后 `deleteFolderAction` **未被调用**、出现含文件夹名的确认框；取消则不调用                                                                                                                                                                                                                 | 1 条用例                                                                     |
| A5  | **答题写库失败不再静默**：`use-practice-controller.tsx:317`                                             | 用例：action reject → 出现带重试的 toast，且重试会再次调用                                                                                                                                                                                                                                               | 1 条用例                                                                     |
| A6  | **底部预留算安全区**：`layout.tsx:118`                                                                  | 375 视口断言 `main` 的 `padding-bottom ≥ 96px`；再加一条**静态断言**：CSS 必须含 `env(safe-area-inset-bottom)`，防止退回固定值                                                                                                                                                                           | 1 条 e2e + 1 条静态                                                          |

> A6 的诚实边界：浏览器里 `env(safe-area-inset-bottom)` 恒为 0，**自动化只能验 88+8 那部分**，
> 安全区只能靠 `calc()` 写法保证（人工/真机）。别把它写成"门禁覆盖了 iPhone"。

### 批次 B：结构与无障碍债（2–3d）

| #   | 事项                                                                                                                                                                                                                       | 门禁                                                                                                     | 依赖                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| B1  | `label` 无关联控件 **42 → 0**（补 `htmlFor`/`id`）                                                                                                                                                                         | a11y 静态 96 → 54 后 `--update`；棘轮自动拦新增                                                          | 无                                                                                            |
| B2  | 自建 `fixed inset-0` 浮层 **8 处换 Radix**（`dialog.tsx`/`alert-dialog.tsx`），不再手写焦点陷阱                                                                                                                            | 每个浮层一条：打开后 `document.activeElement` 在浮层内、`Esc` 可关、关闭后焦点回到触发按钮               | **必须排 T-12（滚动模型归一）之后**：`fixed` 浮层在 body 滚动与内滚容器下行为不同，先改会白做 |
| B3  | `focus-states` **8 处**补可见焦点环 + 焦点环对比度实测                                                                                                                                                                     | 8 条：`focus()` 后 `outline`/`box-shadow` 非 none；对比度给出实测数字（**1.4.11 是 AA，3:1**，不是 AAA） | 无                                                                                            |
| B4  | `live region`：聊天流式、答题切题、计数变化                                                                                                                                                                                | 断言 `role="status"` 存在且切题后文本随之更新                                                            | 无                                                                                            |
| B5  | **交互类命中分诊 45 → <10**（`click-events-have-key-events` 22 + `no-static-element-interactions` 23）：合法的遮罩/卡片浮起改成真语义（`<button>`、`role="button"`+`tabIndex`+`onKeyDown`），遮罩类随 B2 换 Radix 自动消失 | 每条降下来的都在报告里写「改了什么语义」；终态：交互类 <10 且总数 ≤54                                    | **与 B2 同批做**：换 Radix 会让大部分遮罩命中直接消失，分成两批会撞同一批文件                 |

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

## 执行约定

- 每个 phase 一个 PR，合入前 CI 全绿；
- 取舍类决策按默认值自定，记录进 [`decisions.md`](./decisions.md)；
- 数字型指标（warning 数、`as any` 数、集成测试数）在 PR 描述里给出前后对比。
