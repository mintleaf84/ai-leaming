# 错误处理与日志规范

> `AGENTS.md` 五条硬规则之二的展开：`catch` 只允许三种形态。本文件给出判定方法、当前台账和迁移进度。

## 三个允许的形态

| 形态                        | 何时用                                       | 写法                                                                 |
| --------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| **转换重抛**                | 调用方需要知道失败，但错误类型要换成业务语义 | `throw new ImportError("导入失败", { cause: err })`                  |
| **命中明确业务错误后跳过**  | 失败是预期内的、可枚举的，且能写出判定条件   | 只跳过「题目不存在」，其余 `throw`（见 `srs.ts`）                    |
| **真正可忽略 + 结构化日志** | 日志/埋点/缓存清理等旁路                     | `logger.warn({ err, key }, "xxx 失败，已忽略")` + 注释说明为何可忽略 |

**禁止**：`catch (e) { console.warn(e) }` 后继续执行 —— 这是历史上所有静默失效的共同形态（SRS 同步装了三个月就是这个形态）。

## 判定流程（30 秒）

```
失败会影响用户看到的数据吗？
├─ 会 → 调用方需要处理吗？
│        ├─ 需要 → 转换重抛（保留 cause）
│        └─ 不需要 → 转换重抛更安全，别吞
└─ 不会（旁路） → 能写出"哪种错误可以忽略"的确切条件吗？
         ├─ 能 → 条件 + 结构化日志（带 key/attempt 等字段）
         └─ 不能 → 说明你还不知道它会怎么失败 → 重抛，让它在测试/日志里现形
```

## 日志

- 服务端统一 `src/lib/logger.ts`（pino）：`logger.error({ err, ...ctx }, "message")`；
- 迁移期兼容垫片：`log.error("message", err)` 会把 `Error` 归到 `err` 字段、其余参数归到 `args`，**新代码不要再用垫片**；
- 客户端组件（`"use client"`）保留 `console`，不引入 pino（会把 Node 依赖打进浏览器包）；
- ESLint `no-console` 已对 `src/lib/**`、`src/server/**`、`src/middleware.ts`、`src/instrumentation.ts` 生效（warning，按规则棘轮跟踪），新增裸 console 会让 `lint:ci` 失败。

## 当前状态（2026-11-11）

| 指标                 | 迁移前 | 现在                                 |
| -------------------- | ------ | ------------------------------------ |
| 服务端裸 `console.*` | 154 处 | **0 处**                             |
| `catch` 总数         | 336    | 336                                  |
| 其中"只打日志后继续" | 127    | 待逐条分类（见下）                   |
| `no-console` 规则    | 无     | 已启用（服务端目录，warning + 棘轮） |

## 机械化审计（推荐先用它定位）

```bash
npm run audit:catches -- --list   # 列出全部 logged / fallback / silent 位置（含行号与签名）
node scripts/audit-catches.cjs    # 与基线比对（CI 已接入）
```

脚本用 **TypeScript AST** 解析（不是正则）：只统计「会从 catch 主体逃逸」的 `throw`，
忽略嵌套函数内部的 throw 与字符串里的 `throw` 字样；`.catch(` 不会被误当成 catch 子句。
基线按「文件 + 代码块哈希 + 序号」记录签名，因此"修好一个、新增一个"不会互相抵消。

脚本把每个 `catch` 归类：

| 分类       | 含义                             | 处置                    |
| ---------- | -------------------------------- | ----------------------- |
| `rethrow`  | 块内 `throw`                     | ✅ 正确                 |
| `degraded` | 有日志 + 有 return/continue 降级 | ✅ 推荐形态             |
| `logged`   | 有日志但直接继续执行             | ⚠️ 需写明判定条件       |
| `fallback` | 静默降级（无日志）               | ⚠️ 至少补一条结构化日志 |
| `silent`   | 空 catch                         | ❌ 必须处理             |

当前基线（AST 解析）：`rethrow=39 / degraded=170 / allowed=42 / fallback=13 / logged=30 / silent=27`。

