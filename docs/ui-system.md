# UI 基准（可执行版）

> 目的：**每页不再重新做一次视觉决策**。所有页面共用一套骨架、断点、间距与字号刻度。
> 新页面必须照本文档写；存量页面按 §8 收敛。颜色一律用 `globals.css` 已有的 `@theme` 令牌，本文不改品牌配色。
> 范围：`my-next-app/src/app/**`、`src/components/**`（Flutter `mobile_app/` 不在内）。

## 1. 参考基准

**结构参考 = shadcn/ui `dashboard` + `tasks` blocks。** 理由：`globals.css` 已是 shadcn 令牌命名（`--primary` / `--radius` / `--sidebar-*`），组件在 `src/components/ui/` 同源；blocks 是可复制源码、Tailwind v4 兼容，且 `tasks` 自带我们最缺的「Table ↔ Card 双投影 + Toolbar + 分页」。

| 照抄                                           | 不照抄                                      |
| ---------------------------------------------- | ------------------------------------------- |
| sidebar：`md:` 起常驻，以下抽屉                | 默认 zinc 灰阶与 `rounded-md`（用 §5 刻度） |
| PageHeader：标题 + 描述 + 右侧操作             | 英文文案、四宫格指标布局                    |
| Table/Card 双投影（一份 rows 两组渲染）        | 列表卡也用 `p-6`（我们列表卡用 `p-4`）      |
| Toolbar 的 `flex flex-wrap items-center gap-2` | 表格列显隐/排序菜单（当前用不到）           |
| EmptyState 居中且不占满视口、深色下仍需可读    | 深色优先的视觉基调                          |

**信息层级参考 = 粉笔 / 一起考教师（中文应试类）。** 理由：用户已形成「列表（题干摘要+状态）→ 详情（题干+解析）→ 练习（全屏作答）」动线，照抄层级省掉学习成本。

| 照抄                                             | 不照抄                               |
| ------------------------------------------------ | ------------------------------------ |
| 列表项三个字段：题干 2 行 + 标签 1 行 + 状态角标 | 配色、字体、圆角                     |
| 详情顶部固定「题号 / 来源 / 状态」，正文单列     | 课程营销位、会员浮层、签到弹窗       |
| 练习页底部固定作答区（按钮在拇指区）             | 整块红/绿底表示对错（用徽标 + 文字） |
| 状态只有三种：待复习 / 已掌握 / 错               | 详情整页跳转（我们保留行内展开）     |

## 2. 断点与适配策略

只保留 **`sm` / `md` / `lg`**（640 / 768 / 1024）。**禁止 `xl:` 与自定义 `@media`**。存量共 **3 处**，收敛时一并换成 `sm/md/lg` 类名（或 `max-md:` 变体），不新增第 4 处：

| 存量            | 位置                    | 内容                                                                | 收敛方式                                                      |
| --------------- | ----------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `xl:` 1 处      | `textbooks/page.tsx:53` | `xl:grid-cols-4`                                                    | 删掉 `xl:`，四列需求用 `lg:grid-cols-3` 覆盖                  |
| 自定义 `@media` | `globals.css:550`       | `max-width: 768px` 下富文本 `taskList` 复选框间距 `0.2rem → 0.5rem` | 换成 Tailwind 的 `max-md:` 变体，或并入 `.prose` 样式         |
| 自定义 `@media` | `globals.css:643`       | `max-width: 600px` 下隐藏 `.drag-handle`                            | 换成 `max-sm:hidden`（600 与 640 的差在这里不影响手指可达性） |

| 档位           | 布局规则                                                                   |
| -------------- | -------------------------------------------------------------------------- |
| 基础（< 640）  | 单列；无侧边栏；导航走 `MobileNav`；列表一律卡片                           |
| `sm`（≥ 640）  | **列数不变**，只允许「同一行内元素由堆叠改并排」（标题与按钮、两个筛选项） |
| `md`（≥ 768）  | 侧边栏出现；内容可两列；**表格从这档起才允许出现**                         |
| `lg`（≥ 1024） | 三列网格，或「主内容 + 右侧栏」；长文本列表可两列                          |

```tsx
// ✅ 基础单列，逐档加列
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
// ❌ 桌面优先再回缩，且用了被禁的 xl
<div className="grid grid-cols-4 gap-6 md:grid-cols-2 xl:grid-cols-6">
```

**禁止用 JS 判宽做布局**：❌ `useMediaQuery("(max-width: 768px)")` 后二选一渲染；✅ 两段 DOM 都渲染，服务端可出，显隐交给 CSS：

```tsx
<div className="hidden md:block"><Table … /></div>
<div className="space-y-2 md:hidden"><CardList … /></div>
```

