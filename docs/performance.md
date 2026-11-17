# 性能治理计划（可执行版）

> **用法**：按 §1 的任务卡逐张执行，每张卡自包含（落点 / 改法 / 验收 / 回滚），不依赖阅读其它章节。
> **配套证据**：`docs/mobile-performance.md`（症状级修复 P0/P1/P2 + 服务端/渲染层审计 + 待验证项）。
> **本文件不重复证据**，只给判据与工单。

---

## 0. 执行约定（先读这一节，30 秒）

- **工作区**：`~/ai-leaming-wt-sandbox`（分支 `wip/sandbox`，基线 origin/main 90def0a）。**不要动** `~/ai-leaming` 主检出（那里有 recall 拆分的未提交改动）。
- **路径口径**：文内以 `src/` 开头的路径均相对 `my-next-app/`；以 `my-next-app/` 开头的为仓库内完整路径。
- **每批次一个 PR**，提交信息中文 `<type>: <简述>`；批次内任务可合一个 PR。
- **合入前四闸**：`npm run lint:ci` / `npm run typecheck` / `npm run test:run` / `next build`（本机 glibc 2.17 跑不了 build，走 CI）+ `npm audit --audit-level=high`。
- **禁止**新增 `eslint-disable`；禁止为了跑绿灯放宽既有基线（`.eslint-baseline.json`）。
- **不破坏护栏**：`npx playwright test --project=layout-guard` 61 条在任何批次都必须绿。
- **每个 PR 附"改前/改后"数字**（来自 T-01~T-03 的采集），没有数字的优化不接受。
- 完成定义：任务卡勾选 + 验收命令输出贴进 PR + 基线文件（`docs/performance-baseline.md`）更新。

---

## 1. 任务卡索引

| ID   | 任务                                       | 批次   | 依赖           | 粗估      | 验收方式                                   |
| ---- | ------------------------------------------ | ------ | -------------- | --------- | ------------------------------------------ |
| T-01 | Web Vitals 入库（INP/LCP/CLS/TTFB/FCP）    | 0 观测 | —              | 1.5h      | 真机访问后表里有行                         |
| T-02 | 事件循环延迟监控                           | 0 观测 | —              | 0.5h      | 人为重活触发 `event loop lag` 告警         |
| T-03 | 慢请求日志收敛（middleware）               | 0 观测 | —              | 1h        | `duration>300ms` 有 warn；无重复 console   |
| T-04 | 基线台账（首版数字）                       | 0 观测 | T-01~03        | 1h        | `docs/performance-baseline.md` 有 4 个数字 |
| T-05 | 路由 JS 体积预算                           | 1 预算 | —              | 1.5h      | 故意留死 import 报红                       |
| T-06 | `public/` 大文件预算                       | 1 预算 | T-05（同脚本） | 0.5h      | 631KB 死图报红                             |
| T-07 | CI 增 `perf-budget` job                    | 1 预算 | T-05/06        | 0.5h      | CI 出现该 job 且绿                         |
| T-08 | `ui-guard` 去 `continue-on-error`          | 2 规则 | —              | 1h        | 护栏失败能挡住 merge                       |
| T-09 | `perf-guard`（LoAF 长动画帧）              | 2 规则 | —              | 2h        | 注入 300ms 阻塞会红                        |
| T-10 | ESLint 性能禁止清单（warn→棘轮）           | 2 规则 | —              | 2.5h      | 新增 `transition-all` 立即 warn            |
| T-11 | API p95 基准                               | 2 规则 | —              | 1.5h      | p95 环比 +20% 报红                         |
| T-12 | ADR：滚动模型归一                          | 3 结构 | T-08           | 0.5d 评估 | ADR 落 `docs/decisions.md`                 |
| T-13 | ADR：framer 分层（LazyMotion）             | 3 结构 | T-09           | 0.5d      | 同上                                       |
| T-14 | ADR：长列表虚拟化                          | 3 结构 | T-05           | 0.5d      | 同上                                       |
| T-15 | ADR：重活出进程                            | 3 结构 | T-02           | 1d        | 同上                                       |
| T-16 | ADR：React Compiler 评估                   | 3 结构 | —              | 0.5d      | 同上                                       |
| T-17 | ADR：服务层缓存 + SW 策略                  | 3 结构 | T-01           | 0.5d      | 同上                                       |
| X-1  | 根布局三次 flag 并行（10min，可搭任意 PR） | 顺手   | —              | 10min     | `/dashboard` TTFB                          |
| X-2  | `practice_logs(session_id)` 补索引         | 顺手   | —              | 30min     | `EXPLAIN` 由 SCAN 变 SEARCH                |

