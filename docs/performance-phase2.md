# 性能第二阶段：减量（PWA 原生级体感）

> 前置：`docs/performance.md`（批次 0–2：观测 / 预算 / 门禁，已落地）与
> `docs/mobile-performance.md`（症状证据 + P0 已修）。本文只做**减量**：
> 让"二次启动 + 路由切换 + 交互"接近安装应用的体感。
> 台账：`docs/performance-baseline.md`（改前/改后数字写这里）。

## 0. 定位：守门已过，减量未开始

第一阶段解决的是"回归进不来"（体积预算、loAF 护栏、ESLint 禁止清单、ui-guard 转阻断）。
但它只防变差，不产生变快。当前能拿到的硬数字只有两个：

- 全站 JS gzip **2418.2KB / 123 文件**（CI run 44007754824，`perf:budget` 全量口径）；
- `public/` 预缓存已从 986KB 收到 **330KB**（icons 268 + fonts 62，PR #194）。

**没有任何真机数字**。INP/LCP 埋点（T-01）已上线但表里是空的 —— 所以本阶段的
第一张卡不是改代码，是把数字采回来。

## 1. 判据（全部可测，全部要改前/改后两行）

| 指标                 | 目标             | 采集方式                                          | 现状         |
| -------------------- | ---------------- | ------------------------------------------------- | ------------ |
| INP p75              | ≤ 200ms          | `web_vitals` 表，按路由                           | 无数据       |
| LCP p75              | ≤ 2.5s           | 同上                                              | 无数据       |
| **二次启动到可交互** | < 1s             | 真机 DevTools → Performance（冷启一次、热启一次） | 无数据       |
| **导航点击 → 首帧**  | < 100ms          | Event Timing（perf-guard 已能抓）                 | 无数据       |
| 长动画帧             | 无 > 200ms       | `perf-guard`（观察期 300ms，两周后收 200ms）      | 已跑，阈值宽 |
| 全站 JS（gzip）      | 每轮只降不升     | `npm run perf:budget`                             | 2418.2KB     |
| 移动端水合组件数     | 不含桌面专属组件 | 手工核对 + bundle 分析                            | 未测         |

## 2. 任务卡索引

| ID    | 任务                                                            | 组       | 依赖  | 粗估       | 验收                                 |
| ----- | --------------------------------------------------------------- | -------- | ----- | ---------- | ------------------------------------ |
| P2-01 | 真机基线采集（INP/LCP/二次启动/导航）                           | A 数字   | —     | 1h（人工） | 台账三行有数                         |
| P2-02 | 启动与导航耗时埋点（首屏可交互 + 点击→首帧）                    | A 数字   | —     | 2h         | 表里能按路由查 launch/nav            |
| P2-03 | 文档/RSC 改 `StaleWhileRevalidate` + `cacheOnNavigation`        | B 缓存   | P2-01 | 2h         | 热启动 `responseStart ≈ 0`           |
| P2-04 | 资源缓存矩阵复核（按类型对表）                                  | B 缓存   | —     | 1h         | 与 §3B 表格逐行一致                  |
| P2-05 | 移动端不水合桌面侧栏                                            | C 水合   | P2-01 | 3–4h       | 手机端 `AppSidebar` 不在 JS 里       |
| P2-06 | framer 分层：`LazyMotion` + `m`                                 | C 水合   | P2-05 | 4–6h       | UI 动效不变，底包减 ~29KB            |
| P2-07 | 基础组件去 `motion`（Button 等）                                | C 水合   | P2-06 | 2h         | 302 调用点视觉不变                   |
| P2-08 | 长列表：虚拟化 + 去 `layoutId`                                  | D 渲染   | P2-01 | 4–6h       | `/knowledge` 100 卡首屏可交互        |
| P2-09 | 存量 `transition-all`/`backdrop-blur` 清零（80 → 0）            | D 渲染   | —     | 3–4h       | lint 基线降到 0                      |
| P2-10 | `/ocr` 的 O(n²) base64 → `FormData` 直传                        | E 主线程 | —     | 1h         | 3MB 图不再冻主线程                   |
| P2-11 | 聊天流式节流 + `MessageList` memo                               | E 主线程 | —     | 1.5h       | 50 条消息流式不掉帧                  |
| P2-12 | 题库导入 JSON 解析进 Worker                                     | E 主线程 | —     | 2h         | 解析期间主线程无长任务               |
| P2-13 | 单连接长事务收口（SRS 同步/PDF 导入批量写）                     | F 服务端 | —     | 4–6h       | 并发下 p95 不跳秒级                  |
| P2-14 | 抽题去 `ORDER BY RANDOM()`                                      | F 服务端 | P2-01 | 2–3h       | 2 万题时 `/practice/session` < 100ms |
| P2-15 | 剩余缺索引（`session_reviews`、`practice_logs` 复合、教材章节） | F 服务端 | —     | 1h         | `EXPLAIN` 全部 SEARCH                |
| P2-16 | cron/PDF/OCR 出进程                                             | F 服务端 | P2-02 | 1d         | lag 告警不再出现                     |
| P2-17 | per-route 体积预算（切 webpack 或换数据源）                     | G 治理   | —     | 3–4h       | 能报出"某页 +30KB"                   |
| P2-18 | RUM 告警 + 台账自动化                                           | G 治理   | P2-01 | 2h         | p75 超阈值有告警                     |

