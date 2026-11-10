# 工程质量机制（工程规范）

> 本文件是 `AGENTS.md`「工程规范」一节的**展开说明**（补充材料）：规则条文以 `AGENTS.md` 为正典，这里给出原因、示例和验收命令。
> 两者冲突时以 `AGENTS.md` 为准，并回改本文件。计划与进度见 [`engineering-plan.md`](./engineering-plan.md)，决策记录见 [`decisions.md`](./decisions.md)。

## 为什么需要这份文件

2026-11 的一次排查里，仓库同时存在这些问题：SRS 同步静默失败三个月、重复导入虚高掌握度、`next` 升级后失效配置无人发现、依赖 peer 死锁导致装不上。它们都不是"代码写得丑"，而是**缺少机制**：

| 历史缺陷                                                    | 机制缺失                 |
| ----------------------------------------------------------- | ------------------------ |
| `catch` 只打日志（127/336），SRS 静默失败                   | 错误路径没有分类约定     |
| 49/132 测试 mock 掉数据库，全绿但 SQL 跑不通                | 关键路径没有真实契约测试 |
| 本机 Node 22.6 / CI Node 20；`simple-mind-map` 浮动到丢类型 | 环境与版本没有固定       |
| 542 条 ESLint warning、269 处 `as any`                      | 闸门形同虚设             |
| `langchain` 零引用仍在依赖里、`@tiptap/react` 靠 hoist 侥幸 | 依赖没有定期体检         |

## 五条硬规则

### 1. 写操作先定幂等键

任何会产生持久化记录的入口（导入、批量任务、重试、支付回调、同步）**必须先回答：同一份数据执行两次会怎样。**

- 落库表加来源标识列（如 `practice_sessions.source_key`）+ 唯一索引，服务层先查后写，并用唯一索引兜并发；
- **记录写入与聚合更新必须原子提交**（同一事务）；否则"记录已提交、聚合失败"之后，重试命中幂等键直接跳过，聚合值会永久缺失这一次；
- 幂等命中时**不得再累加聚合指标**（掌握度、统计、计数），否则是静默的数据污染；
- 幂等键**优先用上游操作 ID**（`key` / `exerciseId` / 订单号 —— 跨重试不变，但每次新操作都不同）；
- **内容指纹只作为降级兜底**：同一用户完全可能把同一套题再做一遍，纯内容哈希会把第二次误判为重复并跳过。因此仅在上游确实不给 ID、且业务明确接受「同一内容视为同一操作」时才用，且必须提供人工重推入口（如油猴面板的手动推送确认框）。

### 2. `catch` 只允许三种形态

| 形态                   | 写法                                   | 例子                                           |
| ---------------------- | -------------------------------------- | ---------------------------------------------- |
| 转换重抛               | 包一层业务错误，保留 `cause`           | DB 错误 → `ImportError("导入失败", { cause })` |
| 命中明确业务错误后跳过 | 判定条件写死且可测试                   | 只跳过 `题目不存在`，其余 `throw`              |
| 真正可忽略             | 结构化日志 + 计数 + 注释说明为何可忽略 | 埋点上报失败                                   |

禁止：`catch (e) { console.warn(e) }` 然后继续 —— 这是历史上所有静默失效的共同形态。

### 3. 关键路径必须有真实依赖的集成测试

"关键路径" = 数据库写入、鉴权、导入、结算、支付、迁移。

- 用真实 SQLite + 真实迁移（参考 `src/lib/services/__tests__/import-idempotency.test.ts`、`srs-sync.test.ts`）；
- `afterAll` 先 `closeDrizzle()` 再删临时库；
- **禁止**在这些路径上用 mock 数据库充当验证；
- 纯计算/纯展示逻辑仍然优先单测（快）。

### 4. 闸门绿了才合，warning 不许增长

CI 四项必须全绿：`lint`（errors=0 且 warning 不超基线）/ `typecheck` / `vitest` / `next build`；
外加 `npm audit --audit-level=high`。

- ESLint warning 用**按规则的棘轮**：`.eslint-baseline.json` 记录每条规则的计数，任何一条规则增加即失败（`--max-warnings N` 只看总数，可用「新增 A 规则、删掉 B 规则」绕过）；总数下降时应同 PR 执行 `npm run lint:baseline` 收紧基线；
- `as any` 新增需在 PR 里说明理由；
- 新增依赖必须能回答"谁在用它"——**代码 `import`、`npm script`、配置文件（eslint/postcss/playwright）都算**；三者都找不到才删（例如 `tsc` 只被 `typecheck` 脚本调用）；

### 5. 版本与环境的唯一事实来源

- `engines`（`>=20.19.0 <21`）+ `.nvmrc` + `preinstall` 版本守卫固定 Node 版本：用 Node 22 安装会直接报错退出（不用 `engine-strict`，因为 `unpdf` 等依赖自己声明 `>=22`，严格模式会让 `npm ci` 失败）；
- 核心依赖（`next`、DB 驱动、编辑器、ORM）写死版本，不用 `^`；
- 升级单独 PR：跑真实迁移 + 构建 + 全量测试，不与功能混在一起；
- 依赖副本去重优先用 `"overrides": { "pkg": "$pkg" }`（跟随直接依赖），不要写死版本号（会 `EOVERRIDE`）。

## 本机环境（CentOS 7 / glibc 2.17）

CI 用 Node 20 + ubuntu；本机需三件事才能对齐（详见 `/public/home/cjb/local/src/README-glibc217.md`）：

```bash
# 1) Node 20（micromamba 环境，免 root）。注意：只打印版本不会切换环境，
#    后续 npm 命令要用 micromamba run，或把 env 的 bin 前置到 PATH。
micromamba run -n node20 node -v
# 或：export PATH=/public/home/cjb/micromamba/envs/node20/bin:$PATH

# 2) vitest 需要 require(ESM)：加上该 flag（本机 20.20 默认未开）
export NODE_OPTIONS=--experimental-require-module

# 3) @libsql 预编译要求 GLIBC_2.18：补丁 + 预加载 shim
python3 /public/home/cjb/local/bin/glibc217patch.py \
  node_modules/@libsql/linux-x64-gnu/index.node
export LD_PRELOAD=/public/home/cjb/local/lib/libcxa218.so
```

`next build` 本机跑不了（`@next/swc-linux-x64-gnu` 要求 GLIBC_2.27），构建校验一律交给 CI。

## 提交前自检（30 秒版）

```bash
npm run typecheck
npm run lint:ci
npm run test:run
```

（分行执行，不要用 `&&` 串联 —— `AGENTS.md` 的终端规范要求，部分代理执行器对链式命令不可靠。）

再加三问：

1. 这个改动重复执行两次会怎样？
2. 失败时用户/日志能看出原因吗？
3. 我新增/删除的依赖，哪个文件在用？

## 与 AI 协作的额外约定

- 让 agent 改代码前，先让它读本文件和相关 `AGENTS.md`；
- agent 报"已完成"时，要求附**命令输出**而不是结论；
- 同一个 bug 修第二次时，先补测试再修（否则会修第三次）。
