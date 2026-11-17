# 移动端交互性能计划（不跟手）

> 症状来源：真机（iPhone/Android）+ 生产构建（`node server.js`，非 dev）下同时出现三类体感
> —— **点击延迟**、**滚动掉帧**、**弹层/动画涩**。
> 本机 glibc 2.17 无法运行 Chromium，以下均为**代码层成本取证**，定量排序需真机（见 §5）。
> 上游治理（观测/预算/门禁/结构改造）见 `docs/performance.md`；本文只做症状级修复。

## 0. 结论先行

三类症状对应三组独立成本，不是同一个根因：

| 症状                                 | 主因组                                                                                              | 最便宜的一刀                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 点击延迟（点了像没反应、像要点两次） | 感知反馈缺失 + 每次导航整页 spring + SW 网络优先无超时                                              | 恢复 tap 反馈、去掉 template 的 scale、给 SW 加 3s 超时 |
| 滚动掉帧                             | 固定底栏 `backdrop-blur` 叠在唯一 scroller 上 + `transition-all` 动模糊层 + `/knowledge` 百卡布局组 | 底栏去 blur、模糊层不用 `transition-all`                |
| 弹层/动画涩                          | framer 全量常驻（含基础 Button）+ 换题串行 `mode="wait"`                                            | Button 去 `motion`、换题改并行                          |

## 1. 证据（代码层，行号对应 90def0a = origin/main #175）

### 1.1 感知反馈

- `my-next-app/src/app/globals.css:421` `-webkit-tap-highlight-color: transparent`：手指按下瞬间**零视觉反馈**。
- `globals.css:542-546` `button:active { transform: scale(.97) }`：iOS Safari 的 `:active` 要等触摸被判为非滚动才生效，且是抬手可见，等于失效。
- `app/template.tsx:7-19`：template 每次路由切换重挂载，整页 `opacity + y:12 + scale:0.99`，spring(stiffness 260/damping 28) 收敛约 400–600ms。
- `app/sw.ts:28-39,67`：`defaultCache` 中 HTML 文档 / `?_rsc=` / prefetch 全为 `NetworkFirst` 且无 `networkTimeoutSeconds`；自家 `/api/` 那条也无超时。→ 24h 缓存形同虚设，每次切页先等网络。

### 1.2 滚动

- `components/MobileNav.tsx:57` `fixed + bg-card/95 + backdrop-blur-md`：95% 不透明底色使模糊几乎不可见，成本全额支付；且压在全站唯一滚动容器上，滚动时逐帧重采样背景。
- `app/layout.tsx:115` + `globals.css:419,425-429`：`body{overflow:hidden}` + `main{overflow-y:auto}`，body 不滚。副作用：`globals.css:406` 的 `overscroll-behavior-y:none` 写在 `html` 上是空操作；地址栏永不收起；`-webkit-overflow-scrolling: touch` 在现代 iOS 为 no-op。
- `app/dashboard/page.tsx:62,137,208`：`backdrop-blur-sm` 元素上 `transition-all duration-300` 动 `box-shadow`；iOS 点击后保持 hover 态 → 每次点卡片跑一遍 300ms 模糊重绘。全仓 `transition-all` 117 处。
- `app/knowledge/page.tsx:144-159` + `lib/api/routes/knowledge.ts:73`：最多 100 卡全量渲染，`delay: index*0.05` → 第 100 卡 4.95s 才入场；`KnowledgeCardItem.tsx:33,44,50` 每卡 3 个 `layoutId` = 300 个共享布局节点。
- `app/knowledge/page.tsx:21`：`import _MarkdownViewer` 未使用，把 remark/rehype/katex CSS 拉进 eager bundle，废掉 `KnowledgeCardItem` 的 `dynamic()` 懒加载。

### 1.3 动画与主线程