批次 0/1/2 是**工程动作**，可直接执行；批次 3 是**决策动作**，产出 ADR，不动代码。
X-1/X-2 零风险，搭在批次 0 的 PR 里一起提。

---

## 2. 判据（所有任务卡的验收都回到这张表）

| 指标             | 目标                                                                      | 采集 |
| ---------------- | ------------------------------------------------------------------------- | ---- |
| INP p75          | < 200ms                                                                   | T-01 |
| LCP p75          | < 2.5s                                                                    | T-01 |
| CLS p75          | < 0.1                                                                     | T-01 |
| JS 体积（gz）    | 按路由 ≤180KB；**当前 Turbopack 构建只能取全站总量，按总量环比 +5% 即红** | T-05 |
| `public/` 单文件 | > 100KB 需进白名单                                                        | T-06 |
| 事件循环延迟 p99 | < 50ms                                                                    | T-02 |
| 交互后长动画帧   | 无 > 200ms                                                                | T-09 |
| API p95          | 环比 +20% 即红                                                            | T-11 |

**不用 Lighthouse 分数当判据**：模拟环境与真实"跟手"正交。

---

## 3. 批次 0：观测（先有数字）

### T-01 Web Vitals 入库 ｜1.5h｜无依赖

- **目标**：拿到按路由分组的 INP/LCP/CLS/TTFB/FCP，p75 可算。
- **落点**
  - 新增 `my-next-app/src/app/web-vitals.tsx`（`"use client"`）：
    ```tsx
    "use client";
    import { useReportWebVitals } from "next/web-vitals";
    export function WebVitals() {
      useReportWebVitals((m) => {
        navigator.sendBeacon(
          "/api/vitals",
          JSON.stringify({
            name: m.name,
            value: m.value,
            rating: (m as any).rating,
            route: location.pathname,
          }),
        );
      });
      return null;
    }
    ```
    挂在 `src/app/layout.tsx` 的 `<body>` 内（`Toaster` 旁）。
  - 新增 `src/lib/api/routes/vitals.ts`：`POST /api/vitals`，zod 校验后写库；**不需要鉴权**（匿名指标），但写库失败必须 `return c.body(null, 204)` 静默。
  - `src/lib/db/drizzle-schema.ts` 增表 `web_vitals`：`id / route / name / value / rating / created_at`，索引 `(route, name, created_at)`。
  - 生成迁移（`npx drizzle-kit generate`），并在 `src/app/api/[[...route]]/route.ts` 挂 `app.route("/vitals", vitalsRoute)`。
- **改法约束**：单用户场景全量写，不采样、不批量；不引入第三方分析服务。
- **验收**
  1. `npm run db:migrate` 成功；
  2. `curl -X POST -d '{"name":"INP","value":120,"route":"/dashboard"}' -H 'content-type: application/json' localhost:3000/api/vitals` 返回 2xx；
  3. 真机用 10 分钟后 `SELECT route,name,count(*) FROM web_vitals GROUP BY 1,2` 有数据；
  4. 能跑出 `SELECT route, name, value FROM web_vitals WHERE name='INP' ORDER BY value DESC LIMIT 10`。
- **风险/回滚**：新增表与路由，回滚即删路由挂载；不影响既有页面。

### T-02 事件循环延迟监控 ｜0.5h｜无依赖

- **目标**：抓住"偶发整页卡死"（cron/OCR/PDF/备份在同进程阻塞）。
- **落点**：`my-next-app/src/instrumentation.ts`（已存在，在 `NEXT_RUNTIME === "nodejs"` 分支内、`initScheduler()` 之后追加）：
  ```ts
  const { monitorEventLoopDelay } = await import("node:perf_hooks");
  const h = monitorEventLoopDelay({ resolution: 20 });
  h.enable();
  setInterval(() => {
    const p99 = h.percentile(99) / 1e6;
    const max = h.max / 1e6;
    // p99 会平均掉单次卡顿，必须同时看 max
    if (p99 > 50 || max > 200) log.warn("event loop lag", { p99, max });
    h.reset();
  }, 30_000).unref();
  ```
  `log` 用文件内已有的 `@/lib/logger` 导入，不新增依赖。