粗估口径：改动 + 自测 + 一次 review 往返，**不含 CI 排队与 `next build` 等待**（本机跑不了）。

## 3. 分组说明

### A. 数字先行（P2-01 / P2-02）

**为什么排第一**：第一阶段最大的教训是 `perf:budget` 在 CI 里空转了两轮才被发现。
再往下的每一项（水合、长列表、framer）都要靠"哪个路由最差"来排序，没有数字就只能靠猜。

- **P2-01**：手机连生产地址，按 `docs/performance-baseline.md` §3 的 SQL 取数；同时手工测两次启动：
  第一次（冷）与第二次（热）各记 `navigationStart → 首次可点击` 的时间。至少 20 次交互再算 p75。
- **P2-02**：在 `web_vitals` 之外补两个事件型指标：
  - `launch`：`performance.getEntriesByType("navigation")[0]` 的 `domInteractive - startTime`；
  - `nav`：`PerformanceObserver({ type: "event" })` 里 `pointerup → next paint`（与 perf-guard 同源，但落库）。
    表结构加 `kind`（`vital|launch|nav`）而不是新建表，避免查询分散。

**不做**：不引入第三方 RUM（单用户自部署，加依赖不划算）。

### B. 缓存层（P2-03 / P2-04）

- **P2-03**：把 `app/sw.ts` 第一条 matcher（文档/RSC）从 `NetworkFirst{3s}` 改成
  `StaleWhileRevalidate{ cacheName: "document-cache" }`，并在 `next.config.ts` 打开
  `cacheOnNavigation: true`（serwist 的 `swe-worker` 会缓存 RSC payload）。
  效果：热启动与前进/后退**不再等网络**；代价是最多看到上一次的壳，`skipWaiting + clientsClaim`
  会让发版后第一次导航就换新。
- **P2-04**：核对并写死"资源 → 策略"矩阵（当前 5 类里 API 与文档都是 NetworkFirst，
  图片 SWR，字体 CacheFirst），把矩阵写进 `docs/performance.md` §2 以免后人逐条猜。

**风险与回滚**：SW 行为只在真机可见。P2-03 单独一个 PR，出问题直接把第一条 matcher 换回
`NetworkFirst{3s}` 即可回滚（一处 10 行）。

### C. 减水合（P2-05 / P2-06 / P2-07）

这是**冷启动 CPU 路径**上最大的一块，也是与原生差距的根本来源。

- **P2-05**：`layout.tsx` 现在用 `hidden md:flex` 包着一个 204 行 client 组件 `AppSidebar`
  —— CSS 藏起来但照样 SSR + 水合，还带一个 Suspense 里的 DB 查询（`SidebarUser`）。
  改法：两段 DOM 都渲染的规范在这里**不适用**（它针对的是布局显隐，不是"整块客户端代码"）。
  按 `docs/ui-system.md` §2 的例外条款走 `next/dynamic + ssr:false`，并在注释里写明这是
  明确例外（第一条：桌面侧栏在移动端没有任何交互路径）。
- **P2-06**：`LazyMotion` + `m`。当前 framer 全量运行时进底包，24 个文件用 `motion.*`，
  且无 `LazyMotion`/`MotionConfig`。改造顺序：先 `LazyMotion` 包根 → 逐个换 `m.*` →
  最后把 `domAnimation` 收窄到需要的 feature 集。
- **P2-07**：`components/ui/button.tsx:62` 的 `motion.button + whileTap` 换回普通 `button`
  - CSS `:active`（P0-1 已把按压态做成 CSS，语义已承接）。302 个调用点不动。

### D. 减渲染（P2-08 / P2-09）

- **P2-08**：`/knowledge` 现在最多 100 卡全量渲染，每卡 3 个 `layoutId`（= 300 个共享布局节点）。
  做法：分页 30 或虚拟化（`react-virtuoso` 已在依赖里）+ 去掉列表项 `layoutId`，
  展开动画改由 `AnimatePresence` 独立承担。**这条要拍板**（见 §4）。
