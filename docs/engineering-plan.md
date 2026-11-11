# 工程质量计划（2026-11）

目标：把「靠人记得」改成「靠机制拦住」。规范见 [`engineering.md`](./engineering.md)。

## 基线（2026-11-11 实测）

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
- [x] **catch 形态机械化审计**：`scripts/audit-catches.cjs` 把每个 catch 归类为
  `rethrow`(20) / `degraded`(88) / `fallback`(60) / `logged`(71) / `silent`(89)，
  基线写入 `docs/catch-audit.baseline.json`，CI 中 `logged/fallback/silent` 任一增加即失败
- [ ] 分批把 `logged`(71) / `silent`(89) 降级为 `degraded` 或 `rethrow`（台账已就位）
- [ ] 前端 `ErrorBoundary` + 统一 `sonner` 错误提示；loading/empty/error 三态复用 `ui/empty-state.tsx`
- 验收：`npm run lint:ci` 通过且 `no-console` 计数为 0（以 lint 结果为准，不用 grep —— `welcome.ts` 的代码示例字符串里应保留 `console.log`）；`docs/error-handling.md` 落盘
- **零计数覆盖范围**：`src/lib/**/*.ts`、`src/server/**/*.ts`、`src/app/**/*.ts`、`src/app/{page,layout}.tsx`、`src/instrumentation.ts`
- **显式豁免**（因 Edge/客户端共享，必须保留 `console`）：`src/middleware.ts`、`src/lib/utils/retry.ts`、`src/lib/ai/rag.ts`、`src/lib/services/{srs,knowledge,question-folder}.ts`、`src/app/**/hooks/**`、`src/app/**/components/**`、全部测试与 `scripts/**`

## P3 类型收紧（5h）

- [x] **生产代码 `as any`：6 → 3**（`subscription`/`config`/`history` 改为精确的 `Parameters<typeof fn>[0]`；剩余 3 处为 ReportView 的 recharts 类型不兼容 + 2 个测试工具）
- [x] ESLint `no-explicit-any` 在测试/mock 目录关闭（那里的 `as any` 是构造非法输入的正当手段），生产代码仍受约束
- 结论：warning 总数 **536 → 82**（`no-explicit-any` 449 → 1）
- [ ] `noUncheckedIndexedAccess` 单独评估

## P4 前端专项（4h）

- [x] CI 新增 `e2e` job（chromium-only）：auth / practice-flow / review-flow / dashboard / wrong-book / history / questions-import / admin 八条关键路径；用 **生产服务**（`next build` + `next start`）而不是 dev，避免按路由现编译；CI 上 `retries=1`、`workers=2`
- [x] 三态组件规范化：新增 `ui/error-state.tsx` + `app/error.tsx`（路由级错误边界）+ `app/global-error.tsx`（根布局兜底）
- [x] e2e 建库改为**回放真实迁移**（不再手写 DDL）；并打开 `ENABLE_INTELLIGENT_REVIEW` 开关，让复盘用例真正生效
- 验收：CI 出现 `e2e` job 且绿；覆盖清单写入 `docs/test_cases.md`

## 执行约定

- 每个 phase 一个 PR，合入前 CI 全绿；
- 取舍类决策按默认值自定，记录进 [`decisions.md`](./decisions.md)；
- 数字型指标（warning 数、`as any` 数、集成测试数）在 PR 描述里给出前后对比。