- **验收**：故意触发一次重活（上传一份多页 PDF 走 OCR，或手动 `VACUUM INTO`），日志必须出现 `event loop lag` 且 `p99` 量级合理（>50ms）。**没抓到就说明埋点位置不对，不要继续**。
- **风险/回滚**：只加日志，`unref()` 保证不阻退出。

### T-03 慢请求日志收敛 ｜1h｜无依赖

- **目标**：每导航的服务端耗时可见；去掉每请求 3–4 条 `console.log`。
- **落点**：`my-next-app/src/middleware.ts`
  - 现有 `:45/:49/:54` 三条 `console.log` 与末尾 `:92-106` 的结构化日志**合并成一条**，`log.debug` 级别；
  - `duration > 300` 时打 `log.warn`；
  - matcher（`:114`）追加静态后缀排除：`sw\.js|webmanifest|woff2?|svg|webp|ico`（**不要**排除 `?_rsc=`，那正是要量的）。
- **验收**：`curl -s -o /dev/null -w '%{time_total}\n' localhost:3000/dashboard` ×10，日志里每次一条且带 `duration`；`/sw.js` 请求不再进 middleware。
- **风险**：matcher 收窄需确认未误删需鉴权的路径——只在后缀白名单内收窄。

### T-04 基线台账 ｜1h｜依赖 T-01~03

- **目标**：把首版数字写死，后续每个 PR 对比它。
- **落点**：新增 `docs/performance-baseline.md`，表格列：`日期 / 路由 / INP p75 / LCP p75 / CLS / First Load JS / 备注`。首版至少覆盖 `/dashboard`、`/wrong-book`、`/recall`、`/knowledge`、`/practice`。
- **验收**：表内无空格（测不到的行标注"未测 + 原因"）；PR 描述里贴这张表。
- **风险**：无代码改动。

### 顺手项（搭在批次 0 的 PR 里）

- **X-1**：`src/app/layout.tsx:69-74` 三次 `getGlobalFeatureFlag` 串行 await → `Promise.all`。验收：用**客户端** TTFB 对比（`curl -w '%{time_starttransfer}'` 或浏览器 Network 面板）—— 不能用中间件日志的 `duration`，那两次 DB 读取发生在中间件返回之后的 RSC 渲染阶段。
- **X-2**：新增迁移 `CREATE INDEX idx_practice_logs_session ON practice_logs(session_id);`，并在 `drizzle-schema.ts` 的 `practice_logs` 定义中补 `idx_session`。验收：`EXPLAIN QUERY PLAN SELECT * FROM practice_logs WHERE session_id='x'` 由 `SCAN` 变 `SEARCH ... USING INDEX`。

---

## 4. 批次 1：预算门禁（让回归进不了主干）

### T-05 路由 JS 体积预算 ｜1.5h｜无依赖

- **目标**：任一页面 first-load JS 环比 +5% 或超阈值即红。
- **落点**：新增 `my-next-app/scripts/check-perf-budget.mjs`
  - 读 `.next/app-build-manifest.json` → 每路由的 `pages` + `layout` chunk 列表 → 去重后 sum gzip 字节（用 `zlib.gzipSync` 现场压）；
  - 与 `perf-baseline.json`（仓库根或 `my-next-app/`）比较：`> 阈值` 或 `> prev * 1.05` → 打印路由/增量 → `exit 1`；
  - `--update` 才写基线（交互照 `scripts/check-lint-ratchet.cjs`）。
  - `package.json` 增 `perf:budget` / `perf:baseline`。
- **验收**：在 `src/app/knowledge/page.tsx:21` 保留死 import 跑一次 → 报红并指明 `/knowledge` 的增量（记录该增量到 PR）；删掉后转绿。**红灯必须真的红过**。
- **风险**：manifest 结构随 Next 版本变；脚本内做字段缺失兜底（缺就跳过该路由并 warn，不静默通过）。

### T-06 `public/` 大文件预算 ｜0.5h｜依赖 T-05 同脚本

- **落点**：`check-perf-budget.mjs` 第二段：遍历 `public/**`，单文件 > 100KB 且不在白名单 → 红。白名单初始只放 `fonts/*.woff2`。
- **验收**：当前应抓出 `assets/login-bg.png`(620KB)、`assets/og-image.png`(552KB)、`assets/empty-state.png`(164KB)、`logo.png`/`icon-*.png`(各 252KB)。**处理决定由人拍**：删死文件（`src` 内零引用）或进白名单；脚本只负责报。
- **风险**：误报（OG 图是社交分享必需）→ 进白名单即可。