- 无 `LazyMotion` / `MotionConfig`（全仓 0 命中），framer 全量运行时进底包。
- `components/ui/button.tsx:6,62`：基础 Button 是 `motion.button + whileTap`，302 个调用点各挂一套实例与 pointer 监听。
- `app/practice/PracticeClient.tsx:70` `AnimatePresence mode="wait"` + `PracticeCard.tsx:133-138` `duration:0.3` → 换题串行 ≥600ms。
- `layout.tsx:98-107`：桌面 `AppSidebar`（204 行 client + framer + Radix ScrollArea）与 Suspense 里的 `SidebarUser`（DB 查询）在手机上仅被 CSS 隐藏，SSR + hydration 照跑。
- 规模背景：`"use client"` 171 文件 / 32,635 行；27 个 `page.tsx` 整页 client。

### 1.4 与"卡"无关但会被误读成"点了没用"

- z-index 分簇：标准 Dialog/Sheet/Drawer/Popover 全是 `z-50`，业务浮层 `z-[60]`~`z-[200]`（`KnowledgeCardExpanded.tsx:38,42`、`HistoryCardExpanded.tsx:126,136`、`AnswerSheet.tsx:27`、`AnnotatableText.tsx:364`）。卡片展开态里开 Dialog 会被压在下面。

## 2. 不做（明确边界）

- 不重做滚动模型（`main` → body 滚动）在本期：影响全站布局与键盘行为，留 P2 单独评估。
- 不动 `sidebar`/导航信息架构；不引入新的状态管理或虚拟化库（`react-virtuoso` 已在依赖里）。
- 不改主题系统（`[data-theme]` 死选择器问题是独立缺陷，另开工单）。

## 3. 分批执行

### P0 — 感知层（预期直接改善"跟手"体感，改动小、可独立回滚）

| #    | 改动                                                                                                                        | 落点                      | 风险               | 验收                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------ | ------------------------------------------------ |
| P0-1 | 恢复按压反馈：去掉全局 `transparent` 取消，改为 `rgba(0,0,0,.06)` 级轻高亮；`button:active` 补 `touch-action: manipulation` | `globals.css:421,542-551` | 低（视觉微调）     | 真机按住不动即有变化；layout-guard 61 条不变红   |
| P0-2 | `MobileNav` 去掉 `backdrop-blur-md`（或降为纯色 `bg-card`）                                                                 | `MobileNav.tsx:57`        | 低（视觉需确认）   | 滚动 Performance 帧率对比；375 档护栏通过        |
| P0-3 | `template.tsx` 去掉 `scale`，或整段降级为 CSS `animation: fade-in .15s`                                                     | `app/template.tsx:7-19`   | 中低（转场观感）   | 切页无整页重绘；真机录一次切页                   |
| P0-4 | SW 加超时：文档/RSC 与 `/api/` 均加 `networkTimeoutSeconds: 3`；`skipWaiting` 保留但评估 `clientsClaim` 对进行中会话的影响  | `app/sw.ts:26-67`         | 中（离线行为变化） | 弱网 3s 后回退缓存；Offline 模式仍可打开已访问页 |

### P1 — 渲染成本

| #    | 改动                                                                                                                           | 落点                                                           | 风险               | 验收                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------ | ------------------------------------------------ |
| P1-1 | `/knowledge` 删死 import；入场延迟改 `Math.min(index, 8) * 0.05`；评估去掉 3 个 `layoutId`（或只对首屏卡保留）；列表分批 30    | `knowledge/page.tsx:21,144-159`、`KnowledgeCardItem.tsx:33-50` | 中（展开动画回归） | 100 卡首屏可交互时间；展开/收起动画仍连贯        |
| P1-2 | 换题改并行：`mode="popLayout"` 或去掉 `AnimatePresence`，`duration` 降到 0.18                                                  | `PracticeClient.tsx:70`、`PracticeCard.tsx:133-138`            | 中（答题节奏观感） | 连续答题手感；E2E `practice-flow.spec.ts`        |
| P1-3 | 模糊层不用 `transition-all`：`dashboard/page.tsx:62,137,208` 改 `transition-shadow`；模糊层移除 `hover:shadow-md` 或改静态边框 | 同上                                                           | 低                 | 点击卡片无 300ms 重绘                            |
| P1-4 | Button 去 `motion.button`，按压态交给 CSS（与 P0-1 合并）                                                                      | `ui/button.tsx:6,62`                                           | 中（全站按钮手感） | 302 处调用点视觉不变；`whileTap` 语义由 CSS 承接 |

