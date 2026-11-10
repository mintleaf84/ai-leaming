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

- [ ] 127 个「只打日志」的 catch 三分类（转换重抛 / 明确业务错误跳过 / 可忽略+结构化日志）
- [ ] 239 处 `console.*` 收敛到 `src/lib/logger.ts`，关键路径带 `requestId/sessionId/sourceKey`
- [ ] 前端 `ErrorBoundary` + 统一 `sonner` 错误提示；loading/empty/error 三态复用 `ui/empty-state.tsx`
- [ ] 加 `no-console` lint 规则（`logger.ts` 例外），防止回潮
- 验收：`grep -c "console\."` < 20；`docs/error-handling.md` 落盘

## P3 类型收紧（5h）

- [ ] `as any` 269 → <100，先 `server/actions` + `api/routes`，再 UI
- [ ] 每 50 处一个 PR，`tsc` 保持 0 error
- 验收：`grep -rn "as any" src | wc -l` < 100；`noUncheckedIndexedAccess` 单独评估

## P4 前端专项（4h）

- [ ] 26 个 Playwright spec 里挑 8 条关键路径进 CI（chromium-only）：登录 → 练习 → 复盘 → 导入 → 历史 → 管理后台
- [ ] 三态组件规范化（loading / empty / error）
- 验收：CI 出现 `e2e` job 且绿；覆盖清单写入 `docs/test_cases.md`

## 执行约定

- 每个 phase 一个 PR，合入前 CI 全绿；
- 取舍类决策按默认值自定，记录进 [`decisions.md`](./decisions.md)；
- 数字型指标（warning 数、`as any` 数、集成测试数）在 PR 描述里给出前后对比。