允许的例外（必须写一行注释，且不得用于决定列数/显隐）：① 滚动条宽度补偿（`HistoryCardExpanded.tsx:47`）；② PWA `display-mode` 判断（`usePWAInstall.ts:23`）；③ 第三方库只收像素参数（图表 canvas、`Virtuoso` 高度）。

## 3. 页面骨架：固定五段

顺序固定。`PageHeader` / `Toolbar` / `Content` 必选；`EmptyState` / `ErrorState` 是 `Content` 的互斥状态。**每个路由只允许一个 `h1`**（`admin-layout-shell` 现有 3 个 `h1` 且与页面 `h1` 重复，收敛时降级为 `div`）。

```tsx
<div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 lg:py-10">
  {/* 1 PageHeader：mb-6，标题 + 一句话描述 + 右侧最多 2 个操作 */}
  <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">错题本</h1>
      <p className="mt-1 text-sm text-muted-foreground">汇集易错知识点</p>
    </div>
    <Button size="sm" variant="outline">手动录入</Button>
  </header>

  {/* 2 Toolbar：mb-4，筛选/视图切换/批量操作，允许换行 */}
  <div className="mb-4 flex flex-wrap items-center gap-2"><Tabs … /></div>

  {/* 3 Content：列表 gap-3，网格 gap-4 */}
  <section className="space-y-3">{rows.map((r) => <Row key={r.id} data={r} />)}</section>
</div>
```

| 段         | 容器类名                                               | 现成组件                                   |
| ---------- | ------------------------------------------------------ | ------------------------------------------ |
| 页面容器   | `mx-auto w-full max-w-6xl px-4 py-6 md:px-6 lg:py-10`  | 无，页面根节点手写（不新建 `PageShell`）   |
| PageHeader | `mb-6`，内部 `sm:flex-row sm:items-center`             | 无                                         |
| Toolbar    | `mb-4 flex flex-wrap items-center gap-2`               | `tabs` / `select` / `input` / `button`     |
| Content    | `space-y-3`（列表）或 `grid grid-cols-1 gap-4`（网格） | `table` / `card` / `pagination`            |
| 三态       | 见下方状态矩阵                                         | `empty-state` / `error-state` / `skeleton` |

状态矩阵（不允许别写）：`loading → Skeleton`、`error → ErrorState`（`onRetry` 必填）、`ready 且无数据 → EmptyState`、`ready → Content`。
骨架尺寸：列表 `h-20` × 6，表格 `h-12` × 5，均 `rounded-lg`；`Skeleton` 自带 `shimmer`。不要用 `Loader2` 撑满内容区（存量：`admin/users` 表格内 spinner 文案，收敛时换 Skeleton）。

**不要双滚动容器**：`layout.tsx` 的 `<main>` 已是 `overflow-y-auto`，页面根节点写 `min-h-full`，不写 `min-h-screen` + 内层 `overflow-y-auto`（存量：`dashboard/page.tsx:265`）。

## 4. 列表 → 卡片

`< md` 用卡片，`md:` 起用表格；同一份 rows 渲染两次，不写两套数据逻辑。

```tsx
{
  /* 桌面：Table 自带 overflow-auto，只能在 md 以上出现 */
}
<div className="hidden rounded-lg border md:block">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead className="min-w-0">题干</TableHead>
        <TableHead className="w-24">状态</TableHead>
        <TableHead className="w-32">更新时间</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((r) => (
        <TableRow key={r.id}>
          <TableCell className="max-w-0 truncate">{r.title}</TableCell>
          <TableCell>
            <Badge variant="secondary">{r.statusLabel}</Badge>
          </TableCell>
          <TableCell className="text-muted-foreground">{r.updatedAt}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</div>;

{
  /* 手机：卡片，字段只留 3 个 */
}
<ul className="space-y-2 md:hidden">
  {rows.map((r) => (
    <li key={r.id} className="rounded-lg border bg-card p-4">
      <p className="line-clamp-2 text-sm leading-6">{r.title}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge variant="secondary">{r.statusLabel}</Badge>
        <span className="text-xs text-muted-foreground">{r.updatedAt}</span>
      </div>
    </li>
  ))}
</ul>;
```

规则：

1. key 用业务 ID（`r.id` / `q.questionId`），禁用数组下标；
2. 手机卡片字段上限 **3 个**（题干 2 行 + 1 个徽标 + 1 个时间/数字），操作 ≤ 2 个；
3. 题干一律 `line-clamp-2`，靠截断控高，不靠缩窄容器；
4. **移动端不允许保留可横向滚动的宽表格**：`Table` 自带 `w-full overflow-auto`，出现在 `< md` 就是横向溢出，用 §8 断言卡住；表格列数 ≤ 5，超过说明该页在手机上本就该是卡片。

