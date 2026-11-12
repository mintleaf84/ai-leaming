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
- 覆盖：10 条路由（`/login` + 9 个登录后主路由）× 3 档视口（375×812 / 768×1024 / 1440×900）= 30 条用例，外加 1 条 `/wrong-book`「选中题目后」专项（其操作栏是条件渲染，默认状态不渲染，只用 375 视口跑一次）。

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
| 页面里硬编码色板（存量 794 处）                | `bg-primary`、`text-destructive`、`text-muted-foreground`、`Badge variant` |
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

> 状态：spec 与 CI job（`ui-guard`）已接入，31 条用例。`ui-guard` 现阶段 `continue-on-error`（存量溢出未清完），
> 清完存量后改为阻断。§6.2 可点尺寸与 §6.4 表单双列目前是**报告模式**（annotation + `console.warn`），
> 不计入用例结果。在那之前，改动布局的 PR 仍需在本地/CI 报告里确认无新增溢出。

不为「以后好复用」提前抽 `PageShell` 或引入 Storybook —— 先把类名统一，同一模式在 ≥3 页重复后再抽。
