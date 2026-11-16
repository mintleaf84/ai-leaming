# 工程质量计划（2026-11）

目标：把「靠人记得」改成「靠机制拦住」。规范见 [`engineering.md`](./engineering.md)。

## 基线（2026-11-17 实测）

| 指标                                                                                   | 现状                                                                      | 上一版（2026-11-11） |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------- |
| ESLint warning（棘轮）                                                                 | **7**                                                                     | 536                  |
| ├ `no-unused-vars`                                                                     | **0**                                                                     | —                    |
| └ 其余（exhaustive-deps 3 / require-imports 2 / anonymous-default 1 / explicit-any 1） | 7                                                                         | —                    |
| `: any`（源码 / 测试）                                                                 | 20 / 171                                                                  | 269                  |
| `as unknown as`                                                                        | 44（服务层 13 处里 **9 处是同一句** `tx as unknown as typeof drizzleDb`） | —                    |
| 自定义 Error 类                                                                        | 9 个（recall 一个功能占 5 个），映射各写各的                              | —                    |
| 混职责页面（>400 行且同时有取数/状态机/渲染）                                          | 8（最大 882）                                                             | —                    |
| 源码 / 测试规模                                                                        | 70,468 / 33,144 行                                                        | —                    |
| 页面/组件直连 `drizzleDb`                                                              | **0 处**（分层干净）                                                      | —                    |
| 闸门                                                                                   | lint 棘轮 / catch 零容忍 / 布局 61 条 / schema 列级 / 判分基准棘轮        | 4 项                 |
| Node 版本固定                                                                          | `engines` + `.nvmrc` + `preinstall` 守卫                                  | 无                   |
| E2E                                                                                    | 10 条关键路径在 CI 真跑（生产构建）                                       | 26 spec，不在 CI     |

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
  - [ ] admin 题库 CRUD（含批量导入）
  - [ ] 鉴权边界（未登录 / 跨用户）
  - [ ] RAG 向量写入（sqlite-vec）
  - [ ] 备份与恢复
- [ ] 把 5 个最没价值的 mock-db 测试改成真实库
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
- [ ] server action 侧也走同一分类（现在只靠 `handleServerError` 回 message，前端拿不到 kind）
- [x] `affectedRows(result)` 封装（2 处 `rowsAffected` 断言）；顺带修 `rowsAffected || ids.length`
      把「一行没删」当「全删」的 bug
- 验收：新增 `no-as-unknown-as-tx` 形式的检查（lint 规则或 grep 计数棘轮）；
  外部 API 状态码语义不变（`docs/api.md` 状态码表同步）

## M2 页面职责拆分（3–5d）

判据不用行数：**同一文件里同时出现 ① 取数 `await *Action`/`fetch` ② 状态机（>5 个 state 或串行 effect）
③ 渲染**，且 >400 行。范式见 `app/practice/hooks/use-practice-controller.tsx`。

- [ ] `admin/users/page.tsx`（795）→ `useUsersData` + 表格 + 表单弹窗（**先做**，与 M3 的 admin CRUD 测试互为支撑）
- [ ] `admin/api-keys/page.tsx`（882）
- [ ] `RecallSession.tsx`（682）→ `useRecallSession` + 三屏组件
- 验收：新增 hook 有独立单测；纯重构不改行为，由 10 条 E2E + 61 条布局护栏兜底

## M3 机制补齐（2–3d）

- [ ] **归属矩阵测试**：遍历已注册路由，断言每个端点对「他人资源」返回 404/403；
      新路由未登记即红 —— 让 IDOR 从「靠评审发现」变成「靠机制发现」
- [ ] admin 题库 CRUD 真实契约测试（P1 遗留）
- [ ] RAG 向量写入、备份恢复契约测试（P1 遗留）
- [ ] 剩下的 5 个 mock-db 测试改真实库（P1 遗留）
- 验收：矩阵覆盖全部 `src/lib/api/routes/*.ts` 的路由；新增 4 类真实契约测试

## M4 入口与本地闭环（0.5d）

- [ ] README 指向 `engineering.md` / `engineering-plan.md`（现在只有 AGENTS.md 指）
- [ ] `npm run verify` = `typecheck` + `lint:ci` + `test:run` + `audit:catches`
- [ ] 审计 `.agents/skills/` 的 16 个技能，删掉与现行工具链不符的
- 验收：新 clone 按 README 能一条命令跑完四闸

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