## 5. 间距与字号刻度

**只用 4 的倍数**（4/8/12/16/24/32/48/64px）。禁止任意值：`p-[13px]`、`mt-[18px]`、`w-[342px]`。

| 用途       | 取值                                                              |
| ---------- | ----------------------------------------------------------------- |
| 页面内边距 | `px-4 py-6`、`md:px-6`、`lg:py-10`                                |
| 段间距     | Header→Toolbar `mb-6`；Toolbar→Content `mb-4`；大区块 `space-y-6` |
| 列表/网格  | `space-y-2`（紧）、`space-y-3`（默认）；`gap-3`、`gap-4`、`gap-6` |
| 卡片内边距 | 列表卡 `p-4`；默认 `Card` 自带 `p-6`（不要覆盖）                  |
| 控件高度   | 桌面 `h-10`；移动端主操作 `h-11`（`size="lg"`，44px）             |
| 容器宽度   | 窄栏 `max-w-3xl`、标准 `max-w-6xl`、宽栏（表格/管理）`max-w-7xl`  |

字号（`font-sans` = Geist；`font-serif` 只用于品牌/叙事面——落地页、首页问候、`/cultivation`、`/docs`——列表、表单、管理端一律 `font-sans`）：

| 层级     | 类名                                                | 备注                    |
| -------- | --------------------------------------------------- | ----------------------- |
| 页面标题 | `text-2xl font-semibold tracking-tight md:text-3xl` | 每页唯一 `h1`           |
| 区块标题 | `text-base font-medium`                             | 覆盖 `CardTitle` 默认值 |
| 正文     | `text-sm leading-6`                                 | 题干、解析              |
| 辅助文字 | `text-xs text-muted-foreground`                     | 时间、计数、说明        |
| 数字强调 | `text-2xl font-semibold tabular-nums`               | 统计卡                  |

圆角只用 `rounded-lg`（10px，卡片/输入/表格）与 `rounded-full`（徽标、头像、圆形图标底）；不新增 `rounded-xl/2xl/3xl`。不新增 `text-[10px]`（存量 67 处，收敛时改 `text-xs`）。

## 6. 移动端硬约束（可测）

以 **375 × 812** 为基准视口（护栏实际使用的档位；早期写 375×667，统一按 iPhone X 系视口），四条同时成立：

1. **无横向滚动**：`document.documentElement.scrollWidth <= window.innerWidth`；
2. **可点区域 ≥ 44×44**：主操作 `size="lg"`（`h-11`）；图标按钮显式 `h-11 w-11`（默认 `size="icon"` 只有 40px）；列表行整体可点且 `min-h-11`；
3. **主操作在拇指区**：放内容流末尾，或做成唯一一条底部固定栏，且带 `pb-[calc(1rem+env(safe-area-inset-bottom))]`、内容区预留 `pb-28 md:pb-6`；
4. **表单在 375px 不出现双列**：`<md` 恒为 `grid-cols-1 space-y-4`，`grid-cols-2` 只能从 `md:` 起。

### 6.1 护栏落点（断言在哪、跑什么命令、是否阻断）

- 用例：`my-next-app/tests/visual/layout-guard.spec.ts`；判定逻辑：`my-next-app/tests/visual/layout-helpers.ts`。
- 运行：`cd my-next-app && npx playwright test --project=layout-guard`（CI 里是 `ui-guard` job）。
- 覆盖：15 条路由（`/login` + 9 个登录后主路由 + 5 条管理端路由 `/admin`、`/admin/users`、`/admin/plans`、`/admin/questions`、`/admin/ai`）× 3 档视口（375×812 / 768×1024 / 1440×900）= 45 条用例，外加 1 条 `/wrong-book`「选中题目后」专项（其操作栏是条件渲染，默认状态不渲染，只用 375 视口跑一次）。