### T-07 CI 增 `perf-budget` job ｜0.5h｜依赖 T-05/06

- **落点**：`.github/workflows/` 内新增 job 或复用现有 `build` job 的产物（**不要二次构建**）：`needs: build` → 下载 build artifact → `npm run perf:budget`。
- **验收**：CI 出现该 job 且绿；故意加 10KB 依赖能红。
- **风险**：artifact 体积/路径；若 build 未上传 artifact，先在 build job 里加 `actions/upload-artifact`。

---

## 5. 批次 2：规则化（把文档变成红灯）

### T-08 `ui-guard` 转阻断 ｜1h｜无依赖

- **目标**：护栏失败挡住合并，而不是只报告。
- **落点**：`.github/workflows/ui-guard.yml:36` → `continue-on-error: false`；先跑一次看失败规模，失败的存量用 `layout-helpers.ts` 的白名单机制豁免（每条例外写理由 + 截止条件）。
- **顺带**：统一文档数字 —— `ui-guard.yml:72`(27) / `docs/ui-system.md:253`(46) / `ui-system.md:191`(61) → 全部改 61。
- **验收**：故意改坏一条（如给某页加 `w-[500px]`）→ CI 红；改回 → 绿。
- **风险**：存量失败可能很多；若 > 10 条，先只对 `/dashboard`、`/wrong-book`、`/recall` 三条路由转阻断，其余留白名单。

### T-09 `perf-guard`（LoAF）｜2h｜无依赖

- **落点**：新增 `my-next-app/tests/visual/perf-guard.spec.ts`，复用 layout-guard 的登录 fixture；三条路由 `/dashboard`、`/wrong-book`、`/recall`：
  - 注入 `PerformanceObserver({ type: "long-animation-frame", buffered: true })`；
  - 导航后 3s 内**不得出现 > 200ms 的 LoAF**；
  - 指标写 `testInfo.attach` JSON，便于跨提交对比。
  - `playwright.config.ts` 增 `perf-guard` project（`testDir: "./tests/visual"`，桌面 Chrome 即可，先不做移动设备模拟）。
- **验收**：在页面里临时加一个 `while (Date.now() - t < 300) {}` 的死循环 → 用例红；移除 → 绿。
- **风险**：CI 机器抖动造成假红 → 阈值先用 300ms 观察两周，再收紧到 200ms；不允许用 `retries` 掩盖。

### T-10 ESLint 性能禁止清单 ｜2.5h｜无依赖

- **落点**：`my-next-app/eslint.config.mjs` 增 `no-restricted-syntax`（先 `warn`）：

  | selector（示意）                                     | 禁止项                           |
  | ---------------------------------------------------- | -------------------------------- |
  | className 含 `transition-all`                        | 用具体属性过渡                   |
  | className 同时含 `backdrop-blur` 与 `fixed`/`sticky` | 固定/滚动容器不用 blur           |
  | className 含 `xl:` / `2xl:`                          | 只用 `sm/md/lg`                  |
  | `useMediaQuery(` / `window.innerWidth`               | 禁 JS 判宽（豁免点写注释白名单） |
  | `overflow-x-auto` 在页面根容器                       | 表格改卡片                       |
  | `components/ui/*` 内 `from "framer-motion"`          | 基础组件不做动效                 |

- **验收**：新增一处 `transition-all` 立即 warn；`npm run lint:ci` 不因新增规则变红（基线棘轮吸收存量）；全仓 `eslint-disable` 数量不增加。
- **风险**：正则型 selector 易误伤 → 先跑 `npm run lint` 全量看 warn 分布，存量 > 50 条则分批启用。

### T-11 API p95 基准 ｜1.5h｜无依赖

- **落点**：新增 `scripts/bench-api.mjs`（autocannon）：对真实 SQLite 副本打 5 个高频端点（`/api/history?page=1`、`/api/wrong-book`、`/api/knowledge/cards`、`/api/practice/session`、`/api/admin/system`），每端点 10s / 10 连接，记录 p95 到 `perf-baseline.json`，环比 +20% exit 1。
- **验收**：故意给某查询去掉索引 → p95 上升并报红（用 X-2 的索引做反证：删掉索引再跑）。
- **风险**：本地/CI 机器性能差异 → 基准只在 CI 固定 runner 上跑，且只做**环比**不做绝对值门槛。

---

## 6. 批次 3：结构性 ADR（只产出决策，不改代码）