### P2 — 结构（需单独评审，本期只出方案不实施）

- 滚动模型仲裁：`main` 内滚 → body 滚动 + `sticky` 导航；15 处 `100vh` 换 `dvh`。
- 移动端不 hydration 桌面侧栏：`AppSidebar` 用 `next/dynamic + ssr:false` 或 CSS 断点外的条件渲染（需绕过"禁用 JS 判宽"规范，作为明确例外记录）。
- `middleware.ts:22-114` 每请求 jose 验签 + 3 次 `console.log`（含 `:100` 的 duration 字段）→ 生产环境日志降级。

## 4. 护栏补强（与上并行，不阻塞）

- `ui-guard.yml:36` `continue-on-error: true` → 先按白名单豁免存量，再转阻断。
- `playwright.config.ts:55-66` layout-guard project 仍是 `devices["Desktop Chrome"]` + 用例内改视口：无 `hasTouch` / `isMobile` / `deviceScaleFactor=2` / `pointer:coarse`，hover 依赖、双击缩放、触摸惯性全部不在测试面内。
- 可点 ≥44×44（`layout-helpers.ts:718`）与表单不双列（`:724`）目前只报告不判红。
- 文档数字不一致：`ui-guard.yml:72` 写 27 条、`docs/ui-system.md:253` 写 46 条、`ui-system.md:191` 与 spec 头注释写 61 条（61 正确）。

## 5. 真机定量方案（改之前先做一次基线，改完复测）

本机跑不了 Chromium（glibc 2.17），全部在手机侧完成：

1. **基线**：手机 Chrome/Safari 打开生产地址 → DevTools（Chrome 用 `chrome://inspect` USB 调试；iOS 用 Mac Safari Web Inspector）。
2. **判定 SW 是否为主因**：Network 面板切 Slow 3G，点底栏切页；再勾 Offline 对比。若 Offline 反而更快出页面 → P0-4 成立。
3. **判定滚动掉帧**：Performance 录 5s 快速上下滚 `/wrong-book`，看 `Composite Layers` 是否每帧出现；临时删 `backdrop-blur-md` 对比。
4. **判定点击延迟**：Performance 录一次点击 → 看 main thread 长任务（>50ms）落在水合、spring 还是请求等待上。
5. 记录 4 个数字作为验收门槛：切页可交互时间、滚动平均帧率、点击到首帧反馈时间、`/knowledge` 100 卡首屏可交互时间。

## 6. 工作量粗估

粗估口径：改动 + 自测 + 一次 review 往返，**不含 CI 排队和 `next build` 等待**（本机跑不了 build，必须走 CI/容器）。

| 批次                       | 改动量                 | 粗估                   |
| -------------------------- | ---------------------- | ---------------------- |
| P0（4 项，≤5 文件）        | 每个 5–20 行           | 2–3h                   |
| P1-1 `/knowledge`          | 1 页 + 1 卡组件        | 2–3h（含展开动画回归） |
| P1-2 换题动画              | 2 文件                 | 0.5–1h                 |
| P1-3 `transition-all` 收敛 | 3 处起，全仓同类可分批 | 1–2h                   |
| P1-4 Button 去 motion      | 1 文件 + 全站视觉走查  | 1–2h                   |
| §4 护栏补强                | 配置 + 白名单          | 2–3h                   |
| §5 真机基线                | 手动 4 组测量          | 0.5h/轮                |

先做 P0 + §5 基线一轮 ≈ 半天，能拿到明确的"改前/改后"对比数字。