| 本文条目            | 生效视口         | 判定                                                                                                                                                                                                                            | 当前状态                                                                                               |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| §6.1 无横向滚动     | 375 / 768 / 1440 | `documentElement.scrollWidth <= innerWidth`；**375 额外**：`<main>` 内部不得横向滚动、且无元素越出视口右边缘（`overflow-x:hidden` 裁剪 > 8px 或裁到表格同样算越界）                                                             | 阻断（前置还校验 HTTP 状态码、整页崩溃文案 / `role=alert`、非骨架态，见 §8）                           |
| §6.2 可点 ≥ 44×44   | 仅 375           | `button, a[href], [role="button"]` 中可见元素任一边 < 44px 即计入                                                                                                                                                               | **报告模式**：写 Playwright annotation（`mobile-tap-target`）+ `console.warn` 汇总，**不影响用例结果** |
| §6.3 主操作在拇指区 | —                | 无法自动判定                                                                                                                                                                                                                    | 人工评审                                                                                               |
| §6.4 表单不双列     | 仅 375           | `form` 及其后代中 `display:grid` 且列数 ≥ 2 的容器                                                                                                                                                                              | **报告模式**：annotation（`mobile-form-columns`）+ `console.warn`                                      |
| §6 单条固定底栏     | 仅 375           | `position:fixed` 且整个元素落在视口底部 160px 窗口内（`rect.top >= innerHeight - 160 && rect.bottom <= innerHeight`）的可见元素两两求交，面积 > 0 即失败（排除装饰层、`pre/code/.prose` 内部、铺满整屏的遮罩、互为祖先/后代者） | 阻断                                                                                                   |

报告模式的原因：存量页面几乎必然不达标，先积累清单；等 §8 的溢出存量清完，再把这两条转成阻断。

存量冲突：`MobileNav` 在 `bottom-[calc(1.5rem+safe-area)]`、高 `h-16`，与 `wrong-book`、`practice/setup` 的 `fixed bottom-0` 操作条重叠。规则：一个移动端页面最多一条固定底栏；**页面自带固定操作条时 `MobileNav` 让位**。

实现方式是「页面自己登记」而不是路由白名单：`src/components/layout/bottom-bar-slot.tsx` 提供 `BottomBarProvider` / `usePageBottomBar(active)` / `useHasPageBottomBar()`（计数式，支持同页多处声明与条件渲染），`MobileNav` 在计数 > 0 时返回 `null`；`/login`、`/register` 另有一条独立判定。新增带底栏的页面只要 `usePageBottomBar(<底栏是否渲染>)`，不要再往 `MobileNav` 里加路由判断 —— `/wrong-book` 的操作栏只在选中题目时出现，白名单会把它的空状态也一起砍掉导航。

## 7. 禁止清单

| 禁止                                           | 替代                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `useMediaQuery` / `window.innerWidth` 决定布局 | `md:` 类 + `hidden`/`md:hidden` 双投影（例外见 §2）                        |
| `xl:`、`2xl:`、自定义 `@media`                 | 只用 `sm/md/lg`                                                            |
| `absolute` + 手写偏移做栅格对齐                | `flex` / `grid` + `gap-*`                                                  |
| `overflow-x-auto` 包整页或手机上的表格         | 该屏改用卡片                                                               |
| 页面里硬编码色板（存量 1183 处，映射见 §9）    | `bg-primary`、`text-success`、`text-destructive`、`text-muted-foreground`、`Badge variant` |
| `text-[10px]`、`p-[13px]` 等任意值新增         | §5 刻度                                                                    |
| 页面根 `min-h-screen` + 内层滚动               | 根 `min-h-full`，滚动交给 `main`                                           |
| `fixed bottom-0` 不带 safe-area padding        | §6.3 写法                                                                  |
| 复制 PageHeader 样式再改字号                   | 按 §3 类名照抄                                                             |

横向滚动的唯一例外：`pre` / `code` / `.prose`（富文本）内部（代码块、长公式）。确有必要的新容器请加 `data-scroll-ok` 并在 PR 说明理由 ——
`layout-guard` 会把带该标记的容器视为合法吸收，其余 `overflow-x-auto` 一律按「该屏改用卡片」报出。

**`overflow-x: hidden` 不算例外**：它不产生滚动条，但会把内容裁掉 —— 用 hidden 包一张宽表格，页面"没有横向溢出"而内容少一截。
护栏只豁免 ≤ 8px 的轻微裁剪（阴影 / 亚像素抖动）；裁掉更多，或裁的是 `table`（含 `thead/tbody/tr/td/th`），
一律按「被 <容器> 以 overflow-x:hidden 裁剪；宽表格在移动端应改为卡片」报出。
装饰性色块需要出血时，请用绝对定位 + `pointer-events-none` 叠在装饰层，**不要**用 hidden 容器包内容（那会连内容一起裁掉）。

## 8. 演进方式

**新页面**：直接按 §3 起手，验收通过再提 PR。
**存量页面**：一次只做一个页面、每 PR ≤ 3 页，diff 只改布局类名（不动数据逻辑与组件结构）。