每张卡产出 `docs/decisions.md` 一条 ADR，格式照现有条目：`背景 / 方案 / 取舍 / 回滚 / 验收`。**不在本批次动代码**。

| ID   | 议题                                                                                    | 必须回答的问题                                                                                                                       |
| ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| T-12 | 滚动模型归一（`body` 滚动 + `sticky` 导航，替掉 `body{overflow:hidden}` + `main` 内滚） | 15 处 `100vh` 如何换 `dvh`；键盘弹出行为；`overscroll-behavior` 该放哪；61 条护栏如何兜；回归范围多大                                |
| T-13 | framer 分层                                                                             | `LazyMotion` + `m` 的改造范围（24 文件）；基础 `Button` 去 `motion` 后 302 调用点的按压态如何用 CSS 承接；是否保留 `AnimatePresence` |
| T-14 | 长列表虚拟化                                                                            | 阈值（>30 项）；`/knowledge` 100 卡是否改分页 30；`layoutId` 共享布局动画是否放弃；`content-visibility` 能否替代虚拟化               |
| T-15 | 重活出进程                                                                              | cron/OCR/PDF/备份移到 `worker_threads` 还是独立容器；SQLite 单写者约束如何保持；部署改动面（`docker-compose`）                       |
| T-16 | React Compiler                                                                          | 开启后构建时间增幅；与现有手写 memo 的冲突；误优化如何定位；是否只需对部分目录开启                                                   |
| T-17 | 缓存策略                                                                                | `unstable_cache` 用在哪些读；SW 的文档/RSC 改 SWR + 3s 超时后离线行为；`revalidate` 三处是否真失效（需 build 的 `○/ƒ` 标记）         |

---

## 7. 不做

1. 不把 Lighthouse 分数当 KPI。
2. 批次 0 没跑完之前，不按推断排序 `mobile-performance.md` 的 P0/P1。
3. 不给组件批量加 `memo`（要么 T-16，要么量过再改）。
4. 不滥用 `will-change` / `translateZ(0)`。
5. 不为通过新门禁而放宽既有护栏或新增 `eslint-disable`。
6. 不在本计划内改主题系统（`[data-theme]` 死选择器）、不重做导航信息架构。

---

## 8. 尚未确认的事项（不要当结论执行）

需 `next build` 产物或真机才能定，结论前不要据此改代码：

1. SW precache 是否包含 `public/` 的 1.3MB 死图（读构建产物 `public/sw.js` 的 `__SW_MANIFEST`）。
2. `/knowledge` 死 import 的具体体积增量（`next build` 的 route 表）。
3. `revalidate=60` 三处是否被 `cookies()` 强制动态化而失效（build 输出的 `○/ƒ`）。
4. 各页 INP/LoAF 实测值（T-01/T-04 完成后即有）。

---

## 9. 与症状修复的关系

`docs/mobile-performance.md` 的 P0（tap 反馈 / 底栏 blur / template spring / SW 超时）**不阻塞本计划**，但排序建议改成：

1. 先做批次 0（4h）→ 有 INP 数字；
2. 再按数字决定 P0 里先上哪两条（预期 tap 反馈与 SW 超时性价比最高）；
3. P1 与 X-1..X-10 按同一份数字排。

理由：P0 四个候选都是"感知层"，改前改后的差异只能靠真机体感判断；有了 T-01 的数字，同一个 PR 才能附上"改前/改后"。

---

## 10. 执行记录（2026-11-17，分支 `wip/sandbox`）

> 状态口径：**完成**=改动 + 可在本机验证的证据齐；**待环境**=代码已就位但验证需要 CI/真机；
> **待拍板**=按计划本批只出决策。