## 7. 本轮排查新增：X-1..X-10（待 S0 数据排序）

> 来源：`docs/performance.md` 之前的服务端 / 渲染层代码审计。**刻意不插进 §3 的 P0/P1**，等 INP 数据决定先改哪条。

| #    | 改动                                                                                                                                           | 落点                                                      | 粗估  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----- |
| X-1  | 根布局三次 feature flag 串行 await 改 `Promise.all`（每页固定省 2 个 DB 往返）                                                                 | `layout.tsx:69-74`                                        | 10min |
| X-2  | `practice_logs(session_id)` 补索引（历史详情/报告/续做全靠它，是最大表）                                                                       | 新迁移                                                    | 30min |
| X-3  | 抽题去掉 `ORDER BY RANDOM()` 全表随机排序（改 id 预采样或按热度分桶）                                                                          | `practice.ts:241`、`scheduling.ts:69/98`                  | 2–3h  |
| X-4  | `QuestionCard` 的 `sanitizeHtml` 移进 `useMemo`；列表数组别在渲染期重建（击穿 memo）                                                           | `QuestionCard.tsx:225,252`、`history/[id]/page.tsx:233`   | 1–2h  |
| X-5  | `NoteEditor` 每键序列化整篇 + `setTimeout` 无 `clearTimeout`（每键一个定时器）                                                                 | `NoteEditor.tsx:94-104`                                   | 30min |
| X-6  | `/ocr` 的 O(n²) base64（`reduce` 拼字符串 + `btoa`，上限 10MB）改 `FormData` 直传                                                              | `ocr/page.tsx:190-197`                                    | 1h    |
| X-7  | 列表项 memo 化：`/wrong-book`（27 state 提到页面顶层 + 内联箭头 props）、`/recall`（`typed` 在 682 行组件顶层）                                | `use-wrong-book-controller.ts:61`、`RecallSession.tsx:93` | 3–4h  |
| X-8  | 聊天流式加 `experimental_throttle`，`MessageList`/`ChatMessage` memo 化、`onDelete` 稳定化                                                     | `use-chat-stream.ts:77`、`MessageList.tsx:60`             | 1–2h  |
| X-9  | 根段 `loading.tsx` 全屏 `fixed z-50` 遮罩：只在根段挂起时闪，视觉上像"卡一下"，建议降级为顶部细进度条（模糊只在中央小卡上，代价不大）          | `app/loading.tsx`                                         | 30min |
| X-10 | 低频变更页加 `unstable_cache`（feature flag、词表、教材）；顺带修 `middleware.ts:114` matcher 未排除 `sw.js/woff2/svg/webmanifest` 与 `?_rsc=` | `middleware.ts:114`、`feature-flags.ts`                   | 2h    |

## 8. 服务端与数据层（审计结论，供 S0 后排序）

### 8.1 单连接把全站 DB 串行化

- `db/index.ts:128-140` `@libsql/client` 本地文件只有**一条物理连接**，所有读写串行（作者在三处模块级锁注释里已承认：`import-service.ts:61-66`、`recall-import.ts:67-72`、`pdf-import.ts:80-86`）。
- 长事务放大：`srs.ts:713-760` 一批 100 条日志 × (2 select + 1 upsert) 全在一个事务内；入口是用户按按钮（`SrsAnalysisClient.tsx:65` → `server/actions/srs.ts:100`）。
- 写放大：`pdf-import.ts:169` 逐条 INSERT；`:394` 提交后每题再走 `updateQuestionSrs`（内含 2 select + 1 upsert）。
- 两把"互斥锁"其实不同队列：`import-service.ts:75` 的 `withImportLock` 与 `pdf-import.ts:88` 的 `withConfirmLock` 可同时进入事务，正撞在注释里描述的事故上。
- 验收方法：并发开两条会话，一条点"同步 SRS"，另一条循环 `GET /api/history?page=1`，量 p95 从 ~20ms 跳到秒级。