1. **先治溢出**：`Table` 加 `hidden md:block` 并补卡片投影；删 `xl:`；`overflow-x-auto` 收敛到代码块/富文本内部；
2. **再对齐骨架**：补齐三段与 `mb-6`/`mb-4`，`min-h-screen` → `min-h-full`；
3. **最后列表卡片化**：按 §4 双投影，字段按「3 个」取舍；顺手收敛 `rounded-2xl/3xl` → `rounded-lg`、`text-[10px]` → `text-xs`、硬编码色板 → 语义令牌。

**验收**：每页 `375×812`、`768×1024`、`1440×900` 三档，并跑配套 `layout-guard`（Playwright，`tests/visual/layout-guard.spec.ts`，`--project=layout-guard`）：

```ts
// my-next-app/tests/visual/layout-guard.spec.ts（节选；完整判定见 layout-helpers.ts）
const probe = await collectLayoutProbe(page);
// 所有视口：页面无横向滚动（前置还校验 HTTP 2xx/3xx、非错误边界、非骨架态）
expect(probe.documentScrollWidth).toBeLessThanOrEqual(probe.viewportWidth + 1);
// 所有视口：主容器可见且渲染出真实文本
await expect(page.locator("main").first()).toBeVisible();
expect(await page.locator("main").first().innerText()).not.toBe("");
// 仅 375：main 内部不横向滚动 + 无元素越出右边缘（越界明细带 selector 与坐标）
expect(probe.oversize).toEqual([]);
```

> 状态：spec 与 CI job（`ui-guard`）已接入，46 条用例（含 5 条管理端路由）。`ui-guard` 现阶段 `continue-on-error`（存量溢出未清完），
> 清完存量后改为阻断。§6.2 可点尺寸与 §6.4 表单双列目前是**报告模式**（annotation + `console.warn`），
> 不计入用例结果。在那之前，改动布局的 PR 仍需在本地/CI 报告里确认无新增溢出。

不为「以后好复用」提前抽 `PageShell` 或引入 Storybook —— 先把类名统一，同一模式在 ≥3 页重复后再抽。

## 9. 语义色映射

§7 的「页面里硬编码色板」一直是最高频的存量问题：全仓 `src/**` 现有 **1183 处**（`app/` 737、`components/` 422、其余 24），同一个语义在不同页面用了不同色阶（「正确」有 `emerald-500/600/700` + `green-400/500/600/700`，「警告」有 `amber-400/500/600/700` + `yellow-*`）。本节把状态语义收敛到 `globals.css` 的令牌上，后续按页替换只查这一张表，不再逐页讨论配色。

### 9.1 新增令牌（`my-next-app/src/app/globals.css`）

`@theme inline` 里已映射 `--color-success* / --color-warning* / --color-info*`，写法与既有 `--destructive` 一致，因此 `text-success`、`bg-warning-muted`、`border-info/30`、`ring-success`、`bg-success/10` 全部可直接用（已用 PostCSS + `@tailwindcss/postcss` 实测生成）。

| 令牌                    | 用途                                     | 亮色（`:root` / `[data-theme="zhuoyu"]`）              | 深色（`.dark` / `[data-theme="zhuoyu"].dark`）         |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| `--success`             | 正确、已掌握、成功文字/图标/描边         | `oklch(0.596 0.145 163.225)` = `#009966`（emerald-600） | `oklch(0.765 0.177 163.223)` = `#00d492`（emerald-400） |
| `--success-foreground`  | 落在 `bg-success` 实底上的文字           | `oklch(1 0 0)` = `#ffffff`                             | `oklch(0.17 0 0)` = 近黑（`#00d492` 上必须压深）        |
| `--success-muted`       | 成功态浅底（徽章、提示块、弱强调卡片）   | `oklch(0.95 0.052 163.051)` = `#d0fae5`（emerald-100）  | `oklch(0.262 0.051 172.552)` = `#002c22`（emerald-950） |
| `--warning`             | 待复习、可能过期、注意                   | `oklch(0.666 0.179 58.318)` = `#e17100`（amber-600）    | `oklch(0.828 0.189 84.429)` = `#ffb900`（amber-400）    |
| `--warning-foreground`  | 落在 `bg-warning` 实底上的文字           | `oklch(1 0 0)`                                         | `oklch(0.17 0 0)`                                      |
| `--warning-muted`       | 警告态浅底                               | `oklch(0.962 0.059 95.617)` = `#fef3c6`（amber-100）    | `oklch(0.279 0.077 45.635)` = `#461901`（amber-950）    |
| `--info`                | 中性信息、提示、记忆稳定性等中性指标     | `oklch(0.546 0.245 262.881)` = `#155dfc`（blue-600）    | `oklch(0.707 0.165 254.624)` = `#51a2ff`（blue-400）    |
| `--info-foreground`     | 落在 `bg-info` 实底上的文字              | `oklch(1 0 0)`                                         | `oklch(0.17 0 0)`                                      |
| `--info-muted`          | 信息态浅底                               | `oklch(0.932 0.032 255.585)` = `#dbeafe`（blue-100）    | `oklch(0.282 0.091 267.935)` = `#162456`（blue-950）    |