- **P2-09**：把 `no-restricted-syntax` 的 80 条存量清到 0，然后把规则从 `warn` 升 `error`。
  这是"规范」变"红线"的最后一步：`transition-all` 在带 `backdrop-blur` 的元素上会让每次点击
  都重绘 300ms 阴影。

### E. 主线程重活（P2-10 / P2-11 / P2-12）

- **P2-10**：`app/ocr/page.tsx:190-197` 用 `reduce` 逐字节拼字符串再 `btoa`，上限 10MB。
  3MB 照片就能冻住数百 ms。改 `FormData` 直传（服务端已能收 `multipart`）。
- **P2-11**：`use-chat-stream.ts:77` 无 `experimental_throttle`，每个 token 触发
  `MessageList` 全列表重渲染（且未 memo）。
- **P2-12**：`QuestionManager.tsx:178-190` 在主线程 `JSON.parse` 题库。

### F. 服务端（P2-13 ~ P2-16）

服务端不直接决定"跟手"，但决定了"点了之后多久开始动"。

- **P2-13**：`@libsql/client` 本地文件只有一条物理连接，所有读写串行；`srs.ts:713-760`
  一个事务里对 100 条日志做 ~300 条语句。改法：批量 `insert ... values (多行)`、
  把 `updateQuestionSrs` 的读合并成一次 `in` 查询、必要时降级为后台任务。
- **P2-14**：`practice.ts:241`、`scheduling.ts:69/98` 用 `ORDER BY RANDOM()` 全表随机排序，
  题库越大越慢。改法：预采样 id 范围（`min(id)..max(id)` 随机取 N 个再补齐）或按热度分桶。
- **P2-15**：`session_reviews` 零索引；`practice_logs(question_id, user_id, is_correct)` 缺复合。
- **P2-16**：`instrumentation.ts` 在同进程 `initScheduler()`；`VACUUM INTO`、mupdf 逐页渲染、
  `bcryptjs` 都压在 web 事件循环上。先在 `worker_threads` 隔离，仍不够再拆容器。
  **前提：P2-02 的 lag 数字证明这确实是瓶颈**，否则不动。

### G. 治理收口（P2-17 / P2-18）

- **P2-17**：Turbopack 不产出 per-route manifest，当前预算只能按全站总量 —— 抓不到
  "某页 +30KB、另一页 -30KB"。两条路：改用 webpack 构建（拿回 route 表），或从
  `.next/server/app/**` 里按入口 chunk 归并（自研，脆弱）。**要拍板**（见 §4）。
- **P2-18**：`web_vitals` 每天聚合一次 p75，超阈值写日志/通知；台账由脚本生成而非手抄。

## 4. 需要你拍板的四件事

1. **SWR 的"旧页面窗口"**（P2-03）：接受"发版后第一次导航可能看到上一版壳"吗？
   若不接受，就保持 NetworkFirst + 3s，等于放弃热启动收益。
2. **`layoutId` 共享布局动画**（P2-08）：去掉它换 300 个布局节点的消失，卡片展开变成
   "淡入"而不是"卡片长大成全屏"。视觉会退化，需要你确认可接受。
3. **React Compiler**（`docs/decisions.md` T-16）：是否同意先在一个分支做一次性试验
   （构建时间、单测语义、体积三项都量），再决定是否全量开。
4. **是否接受切 webpack 构建**（P2-17）：换取 per-route 预算，代价是构建变慢。

## 5. 排期（按依赖，不按人天堆）

| 周    | 内容                                               | 产出                               |
| ----- | -------------------------------------------------- | ---------------------------------- |
| W1    | P2-01 + P2-02 → 有数字；P2-03 + P2-04 → 缓存层到位 | 基线台账 4 行；热启动不等网络      |
| W2    | P2-05 + P2-06 + P2-07（减水合）                    | 手机端不再水合桌面侧栏；底包 −29KB |
| W3    | P2-08 + P2-09（减渲染）                            | `/knowledge` 首屏；lint 基线归零   |
| W4    | P2-10 + P2-11 + P2-12（主线程）                    | 三处冻界面代码清零                 |
| W5–W6 | P2-13 ~ P2-16（服务端）                            | 并发 p95 稳定；抽题变快；lag 消失  |
| 收尾  | P2-17 + P2-18                                      | per-route 预算 + 告警              |

每张卡单独 PR，合并前必须附**改前/改后**两行数字；没有数字的优化不合。

## 6. 明确不做

1. 不引入第三方 RUM / 分析 SDK（单用户自部署，加依赖换不来信息）。
2. 不为过 LoAF 阈值而调大阈值或加 `retries`。
3. 不做"给所有组件加 memo"这类批量改造（要么 React Compiler，要么量过再改）。
4. 不重做路由结构或导航信息架构（那是产品决策，不是性能）。
5. 不在本阶段改主题系统（`[data-theme]` 死选择器是独立缺陷）。