### 8.2 缺索引 Top 5（已核 `drizzle-schema.ts`）

1. `practice_logs.session_id`（`history.ts:243`、`report.ts:77/105/150/196`、`practice.ts:150`）— 确认四索引里没有它（`drizzle-schema.ts:141-152`）。
2. `session_reviews(session_id)` — 该表零索引（`history.ts:236-241` 的 join 靠自动索引兜）。
3. `practice_logs(question_id, user_id, is_correct)` — 现有只有 `question_id` 单列。
4. `textbook_chapters(textbook_id)` — `textbook.ts:154` 每读教材全表扫（章节正文大）。
5. `knowledge_cards(user_id, created_at)` 与 `notes(user_id)` — 现有单列索引各自只命中一半，还要额外排序；`notes` 连 `user_id` 索引都没有。

### 8.3 请求路径上的同步重活（当前唯一架构性风险）

- 单容器单进程 `node server.js`（`my-next-app/start.sh:33`），`instrumentation.ts:10-14` 在同进程 `initScheduler()`；全仓**无** `worker_threads` / `child_process`。
- 因此这些全在 web 进程里跑：`siliconflow-ocr.ts:32-66`（mupdf 逐页 `toPixmap`+`asPNG`，纯 JS/WASM）、`mineru-service.ts:12`（整包 ZIP 内存解压）、`password.ts:3-8`（`bcryptjs` 纯 JS，10 rounds 约 60–100ms）、`admin.ts:213/283-288`（`readFileSync` 整库 + 同步 copyFile/rename）、`scheduler.ts:22` 的 `VACUUM INTO` 备份。
- AI 也在请求路径上无队列：`knowledge.ts:244-260`（extract 等 30s）、`pdf-import.ts:58-63`（PaddleOCR 超时 180s）、`chat-rag.ts:85-124`（首 token 前 2 次向量检索 + 1 次 rerank）。

### 8.4 每请求固定开销

- `middleware.ts:114` matcher 覆盖字体/图标/SW/`?_rsc=` 导航；每请求 `crypto.randomUUID()` + jose 验签 + 3–4 条 `console.log`（`:45,49,54,92`）。
- `layout.tsx:69-74` 三次串行 `getGlobalFeatureFlag`（`feature-flags.ts:17-38` 每次一条 SELECT，无 `cache()`）；`dashboard/page.tsx:253-258` 再查一遍同样的三个 key。
- 缓存现状：`react cache()` 仅 4 处、`unstable_cache` 0 处；`revalidate=60` 的 3 处 ISR 很可能被 `SidebarUser` 读 `cookies()` 强制动态化而失效（**需 `next build` 输出的 `○/ƒ` 标记确认**）。

### 8.5 大响应与无上限查询

- `knowledge.ts:73,105` 与 `questions.ts:50-54` 的 `limit` 只 `parseInt` 不 clamp（`limit=100000` 可用）；对照 `external.ts:267` / `wrong-book.ts:285` 有 `MAX_LIMIT`。
- `admin.ts:438-470` 全库题目 `.all()` 后内存拼整份 CSV；`textbook.ts:154` 返回全书章节正文；`admin.ts:213` 整库二进制一次下发。
- 分页全是 `offset` 无 keyset（`external.ts:118`、`admin-service.ts:90/143/370`、`mastery.ts:171`、`history.ts:176`、`wrong-question.ts:136`）。
- 整行取回只用少数字段：`history.ts:216-236`（带 `material_html`/`ai_mnemonic`）、`wrong-question.ts:363-372`、`practice.ts:133-140`。

## 9. 渲染层（审计结论，供 S0 后排序）

### 9.1 记忆化密度与页面规模严重不匹配

全仓 `React.memo` **6 处**、`useMemo` **12 处**，但有 27 个整页 client 组件、8 个 550–882 行的巨型组件。且 6 处 memo 里**4 处实际失效**（父组件传内联箭头或每渲染重建数组），唯一真正生效的是 `MarkdownViewer`（自定义比较器）。结论：**目前没有任何一条长列表受 memo 保护**。