护眼主题 `[data-theme="eye-care"]` 走的是暖纸底（`#fdfbf7`），不能直接搬 Tailwind 的冷色阶，故单独取暖化值：`--success` `#386e4b` / `#e2ecdf`、`--warning` `#96591f` / `#f0e4d0`、`--info` `#2b6785` / `#dfe9ee`，三者前景均为 `#fdfbf7`。

**取色依据（不是凭感觉挑的）**：现存硬编码里各色最高频的文字色阶正好是 `emerald-600`（14 次，另有 500 级 14 次、700 级 15 次）、`amber-600`（17 次）、`blue-600`（27 次）；深色侧的最高频写法是 `dark:text-amber-400`（18）、`dark:text-blue-400`（14）、`dark:text-green-400`（10）、`dark:text-emerald-400`（5），合计 37 处，所以深色基础色直接取 400 级。浅底则对应 `bg-emerald-100`（12 次）、`bg-amber-500/10`、`bg-blue-50/100`。

**为什么给 `-muted` 而不统一用 `bg-success/10`**：

1. 存量浅底是两种画法 —— `bg-emerald-100`（实色 100 级）与 `bg-emerald-500/10`（500 级 + 透明度），一个 alpha 值对不上两者，替换后会明显变浅或变艳；
2. 深色下存量是 `dark:bg-green-900/30`，用 `bg-success/10` 会得到 400 级 @10%（偏亮偏艳），`bg-success-muted` 才是 950 级那种"深底带一点绿"的观感；
3. `/10` 是叠色，落在渐变卡、`bg-muted` 条纹或图片上会呈现不同结果，`-muted` 是确定的实色，截图对比时不会因底层漂移。

**对比度（诚实记录，避免后面误用）**：亮色下 `text-success` 对白底 3.65:1、`text-warning` 3.20:1、`text-info` 5.25:1；深色下三者对 `#0a0a0a` 均 > 9:1。也就是说亮色的 success/warning **只达到图形/大字门槛（3:1）**——这是存量 `text-emerald-600` / `text-amber-600` 本来就有的水平，不是本次引入的回归。因此：图标、描边、左侧竖条、≥19px 粗体可以用 `text-success` / `text-warning`；12–14px 的彩色小字如要过 AA(4.5:1)，把字色换成 `text-foreground`，颜色留在图标或 2px 竖条上。实底同理：`text-success-foreground` / `text-warning-foreground` 在亮色是白色，压 `bg-success`/`bg-warning` 分别只有 3.65:1 / 3.20:1（与存量 `bg-green-600 text-white` 完全一致，不算回退），实底按钮只承载图标或 ≥19px 粗体标签；`bg-info` + 白字是 5.25:1，可以放正文级文字。

### 9.2 替换对照表（唯一依据）