- `allowed` 是**显式允许**：catch 内写了 `// audit-allow: <理由>`，表示"已判断并接受"，不列入待办但会单独计数（理由写在代码里，可 grep 审计）。
- 待办总数 218 → 178 → 160 → 135 → **110**（每批都要 `--update` 收紧基线，只允许持平或下降）。
- 已清：`routes/admin.ts` + `db` + `server/actions`（第一批）、`lib/ai/**` + `lib/schemas.ts`（第二批）、`lib/services` / `lib/import` / `lib/api/routes` / `lib/admin` / `server/actions` / 零散（第三、四批）。
- 未清：`src/app/api/**` 3 处 + 客户端 107 处。
- 历史口径（正则时代的 336）与 AST 的 329 差异：正则会把 `.catch(` 与注释里的 `catch` 计入。

## 分类进度

唯一可信来源是 `cd my-next-app && npm run audit:catches -- --list`（**在 `my-next-app/` 下执行**，
仓库根目录没有这个 script），本节数字每次收口后同步更新。
初始 218 个标记项 → 当前 **70 个 = 客户端组件 67 处 + `src/app/api/**` 服务端路由 3 处**。

已清（`rethrow` / `degraded` / `allowed` 三态之一，不再出现在 `--list`）：

| 模块                                                                                  | 处理方式                                                                                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/api/routes/admin.ts`                                                         | 鉴权失败转 401（`isAuthError`）、回滚失败保留备份、可选元信息 `audit-allow`                                               |
| `src/lib/db/**`（`index` / `seed-data`）                                              | 向量扩展缺失降级为"无 RAG"、种子逐行幂等补齐                                                                              |
| `src/server/actions/ai.ts`、`chat.ts`                                                 | 补 `log.warn` / `audit-allow`（同目录 `admin.ts` / `note.ts` / `prompts.ts` 各剩的 1 处已在后续批次清完）                 |
| `src/lib/ai/**`                                                                       | 缓存失败显式 `return`、批量插入失败 `continue`、sentinel 改显式 throw                                                     |
| `src/lib/schemas.ts`                                                                  | JSON 脏数据 `audit-allow`（不加 logger，避免进客户端 bundle）                                                             |
| `src/lib/services/**`、`src/lib/import/**`                                            | 补日志 + 显式 `return`/`continue`；2 处改复用 `safeParseJson` 让 catch 直接消失；`finally` 内与远距离回落用 `audit-allow` |
| `src/lib/api/routes/**`、`src/lib/admin/**`、`src/server/actions/**`                  | 失败补日志并保留原 4xx/5xx；请求体解析失败与启动路径用 `audit-allow`；`external.ts` 的本地 `safeJsonParse` 改复用统一实现 |
| 零散（`db` / `auth` / `practice` / `utils` / `middleware.ts` / `instrumentation.ts`） | 补日志 + 显式降级；`middleware.ts` 与 `utils/api-client.ts` 保持 `console`（Edge/客户端 bundle）                          |

剩余：**0**。全部 218 个初始标记项已归入 `rethrow`（39）、`degraded`（222）或 `allowed`（52）。

| 批次 | 范围                                                                                        | 处数 |
| ---- | ------------------------------------------------------------------------------------------- | ---- |
| 1    | `routes/admin.ts` + `db` + `server/actions`                                                 | 30   |
| 2    | `lib/ai/**` + `lib/schemas.ts`                                                              | 18   |
| 3    | `lib/services/**` + `lib/import/**`                                                         | 25   |
| 4    | `lib/api/routes` / `lib/admin` / 零散（`db`/`auth`/`utils`/`middleware`/`instrumentation`） | 25   |
| 5    | `src/app/admin/**`                                                                          | 40   |
| 6    | 业务页面与组件（练习/题目/错题本/笔记/思维导图/OCR/组件库/hooks）                           | 70   |

门禁从此是"零容忍"：`npm run audit:catches` 只要出现一个 `logged`/`fallback`/`silent` 就失败；
确需例外时写 `// audit-allow: <理由>`（必须位于 catch 块首条语句之前，且该 catch 本身已有日志或显式降级）。

## 已知语义债（catch 形态已标注，但业务语义未改）

这些是本轮逐处判断时发现的"日志有了、但行为仍然不对"的问题，**刻意没有顺手改**（超出 catch 治理范围）：

1. `pdf-import.ts` `confirmImport` 无事务：题目逐条插入成功、后续文件夹/错题本/SRS 抛错时返回 `{ success:false, importedCount:0 }`，用户重试会产生重复题目（且该路径无幂等键）。
2. `knowledge.ts` 三处 RAG 同步是 fire-and-forget：失败只留日志，无重试/补偿队列，卡片会永久检索不到。
3. `backup-service.getConfig` 解密失败返回空密码，调用方表现为 WebDAV 401，错误归因会误导排查。
4. `pdf-question-parser.ts` 的「首次失败，重试中」`log.warn` 写在重试 `try` 内部，重试发起前抛错时不会产生该日志。
5. `routes/import.ts` 失败走 200，而 `serverError` 分支走 500，失败语义不一致。
6. `routes/textbook.ts` 删除教材时把鉴权失败也算成 500（应为 401/403）。
7. `routes/auth.ts` 注册时任何异常都返回 400 且把内部 `e.message` 透给客户端（DB 故障应为 500）。
8. `middleware.ts` 每个请求都 `console.log`，日志量与开销偏大。

每批的判定流程见上；每批收口后 `npm run audit:catches -- --update` 收紧基线（只允许持平或下降），
并在 PR 描述里写明「保留为可忽略」的条数与理由。

## 客户端 catch 判定（React 组件 / hooks）

客户端没有"返回 500"这层兜底，失败必须由 UI 显式承担。按触发来源分四类：

| 场景                                                        | 判定       | 做法                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用户主动触发的写操作（保存 / 删除 / 导入 / 执行 / 重置）    | `degraded` | `toast.error("<动作>失败：" + 摘要)`，**且不改变界面状态**（不关对话框、不清空输入、不做乐观更新），catch 内 `return`                                                                                 |
| 页面首屏 / 列表数据加载失败                                 | `degraded` | catch 内三件套：`console.error` + `setLoadError(...)` + 显式 `return`，再渲染 `ErrorState`（`onRetry` 必填）。**只调 `setLoadError` 会被审计判为 `silent`**                                           |
| 轮询 / 后台静默刷新失败                                     | `allowed`  | 保留旧数据 + `console.warn` + **`// audit-allow: <理由>`**（只写日志不写标记会被判为 `logged`）；连续失败可在 UI 上降级为"数据可能过期"                                                               |
| 解析 / 兼容性回退（JSON、localStorage、URL 参数、可选字段） | `allowed`  | 回退默认值 + 至少一条日志（或显式 `return`）+ `audit-allow: <为什么这条失败可接受>`。**空 catch 只加标记仍算 `silent`**：审计器只把基础形态为 `degraded`/`logged`/`fallback` 的标记项升级为 `allowed` |

硬规则：

1. **后台操作不允许"假装成功"**——失败必须对操作者可见（toast 或 ErrorState）。
2. **写操作**失败时不要顺手改业务状态（不关对话框、不清空表单、不乐观更新）。
3. **首屏加载失败**必须 `setLoadError(...)` 让 `ErrorState` 渲染出来（此时没有旧数据可留）。
   **轮询/静默刷新失败**则**不要**设 `loadError`——那会把已经拿到的数据整页替换成错误态；
   只保留旧数据 + `console.warn` + `audit-allow`，需要时用独立的 `stale` 状态提示"数据可能已过期"。
4. 客户端日志用 `console.warn` / `console.error`（pino 不能进浏览器 bundle）；`log`/`logger` 垫片只在服务端用。
5. `// audit-allow: <理由>` 必须是 **catch 块内第一条语句之前**的注释（含与 `{` 同行）。
   写在 `if`/赋值之后不算——审计器只读块首注释，标记会被忽略、该 catch 仍按原形态（多为 `logged`）计数。
6. **safe-action 的失败不一定抛异常**：`xxxAction()` 可能返回 `{ serverError }`、`{ data: { success: false } }`、
   或参数校验失败时的 `{ validationErrors }`（此时 `serverError` 与 `data` **都可能为空**）。
   调用后必须检查：`serverError` / `!data` / `validationErrors`，任一命中即失败；
   若该 action 的返回类型**含有** `success` 字段，再检查 `data.success === false`。
   不要对所有 action 一律访问 `data.success`——有些返回 `{ count }` / `{ id }`，
   硬写会直接 TypeScript 报错。否则 `catch` 永远不进，界面会"假装成功"。

## 检查清单（提交前）

1. 新增 `catch` —— 属于三种形态中的哪一种？写进注释；
2. 忽略类必须带结构化字段（`key`、`attempt`、`sessionId` 等），否则日志无法定位；
3. 服务端不得出现 `console.*`（`lint:ci` 会拦）；
4. 新增的"跳过"分支必须有测试（否则下次重构它就变成"又吞了"）。