### 9.2 四个"一次交互 = 全量重渲染"

1. `/history/[id]`：`QuestionCard.tsx:225,252` 渲染期跑 `sanitizeHtml`（`security.ts:6-31` 六条全文正则），且 `history/[id]/page.tsx:233` 每渲染重建数组 → 展开一张卡 = N 题 × 2 字段 × 6 遍正则。
2. `/wrong-book`：`use-wrong-book-controller.ts:61` 27 个 state 提在页面顶层，`page.tsx:352-361` 给每卡传 6 个内联箭头 → 勾选一题重渲染全部 20 卡。
3. `/recall`：`RecallSession.tsx:93` 的 `typed` 在 682 行组件顶层，每键重渲染进度条（`:383-391`）+ 重算 `presentedIndexes` / `splitClozeAnswers`（`:358-361`）。
4. `/notes/[id]`：`NoteEditor.tsx:94-104` 每键 `getJSON()` + `JSON.stringify` 整篇 + 无清理 `setTimeout`（真正的 1000ms 防抖在下游 `NotePageClient.tsx:56-71`，只挡网络不挡主线程）。

### 9.3 已确认的客户端重活

- `ocr/page.tsx:190-197`：`reduce` 逐字节拼字符串 + `btoa`，上限 10MB，手机上一张 3MB 照片即阻塞数百 ms 至数秒（全仓唯一能冻住主线程的代码）。
- 全仓**无** `new Worker`；`QuestionManager.tsx:178-190` 主线程 `JSON.parse` 题库。
- 聊天：`use-chat-stream.ts:77-99` 无 `experimental_throttle`，每 token 触发 `MessageList`（`:60`，未 memo）全列表重渲染 + `toSimpleMessages` 全量 map/join。
- `animated-number.tsx:19-27` 用 framer 的 `onUpdate` 驱动 `setState`，`/dashboard` 三张统计卡挂载瞬间约 180 次渲染（多数是无效渲染）。

### 9.4 与"不跟手"直接相关的两个观感项

- `app/loading.tsx`：根段 `fixed inset-0 z-50` 遮罩（模糊仅在中央小卡，非全屏 `backdrop-blur`），任一慢导航都整屏闪一次 —— 视觉上像"点了卡住"。
- 全仓 `useOptimistic` **0 处**、`useDeferredValue`/`startTransition` **0 处** → 所有写操作都等 server action 回来才改 UI，没有任何乐观更新或并发降级手段。

### 9.5 数据获取与缓存

- RQ 配置本身正确（`QueryProvider.tsx:16-23`：`staleTime 60s`、`refetchOnWindowFocus:false`），**但只用了 6 处 `useQuery`**；43 个 client 页面直接在 `useEffect` 里调 server action 取数 → 每次 mount 必然一次 POST，无跨页缓存、无 SSR 预取。
- 瀑布：`RecallSession.tsx:128 → :153`（队列→首卡两跳）、`knowledge-graph/page.tsx:52-60`（数据到位后才下载首屏主体 chunk）、`use-review-generation.ts:27-100`（quiz 与 regression 串行且 effect 依赖自身 state，有重入风险）。
- 竞态缺口：`use-wrong-book-controller.ts:115-148` 的 `loadData`/`loadMore` 无序号无 abort（旧响应可覆盖新数据并提前 `setLoading(false)`）；对照写法看 `admin/QuestionManager.tsx:67-83`（reqIdRef，最正）。

## 10. 需要构建/真机才能定的项（不要当结论用）