| 现有写法                                                                                       | 替换为                                                     | 场景                                        |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| `text-emerald-500/600/700`、`text-green-400~700`                                               | `text-success`                                             | 正确、已掌握、成功提示、勾选图标            |
| `bg-emerald-50/100`、`bg-green-50/100`、`bg-green-500/10`（不透明的浅底徽章/提示块）            | `bg-success-muted`                                         | 成功态浅底                                  |
| `bg-emerald-500/10` 叠在渐变/图片/条纹上                                                       | `bg-success/10`                                            | 需要透出底色的浅底                          |
| `border-emerald-*`、`border-green-*`、`border-green-500/20`、`ring-emerald-500`                 | `border-success/30`、`ring-success`                        | 成功态描边/选中环                           |
| `bg-emerald-600/700`、`bg-green-600 hover:bg-green-700` + `text-white`                         | `bg-success text-success-foreground hover:bg-success/90`   | 成功态实底按钮                              |
| `text-amber-*`、`text-yellow-*`、`dark:text-amber-400`                                         | `text-warning`                                             | 待复习、警告、可能过期、题目难度            |
| `bg-amber-50/100`、`bg-yellow-50/100`、`bg-amber-500/10`（不透明浅底）                          | `bg-warning-muted`                                         | 警告态浅底                                  |
| `bg-amber-500/10` 叠色、`border-amber-500/20`                                                  | `bg-warning/10`、`border-warning/20`                       | 警告态叠色边框/底                            |
| `bg-amber-500/600` + `text-white`                                                              | `bg-warning text-warning-foreground`                       | 警告态实底（白字压琥珀仅 3.2:1，只放图标或 ≥19px 粗体；12px 文字改 `bg-warning-muted text-foreground`） |
| `text-blue-*`、`text-indigo-*`、`dark:text-blue-400`                                           | `text-info`                                                | 中性信息、提示、记忆稳定性等中性指标        |
| `bg-blue-50/100`、`bg-blue-500/10`                                                             | `bg-info-muted`                                            | 信息态浅底                                  |
| `bg-blue-600` + `text-white`、`border-blue-500/30`                                             | `bg-info text-info-foreground`、`border-info/30`           | 信息态实底/描边                              |
| `text-red-*`、`text-rose-*`、`dark:text-red-400`                                               | `text-destructive`                                         | 错误、答错、删除、危险操作                  |
| `bg-red-50/100`、`bg-red-500/10`、`border-red-500/20`                                          | `bg-destructive/10`、`border-destructive/20`               | 错误态浅底/描边（`--destructive-muted` 不存在，用透明度） |
| `bg-red-600 hover:bg-red-700`、`shadow-red-500/20`                                             | `bg-destructive hover:bg-destructive/90`、`shadow-destructive/20` | 危险实底按钮                          |
| `bg-slate-*`、`bg-zinc-*`、`bg-neutral-*`、`bg-gray-*`（面板/占位/骨架）                        | `bg-muted`                                                 | 中性面                                      |
| `text-slate-500`、`text-zinc-500`、`text-neutral-400/500`、`text-gray-500`                     | `text-muted-foreground`                                    | 次级说明文字                                |
| `text-neutral-700/800/900`、`text-zinc-700/800/900`（正文主色）                                | `text-foreground`                                          | 正文（**不是** `muted-foreground`）         |
| `border-slate-200`、`border-neutral-200/100`、`divide-neutral-*`                               | `border-border`、`divide-border`                           | 中性分隔线                                  |
| `text-purple-*`、`text-pink-*`、`text-teal-*`、`text-cyan-*`、`text-orange-*`、`text-violet-*`、`text-sky-*`、`text-lime-*`、`text-stone-*` | **先留白，不硬映射**        | 装饰性/学科色/功能标识，逐页判定（见 §9.3 规则 2） |
| `text-fuchsia-*`、`bg-purple-900` 等深底色块                                                   | **先留白**                                                 | 同上；判定为"功能标识色"后进常量文件，不进令牌 |

两条工程口径：

- **深色变体整段删掉**：`text-green-600 dark:text-green-400` → `text-success` 一个类，不要再写 `dark:text-success`（令牌在 `.dark` 下已自动换值，重复写等于把未来的调整钉死）；
- **只改颜色类名**：替换时同一次 diff 不要顺手改间距/字号/圆角，否则截图对比失效（§8 存量收敛规则不变）。

### 9.3 三条规则

1. **不允许新增硬编码色板**。新代码一律用语义令牌；确实没有对应语义时，先在本节加一行映射再写，不要在组件里就地发明颜色。存量按页面分批替换，**每 PR ≤ 3 页**（与 §8 一致）。
2. **学科/分类色不算语义色**。知识点标签、科目角标、图表系列这类"为了区分而取色"的用色保留，但必须集中定义在一个常量文件里（试点时新建 `src/lib/ui/domain-colors.ts`，导出 `SUBJECT_TONES` 之类的映射），组件只允许引用常量名，禁止内联 `text-teal-700`。判定标准：这个颜色的含义会不会随页面语境变化？会 → 装饰色；不会（全站"正确"都是绿）→ 语义令牌。
3. **深浅两套主题都要验**。本机跑不了浏览器时，至少在 PR 里贴 375×812 与 1440×900 各一组、`light` 与 `dark` 各一套，共 4 张对照图（`eye-care` / `zhuoyu` 若涉及该页再补）；验收看三件事：① 同一语义在两张图里是不是同一个颜色；② 深色下没有"白底白字/透明色"；③ diff 里的颜色改动只出现在预期行。跑得了的话优先用 `npm run test:e2e -- --project=layout-guard` 附带的三档截图。

### 9.4 试点工单：`wrong-book`（只列不改）

扫描口径：`my-next-app/src/app/wrong-book/**` 下 `(text|bg|border|from|to|via|ring|fill|stroke|divide|outline|decoration|shadow|accent|caret|placeholder)-(色板)-(色阶)` 的出现次数，`dark:` 前缀的同一次出现只计一次。

