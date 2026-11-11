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

当前基线（AST 解析）：`rethrow=39 / degraded=101 / allowed=30 / fallback=33 / logged=58 / silent=69`。

- `allowed` 是**显式允许**：catch 内写了 `// audit-allow: <理由>`，表示"已判断并接受"，不列入待办但会单独计数（理由写在代码里，可 grep 审计）。
- 待办总数 218 → 178 → **160**（每批都要 `--update` 收紧基线，只允许持平或下降）。
- 已清：`routes/admin.ts` + `db` + `server/actions`（第一批）、`lib/ai/**` + `lib/schemas.ts`（第二批）。
- 未清：`lib/services` / `lib/import` / `lib/api/routes` 其余文件（约 48 处）、客户端 112 处。
- 历史口径（正则时代的 336）与 AST 的 329 差异：正则会把 `.catch(` 与注释里的 `catch` 计入。

## 分类进度

唯一可信来源是 `cd my-next-app && npm run audit:catches -- --list`（**在 `my-next-app/` 下执行**，
仓库根目录没有这个 script），本节数字每次收口后同步更新。
初始 218 个标记项 → 当前 **160 个**。

已清（`rethrow` / `degraded` / `allowed` 三态之一，不再出现在 `--list`）：

| 模块 | 处理方式 |
| --- | --- |
| `src/lib/api/routes/admin.ts`（除第 392 行 1 处） | 鉴权失败转 401（`isAuthError`）、回滚失败保留备份、可选元信息 `audit-allow` |
| `src/lib/db/**`（`index` / `seed-data`） | 向量扩展缺失降级为"无 RAG"、种子逐行幂等补齐 |
| `src/server/actions/ai.ts`、`chat.ts` | 补 `log.warn` / `audit-allow`（`admin.ts` / `note.ts` / `prompts.ts` 仍各剩 1 处） |
| `src/lib/ai/**` | 缓存失败显式 `return`、批量插入失败 `continue`、sentinel 改显式 throw |
| `src/lib/schemas.ts` | JSON 脏数据 `audit-allow`（不加 logger，避免进客户端 bundle） |

剩余（按目录，共 160，数字取自审计输出）：

| 模块 | 数量 | 状态 |
| --- | --- | --- |
| 客户端 `src/app/admin/**` | 40 | 待处理（后台失败必须可见） |
| 客户端业务页面与组件 | 70 | 待处理（`app/questions` 8、`components/history` 7、`app/wrong-book` 6、`app/knowledge` 5、`app/practice` 4、`components/textbooks` 4、`hooks/chat` 3、`components/editor` 3、`app/notes` 3、`app/mindmap` 3、`app/api` 3、其余 21） |
| 服务端 `src/lib/services/**` | 21 | 下一批 |
| 服务端 `src/lib/api/routes/**` | 9 | 待处理（含 `admin.ts` 1 处） |
| 服务端 `src/lib/import/**` | 4 | 待处理 |
| 服务端 `src/lib/admin/**` | 4 | 待处理 |
| 服务端 `src/server/actions/**` | 3 | 待处理（`admin.ts` / `note.ts` / `prompts.ts`） |
| 服务端零散 | 9 | 待处理（`utils` 2 / `practice` 2 / `db` 2 / `auth` 1 / `middleware.ts` 1 / `instrumentation.ts` 1） |
| 合计 | **160** | |

每批的判定流程见上；每批收口后 `npm run audit:catches -- --update` 收紧基线（只允许持平或下降），
并在 PR 描述里写明「保留为可忽略」的条数与理由。

## 检查清单（提交前）

1. 新增 `catch` —— 属于三种形态中的哪一种？写进注释；
2. 忽略类必须带结构化字段（`key`、`attempt`、`sessionId` 等），否则日志无法定位；
3. 服务端不得出现 `console.*`（`lint:ci` 会拦）；
4. 新增的"跳过"分支必须有测试（否则下次重构它就变成"又吞了"）。