| ID        | 状态                 | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-01      | 完成                 | 新增 `src/app/web-vitals.tsx`、`src/lib/api/routes/vitals.ts`、`src/lib/services/web-vitals.ts`、表 `web_vitals` + 迁移 `0015`；`web-vitals.test.ts` **7/7 通过**（含路由 204/400 契约、CLS×1000、p75 取点）；迁移后库内 `web_vitals` 表与 `idx_web_vitals_route_name` 存在，`__drizzle_migrations` = 17 与 journal 17 条一致                                                                                                                                                             |
| T-02      | 待环境               | `src/instrumentation.ts` 已加 `monitorEventLoopDelay`（30s 一次，p99>50ms 打 warn，`unref()`）；"人为触发重活看告警"需生产进程，本机无 next 服务                                                                                                                                                                                                                                                                                                                                          |
| T-03      | 完成（本机静态验证） | `src/middleware.ts` 重写：4 处日志收口为 `finish()` 一条，`durationMs` + `authError` 字段，matcher 排除静态后缀（保留 `?_rsc=`）；`tsc` 与 `audit:catches` 通过                                                                                                                                                                                                                                                                                                                           |
| T-04      | 待环境               | `docs/performance-baseline.md` 已建（含采集口径 + 取值 SQL + 事件循环/API 两栏）；INP/LCP/CLS 需真机 10 分钟采集后回填                                                                                                                                                                                                                                                                                                                                                                    |
| T-05      | 完成（口径已修正）   | `scripts/check-perf-budget.mjs` + `perf-baseline.json`。**首次上线发现 Next 16 + Turbopack 既不产出 `app-build-manifest.json`、终端也不再打印 First Load JS**，原实现因此在 CI 里空转（只打「未校验」就通过）。改为三级取数后实测生效：CI run 44007754824 输出 `JS 体积（gzip，全站总量）：__total__ 2418.2KB（123 个文件）`，并明确写出已退化为总量口径；基线按该值写入（`mode: total`）。fixture 验证：route 模式 200KB chunk → `✗ 234.5KB > 180KB`（rc=1）；总量模式环比 +57.5% → rc=1 |
| T-06      | 完成                 | 真实 `public/` 检查：`data/keypoints.json 156.3KB` 首轮报红（后按"JSON 会被 gzip"进白名单）；删除 3 个零引用死图（`login-bg.png` 631KB、`og-image.png` 565KB、`empty-state.png` 167KB）；`logo.png`/`icons/*` 进白名单并写明待优化原因                                                                                                                                                                                                                                                    |
| T-07      | 完成                 | `ci.yml` 的 `build` job 追加 `npm run perf:budget`（复用同一份 `.next`，不二次构建）。CI run 44007754824 该步骤 `success`，日志内含体积表与白名单明细 —— 门禁已在主干生效                                                                                                                                                                                                                                                                                                                 |
| T-08      | 完成                 | `ui-guard.yml` 改 `continue-on-error: false`，依据是 main 上 run **43935305511** 的「运行布局护栏」步骤 `success`；步骤名与 `docs/ui-system.md` 的数字统一为 61 条                                                                                                                                                                                                                                                                                                                        |
| T-09      | 完成（本机可列举）   | 新增 `tests/visual/perf-guard.spec.ts` 4 条；`playwright.config.ts` 用 `testMatch` 拆分两个 project，`--list` 结果：layout-guard **61**、perf-guard **4**                                                                                                                                                                                                                                                                                                                                 |
| T-10      | 完成                 | `eslint.config.mjs` 增 6 条：`transition-all`、`backdrop-blur`+fixed/sticky、`xl:/2xl:`、`useMediaQuery(`、`window.innerWidth`、`components/ui/*` 禁 framer 导入；存量在案 80+2 条 warn，基线 93 → **89**（修 3 处 + 删死 import 后收紧）                                                                                                                                                                                                                                                 |
| T-11      | 完成                 | `scripts/bench-api.mjs`（零依赖，内置 fetch 并发）；fixture：基线 p95 12–33ms → 人为 80ms 后 `history.list 33ms→147ms (+346%)` 等 5 条回归，rc=1                                                                                                                                                                                                                                                                                                                                          |
| T-12~T-17 | 待拍板               | `docs/decisions.md` 新增一节「性能治理批次 3」，6 条 ADR 每条给出建议方案 + 理由 + 代价 + 回滚，状态标 **建议（待拍板）**                                                                                                                                                                                                                                                                                                                                                                 |
| X-1       | 完成                 | `layout.tsx` 三个 flag 改 `Promise.all`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| X-2       | 完成                 | 迁移 `0016` + schema `idx_session`；`EXPLAIN QUERY PLAN` 由 `SCAN` 变 `SEARCH practice_logs USING INDEX idx_practice_logs_session (session_id=?)`                                                                                                                                                                                                                                                                                                                                         |

四闸结果（本机，已合并 origin/main #176/#177 后复测）：`tsc --noEmit` rc=0；`lint:ci` total=89 通过；`audit:catches` 0 新增标记；`vitest run` **1367 用例全绿**（合并前 1356）。
`next build` 本机无法执行（glibc 2.17 + swc），由 CI 承担 —— 这也是 T-07 标"待环境"的原因。