| 文件                                    | 次数 | 语义归类（success/warning/info/destructive/装饰） | 可机械替换 | 需人工判断 |
| --------------------------------------- | ---: | ------------------------------------------------- | ---------: | ---------: |
| `components/QuestionDetailPanel.tsx`    |   18 | 9 / 2 / 1 / 6 / 0                                 |         18 |          0 |
| `page.tsx`                              |   11 | 5 / 1 / 0 / 4 / 1                                 |         10 |          1 |
| `components/RecommendedQuestionsDialog.tsx` |  9 | 0 / 0 / 0 / 0 / 9（purple，AI 推荐标识）          |          0 |          9 |
| `components/AddQuestionDialog.tsx`      |    4 | 0 / 0 / 0 / 0 / 4（teal 提示块，待判定→倾向 `info`） |        0 |          4 |
| `components/WrongQuestionCard.tsx`      |    4 | 0 / 1 / 2 / 1 / 0                                 |          4 |          0 |
| `components/FolderTreeView.tsx`         |    2 | 1 / 0 / 0 / 1 / 0                                 |          2 |          0 |
| `components/FolderQuestionList.tsx`     |    2 | 0 / 0 / 0 / 0 / 2（蓝/琥珀纯图标区分）            |          0 |          2 |
| `components/AddToFolderDialog.tsx`      |    1 | 0 / 0 / 1 / 0 / 0                                 |          1 |          0 |
| `components/{TagTreeView,WrongBookSkeleton,QuestionCountPicker}.tsx`、`hooks/use-wrong-book-controller.ts` | 0 | —                        |          0 |          0 |
| **合计**                                | **51** | success 15 / warning 4 / info 4 / destructive 12 / 装饰 16 | **35** | **16** |

人工判断那一栏的 16 处按结论分三类，替换 PR 里必须写明归属：

- **9 处 purple**（`RecommendedQuestionsDialog`）：AI 推荐是跨页功能标识，若其他页也用 purple 表示同一功能，进 `domain-colors.ts` 的 `AI_ACCENT`；否则降级为 `info`。
- **4 处 teal**（`AddQuestionDialog:329-330` 的提示块）：语义上就是"提示信息"，换成
  `bg-info-muted` + `text-foreground` + `border-info/20`，**正文用 `text-foreground`**、
  只有图标用 `text-info` —— `text-info` 压 `bg-info-muted` 只有 ~4.3:1，不到正文 AA。
- **3 处纯装饰**（`page.tsx:138` 错题本红皮书脊图标、`FolderQuestionList` 的蓝文件夹/琥珀层叠图标）：保留色相，但搬进 `domain-colors.ts` 命名常量。

机械替换的 35 处可直接按 §9.2 走，优先级：`QuestionDetailPanel`（18）+ `page.tsx`（10）+ `WrongQuestionCard`（4）= 32 处，一个 PR 就能吃掉 63%，是最划算的试点。

### 9.5 已知风险 / 顺带发现

- **`[data-theme="..."]` 主题块目前是死 CSS**：`layout.tsx` 的 `ThemeProvider` 用的是 `attribute="class"`，`themes={["light","dark","eye-care","zhuoyu"]}`，next-themes 只会给 `<html>` 加 `class="zhuoyu"` / `class="eye-care"`，而 `globals.css` 里写的是 `[data-theme="zhuoyu"]`、`[data-theme="zhuoyu"].dark`、`[data-theme="eye-care"]`，永远匹配不上 —— 现在切到护眼/琢玉主题，实际看到的还是 `:root` 亮色。本次仍把 5 个块（`:root`、`.dark`、`zhuoyu` 亮/暗、`eye-care`）全部补齐，选择器修好后令牌直接生效；**修选择器是另一张单**（`[data-theme=...]` → `.zhuoyu` / `.eye-care`，或把 `attribute` 改成 `data-theme`），不在本次改动内。
- **success 与 primary 同色系**：`--primary` 是翠玉绿（hue 150），`--success` 是 emerald（hue 163），在亮色下肉眼接近。约束：`--success` 只用于**状态**，不用于按钮、链接、Tab 选中态；这些仍然用 `--primary`。反过来也不要为了"更亮"把状态色写成 `primary`。
- **`Badge` 的 `success` / `warning` 变体是唯一的语义入口**，内部还是 `bg-green-500/10 text-green-600 dark:text-green-400` / `bg-yellow-500/10 ...`（`src/components/ui/badge.tsx:18-21`）。
  改成 `bg-success-muted text-foreground border-success/30`（`warning` 同理），**文字用 `text-foreground`**：
  彩色小字压浅底只有 3.2–3.7:1，过不了 AA；语义靠底色 + 描边 + 可选的小圆点表达。
  一处改动能让全站徽章跟上，再逐页收组件内的自定义徽章。