1. SW precache 是否把 `public/` 那 1.3MB 死图（`assets/login-bg.png` 620KB、`og-image.png` 552KB、`empty-state.png` 164KB，`src` 内零引用）打进预缓存 —— 需读构建产物 `public/sw.js` 的 `__SW_MANIFEST`。
2. `/knowledge` 死 import 的具体体积增量 —— 需 `next build` 的 route 表。
3. `revalidate=60` 的三处 ISR 是否真被 `cookies()` 动态化失效 —— 需 build 输出的 `○/ƒ` 标记。
4. 各页 INP/LoAF 实际数值 —— 需真机 Performance（见 §5）。

## 11. 执行约定

- 全部改动在 `~/ai-leaming-wt-sandbox`（分支 `wip/sandbox`，基线 origin/main 90def0a）进行，不动主检出的 recall 拆分改动。
- 每个 P 批次单独 PR，提交信息中文，`<type>: <简述>`。
- 合入前跑四闸：`lint:ci` / `typecheck` / `test:run` / `next build`（build 只能在 CI 或容器里跑）+ `npm audit`。
- P0 全部改动 ≤ 5 个文件，可一次性 review。

## 12. 执行状态（2026-11-17）

| 项                     | 状态     | 落点 / 说明                                                                                                                                                                                                                                     |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 恢复 tap 反馈     | 完成     | `globals.css`：`-webkit-tap-highlight-color` 由 `transparent` 改为 `rgba(127,127,127,.18)`；`button/a/[role=button]/.clickable` 加 `touch-action: manipulation`；`:active` 过渡只作用于 transform 等具体属性（原 `transition: all`）            |
| P0-2 底栏去 blur       | 完成     | `MobileNav.tsx:57` `bg-card/95 backdrop-blur-md` → `bg-card`（95% 不透明时模糊本就不可见）                                                                                                                                                      |
| P0-3 路由转场去 scale  | 完成     | `app/template.tsx` 由 `scale:.99 + y:12` spring（400–600ms）改为纯 `opacity` 150ms，不再整页重栅格化                                                                                                                                            |
| P0-4 SW 超时           | 完成     | `app/sw.ts` 新增文档/RSC 的 `NetworkFirst{networkTimeoutSeconds:3}` 并置于 `defaultCache` 之前；`/api/` 那条同样补 3s                                                                                                                           |
| P1-1 `/knowledge`      | 部分完成 | 已删死 import `_MarkdownViewer`（它把 remark/rehype/katex 拉进 eager bundle）；入场延迟改 `Math.min(index,8)*0.05` + duration 0.25（原第 100 卡等 4.95s）。**未做**：去 `layoutId`、分页 30 —— 属观感/信息密度决策，见 `docs/decisions.md` T-14 |
| P1-2 换题动画          | 未做     | 改 `mode="wait"` 会改变答题节奏，需先有 INP 数字，见 `docs/performance.md` §9                                                                                                                                                                   |
| P1-3 模糊层 transition | 完成     | `dashboard/page.tsx` 三处 `transition-all` → `transition-shadow`                                                                                                                                                                                |
| P1-4 Button 去 motion  | 未做     | 影响 302 个调用点手感，归入 ADR T-13（`LazyMotion` + 基础组件去 motion 一起做）                                                                                                                                                                 |
| X-1 flag 并行          | 完成     | `layout.tsx:69` → `Promise.all`                                                                                                                                                                                                                 |
| X-2 补索引             | 完成     | 迁移 `0016`；`EXPLAIN` 已变 `SEARCH ... USING INDEX idx_practice_logs_session`                                                                                                                                                                  |
| §4 护栏补强            | 部分完成 | `ui-guard` 已转阻断（依据 run 43935305511）；新增 perf-guard；44×44 与表单双列仍是报告模式（转断言会引入一批存量失败，留待单独批次）                                                                                                            |
| §7 X-3..X-10           | 未做     | 按计划等 S0 的 INP 排名决定顺序；`docs/performance.md` §10 已记录                                                                                                                                                                               |

> 遗留：本机无法跑 `next build`/Chromium，P0-1（tap 高亮）、P0-2（视觉）、P0-4（离线行为）三项的最终验收仍需真机确认一次。
