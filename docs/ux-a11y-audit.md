# 前端可用性与无障碍审计（2026-11-17）

来源：`ui-ux-pro-max` 技能（MIT，`~/.config/opencode/skills/ui-ux-pro-max/`）的规则库，
按「能机器测 / 只能读代码判断」拆成两条通道各审一遍。**本文是审计当时的原始记录，只在这里更新数字与结论修正，
修复过程见 [`engineering-plan.md`](./engineering-plan.md) §M6。**

> **修复进度（2026-11-17）**：批次 A 全部完成（IME / 热区 / 错题本失败态 / 删文件夹确认 /
> 答题写库静默 / 底部安全区）；批次 B 的 `label`、`focus-states`、`live region` 已完成，
> **`B2`（自建浮层换 Radix）与 `B5`（交互类 45 → <10）等 T-12 滚动模型归一**；批次 C 未开始。
> 静态基线已 **96 → 55**（`label` 42 → 1，剩的 1 条是 forwardRef 误报，见 §2）。

结论先行：

| 通道       | 覆盖                                  | 结果                                     | 可复现                        |
| ---------- | ------------------------------------- | ---------------------------------------- | ----------------------------- |
| A 静态扫描 | 34 条 `jsx-a11y` 规则（34 启用/3 关） | **96 条** → 现 **55 条**（`label` 42→1） | `node scripts/audit-a11y.cjs` |
| B 人工核对 | 9 条「静态测不到」的交互规则          | **65 处** / 9 条规则，P1 7               | 本文第 3 节逐条 `file:line`   |

三类**真正会伤到用户**的问题（其余是打磨项）：

1. **中文输入法按 Enter 提交半截输入** —— 13 处显式 Enter handler，全仓 `isComposing` **0 处**；
2. **加载失败被渲染成"太棒了！暂无错题"** —— 接口挂了却显示庆祝式空态；
3. **错题本删文件夹一次点击直接删**，无确认。

## 1. 方法

**为什么要两条通道**：`eslint-plugin-jsx-a11y` 只看语法树（有没有 `alt`、`aria-*` 是否合法、`label` 有没有关联控件），
它看不见「Enter 期间输入法是否在选词」「固定导航盖住了最后一次滚动」「失败态被写成了空态」。
反过来人工审计看不了 269 个文件里的 `aria-*` 拼写。所以两条各管一段，**不重叠**。

**判断 0 命中是否可信**：`0` 有两种含义 —— 干净，或者规则根本没生效。
本轮所有关键 `0` 都做了证伪（往扫描范围里塞一个必定违规的探针文件，确认命中，再删掉）：

- `alt-text` 原本恒为 0，因为配置缺 `settings['jsx-a11y'].components`，`next/image` 的 `<Image>` 对规则完全不可见。
  补上 `{ Image: 'img' }` 后用 A/B 两组配置对比同一个探针文件：有映射时 `<Image>` 无 `alt` **命中**，无映射时**不命中**；
  同一探针里 `alt={...}` 与 `ImageIcon`（lucide 图标）两配置下都不命中 → 映射生效且不误伤。
  补完后存量计数仍是 96（6 处 `<Image>` 都写了 `alt`），**现在的 0 才是"检查过且清白"**。
- 静态脚本崩溃不当通过：ESLint 非 0/1 退出、JSON 解析失败、空报告、`fatal` 解析错误一律退出码 **2**。
- 人工通道每条「查了没违规」都要给出**查了哪些位置**（本文第 3 节各条末尾），沉默不算清白。

## 2. 通道 A：静态扫描（96 条）

```bash
cd my-next-app
node scripts/audit-a11y.cjs            # 报告（连跑两次逐字节一致）
node scripts/audit-a11y.cjs --json     # 明细：ruleId / file / line / column / message
node scripts/audit-a11y.cjs --update   # 收紧基线（只许持平或下降）
```

| 规则                                      | 数量 | 级别 | 代表位置                                                   | 判定             |
| ----------------------------------------- | ---: | ---- | ---------------------------------------------------------- | ---------------- |
| `jsx-a11y/label-has-associated-control`   |   42 | P1   | `src/app/admin/components/ConfigManager/ConfigForm.tsx:43` | **基本是真问题** |
| `jsx-a11y/no-static-element-interactions` |   23 | P2   | `src/app/admin/_components/admin-layout-shell.tsx:117`     | 半误报           |
| `jsx-a11y/click-events-have-key-events`   |   22 | P1   | 同上（同一行的另一面）                                     | 半误报           |
| `jsx-a11y/no-autofocus`                   |    9 | P2   | `src/app/admin/components/AccessLock.tsx:44`               | 近似误报         |

分布：`src/app/**` 69 条、`src/components/**` 27 条。`label-has-associated-control` 集中在
`ConfigForm`(9)、`AIGenerateModal`(6)、`PreviewStep`(6)、`KnowledgeModal`(5)、`practice/setup`(4)。

**逐条判定（为什么不是照单全修）**：

- `click-events-have-key-events` 22 条与 `no-static-element-interactions` 23 条高度重合（同 16 个文件、多数同一行），
  绝大多数是**遮罩/卡片外层 `onClick`**。典型 `admin-layout-shell.tsx:117` 是移动端遮罩点关闭，
  该文件**无 `Escape`/`onKeyDown` 处理 → 键盘用户无法关闭，是真问题**；
  而 `HistoryCardItem.tsx:85` 的外层 `div` 内含 `<button>`（129/180 行，且 `stopPropagation`），
  键盘用户可经内部按钮完成同一操作 → **部分误报**。
- `no-autofocus` 9 条全在 Dialog/Modal 的输入框。弹窗内自动聚焦是焦点管理的标准做法 → **低价值**，不建议改。
- `label-has-associated-control` **不是误报**：`ConfigForm.tsx:43` 的 `<label>` 与 `<input>` 平级，无 `htmlFor`/`id`；
  全仓已有 30 处正确写法，说明团队知道怎么写。唯一确凿误报是 `src/components/ui/label.tsx:1`
  —— `React.forwardRef` 包装把 `htmlFor` 透传给调用方，规则看不到调用点。

**覆盖不到的地方（已记录，不在本轮修）**：`no-static-element-interactions` 是启发式规则，
只能看见"元素上有 onClick"，判断不了"这个元素是否真的承担交互语义"；
`label-has-associated-control` 看不到 forwardRef 包装层。这两类命中必须人工过一遍，不能当成指标直接修到 0。

## 3. 通道 B：静态测不到的 9 条规则（65 处）

| #   | 规则                                    | 违规 | 最高级 | 最严重位置                                                  |
| --- | --------------------------------------- | ---: | ------ | ----------------------------------------------------------- |
| 1   | `ime-composition-enter`                 |   13 | **P1** | `src/components/chat/ChatInput.tsx:99`                      |
| 2   | `focus-not-obscured`                    |   10 | P2     | `src/components/practice/ExitConfirmModal.tsx:19`           |
| 3   | `focus-states`                          |  8+1 | P2     | `src/app/history/components/HistoryCardItem.tsx:117`        |
| 4   | `empty-states`                          |    4 | **P1** | `src/app/wrong-book/hooks/use-wrong-book-controller.ts:115` |
| 5   | `error-recovery` / `submit-feedback`    |    7 | **P1** | `src/app/practice/hooks/use-practice-controller.tsx:317`    |
| 6   | `confirmation-dialogs`                  |    6 | **P1** | `src/app/wrong-book/hooks/use-wrong-book-controller.ts:428` |
| 7   | `contextual-live-badge-updates`         |    5 | P2     | `src/components/chat/MessageList.tsx:56`                    |
| 8   | `web-target-size` / `touch-target-size` |    8 | **P1** | `src/app/wrong-book/components/WrongQuestionCard.tsx:61`    |
| 9   | `user-freedom`（escape-routes）         |    4 | P2     | `src/app/recall/RecallSession.tsx:42`                       |

### 3.1 `ime-composition-enter` —— 13 处，全仓零防护

`grep -rn "isComposing\|onComposition" src` → **0 处**（唯一的 `isComposing` 字样是
`components/editor/icons/magic.tsx:23` 的 SVG path 数据）。也就是说**没有任何一处**处理过输入法组合态。

中文用户用拼音输入时，按 Enter 是"确认候选词"，不是"提交"。没有 `isComposing` 守卫的 Enter handler
会把**半截拼音**当内容提交。P1 三处：

| 位置                                           | 现象                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/chat/ChatInput.tsx:99-104`         | 主聊天框，`Enter && !shiftKey` → `preventDefault()` 后直接 `handleSubmit()`。占位文案还鼓励 "Shift+Enter 换行"（多行中文输入），踩中率最高 |
| `components/practice/PracticeCard.tsx:311-317` | 填空题输入框，Enter 直接触发判分 → 用拼音答"待定"会提交 "dai" 并判错                                                                       |
| `components/notes/TagSelector.tsx:153`         | 建标签时 Enter 直接创建 → 得到名为 "jiao" 的标签                                                                                           |

P2/P3 另有 10 处（`AddToFolderDialog.tsx:109`、`KnowledgeModal.tsx:125` 会**触发付费 AI 调用**、
`ChatSidebar.tsx:115`、`HistoryCardItem.tsx:120`、`FolderTreeView.tsx:237`、`QuestionPicker.tsx:77`、
`page-jump-input.tsx:40`、`create-api-key-dialog.tsx:82`、`QuestionManager.tsx:128`、`ActivityList.tsx:118`）。

修法一行：`if (e.nativeEvent.isComposing) return;` —— **必须放在 `preventDefault()` 之前**，
否则 IME 的确认动作被吞掉，选词也会失效。
（另有 10 处原生 `<form onSubmit>`，现代浏览器在组合态一般会抑制隐式提交，记为观察项，本轮不动。）

### 3.2 `focus-not-obscured` —— 10 处

Radix 弹窗（`AddQuestionDialog`、`AddToFolderDialog`、`CardEditorDialog`、`DeleteTextbookButton`）全部合规：
`role="dialog"` + 焦点陷阱 + Esc 都由 Radix 提供。

不合规的是**自建 `fixed inset-0` 浮层**，8 处缺 dialog 语义/焦点陷阱/Esc：
`ExitConfirmModal.tsx:19`、`KnowledgeModal.tsx:82`（且不锁 body 滚动）、`AIGenerateModal.tsx:114`、
`KnowledgeCardExpanded.tsx:38`、`StudyModeOverlay.tsx:40`、`HistoryCardExpanded.tsx:126`、
`ImportFenbiModal.tsx:135`、`QuestionPicker.tsx:89`。Tab 会穿到遮罩后面的内容上。

**全局底部预留差 8px，且没算安全区**（`app/layout.tsx:118`）：

```
MobileNav 关 `bottom-[calc(1.5rem+env(safe-area-inset-bottom))]` + `h-16`  →  88px + 安全区
main 只有 `pb-20`                                                          →  80px
```

窄屏差 8px；iPhone 这类 `safe-area-inset-bottom: 34px` 的机器差 **42px**：
最后一行（练习页"确认提交"、笔记列表末项）被导航压住，Tab 聚焦时 `scrollIntoView` 也不计算固定层高度。
`app/practice/setup/page.tsx:165` 的固定底栏同样只 `pb-20`（88px 的栏）。

修法必须把安全区**一起算进去**，否则换成固定值仍然差：

```css
/* 预留 = 导航 88px + 安全区 + 8px 呼吸 */
main {
  padding-bottom: calc(6rem + env(safe-area-inset-bottom));
} /* 96px + inset */
main {
  scroll-padding-bottom: calc(6rem + env(safe-area-inset-bottom));
}
@media (min-width: 768px) {
  main {
    padding-bottom: 0;
    scroll-padding-bottom: 0;
  }
}
```

（全局 CSS 目前无 `scroll-padding`。只写 `pb-24` + `96px` 在 `inset=34px` 时仍差 26px —— 这是评审指出的复核点。）

`app/practice/HeaderProgressBar.tsx:48` 是另一个形态：`sticky top-16`，但 `app/layout.tsx:5` 已把 `Navbar` 注释掉，
顶部空出 64px 无对应元素 —— 改动前先确认是否还有路由在用 Navbar。

做得对的地方（可作范式）：`app/settings/page.tsx:288`（把保存按钮抬到 `6.5rem` 并写注释说明原因）、
`components/layout/bottom-bar-slot.tsx`（页面登记底栏则隐藏 MobileNav）。

### 3.3 `focus-states` —— 8 处 + 1 处上游

全仓 `outline-none` 63 处：34 处在 `components/ui/*`（上游，均配 `ring` 或 `aria-selected` 背景）、
21 处配了 `focus:ring-*`、**8 处删了焦点环且无替代**（`focus-visible:ring-*` 全仓 59 处，说明惯例是有的）。

无替代的 8 处：`HistoryCardItem.tsx:117`（会话重命名，`border-b-2 border-primary` 是**静态**的，聚焦前后无差别）、
`NotePageClient.tsx:90`（笔记大标题）、`MindmapEditorClient.tsx:123`、`:170`、`NoteEditor.tsx:130`、
`link-selector.tsx:85`、`SimpleMindMapViewer.tsx:109`、`PromptEditor.tsx:56`。
上游 1 处：`components/ui/command.tsx:49`（cmdk 输入框，外层无 `focus-within` 环）。

### 3.3.1 对比度实测（1.4.11 是 **AA**，要求 3:1）

> 这一条我最初按 AAA 处理，是错的：`focus-appearance`（AAA）只额外要求面积与相邻状态对比，
> **3:1 本身属于 1.4.11 非文本对比度，是 AA**。修复时补了实测 —— 从 `globals.css` 的
> `oklch()` 换算出实色（OKLab → 线性 sRGB → 相对亮度），再算 `(L1+0.05)/(L2+0.05)`：

| token      | 亮（vs `--background`） | 暗     | 护眼   | 判定                                       |
| ---------- | ----------------------- | ------ | ------ | ------------------------------------------ |
| `--ring`   | 6.49:1                  | 4.39:1 | 3.93:1 | **达标**（最差 3.42:1，落在 `--muted` 底） |
| `--border` | 1.29:1                  | 1.36:1 | 1.44:1 | **不能当焦点环**                           |
| `--muted`  | 1.08:1                  | 1.15:1 | 1.15:1 | **不能当焦点环**                           |

选 `--ring`（亮/暗下 `--ring ≡ --primary`，就是既有翠玉绿惯例）。这条数字排掉了一个常见做法：
拿 `--border` 当焦点环"看起来有指示"，实际只有 1.3:1。

**8 处里实际修了 7 处**：`SimpleMindMapViewer.tsx:109` 是**误判** —— 那个 div 渲染出的 DOM
没有任何 `tabindex`，`simple-mind-map` 全库也没有，键盘快捷键绑在 `window` 上，
它根本拿不到焦点，加 ring 是死代码。真正的缺口在库动态插入的 `contenteditable=true`
编辑元素（有焦点、无指示），属设计决策，留给下一批。

### 3.4 `empty-states` —— 4 处，其中 1 处 P1

大部分列表页合规（`history/page.tsx:387` 是标准范式：图标 + 文案 + CTA，且区分 `loadError` 与空数据）。
问题集中在**把失败渲染成空态**：

| 位置                                                               | 现象                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/wrong-book/hooks/use-wrong-book-controller.ts:115-132` **P1** | `loadData()` 无 `try/catch`：5 个 action 任一 **throw** → `setIsLoading(false)` 被跳过 → **永远转圈**；任一返回 `{success:false}`（不抛错）→ 全部 `\|\| []` / `\|\| {total:0}` → 页面显示 **"太棒了！暂无错题"**。用户以为"我没错题"，实际是接口挂了 |
| `app/knowledge/hooks/useKnowledgeCards.ts:42-54`                   | `useQuery` 未取 `isError`，加载失败与真·空库都渲染"未找到匹配的卡片 / 尝试改变搜索词或切换分类"                                                                                                                                                      |
| `app/practice/PracticeClient.tsx:31-60`                            | 只有 `loading` 分支，无 `error`/`empty` 分支。初始化失败只 `toast.error` 后 `return`，页面剩一块空白画布 + `0 / 0`，toast 消失后无从下手                                                                                                             |
| `app/notes/NoteSidebar.tsx:136`                                    | `"暂无笔记"` 纯文本，无 CTA                                                                                                                                                                                                                          |

### 3.5 `error-recovery` / `submit-feedback` —— 7 处，其中 1 处 P1

仓库已有正确的抽象：`components/ui/error-state.tsx:13` 把 `onRetry` 设为**必填项**，
从类型上强制给出恢复路径，并在 `:36` 挂 `role="alert"`。但它没被学生端主流程采用。

| 位置                                                        | 现象                                                                                                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `app/practice/hooks/use-practice-controller.tsx:317` **P1** | `submitAnswerAction(...).catch(console.error)` —— **写库失败完全静默**：UI 显示"已答"，SRS/统计没落库，用户永远不会知道                   |
| `use-practice-controller.tsx:173/179/186`                   | 三条初始化失败路径只有 toast + `return`，无重试入口（见 3.4）                                                                             |
| `useKnowledgeCards.ts:84`                                   | 删除失败只 `"删除失败"`，无原因无重试                                                                                                     |
| `NotePageClient.tsx:59-68`                                  | 防抖自动保存失败 `"保存失败"`：不说哪段没存、无重试、无"未保存"角标；`await updateNoteAction` 抛错时**连 toast 都没有**（无 `try/catch`） |
| `use-wrong-book-controller.ts:423/439`                      | `"重命名失败"` / `"删除失败"`，无原因                                                                                                     |
| `MindmapSidebar.tsx:34/56`                                  | `"请求失败"`，无 cause                                                                                                                    |
| `HistoryCardExpanded.tsx:107`                               | AI 分析失败无重试（付费调用，更该给重试）                                                                                                 |

已复用的正确位置：`chat/page.tsx:266`、`profile/page.tsx:83`、`pricing/page.tsx:125`、
`history/page.tsx:375`、`recall/RecallSession.tsx:84`、以及全部 admin 页。
聊天流式失败有专门的错误条 + "重试"（`MessageList.tsx:67-84`），逻辑正确。

### 3.6 `confirmation-dialogs` —— 6 处，其中 1 处 P1

高危删除基本都有二次确认，有的写得很好（`DeleteTextbookButton.tsx:67` 点了书名 + 列出会删的章节/图片/AI 索引 + "无法恢复"；
`history/page.tsx:122` 连"掌握度不受影响"都写了）。

| 位置                                                                 | 现象                                                                                                                                                       |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use-wrong-book-controller.ts:428` + `FolderTreeView.tsx:281` **P1** | 文件夹下拉菜单里的"删除"**一次点击直接删**，无确认。学生端错题本，误触即丢组织结构                                                                         |
| `ChatSidebar.tsx:171`                                                | `confirm("确定要删除这个对话吗？")` —— 不说哪个会话、不说不可恢复，且原生 `confirm` 丢焦点与样式；悬停行内它与"重命名"相邻（两枚 14px 图标、间距 `p-1.5`） |
| `chat/page.tsx:139` + `ChatMessage.tsx:265`                          | 单条消息删除无确认、无撤销，看起来像永久删除（实际只在本地 state，刷新回来）                                                                               |
| `useKnowledgeCards.ts:93`、`NoteSidebar.tsx:82`                      | `confirm` 文案不带标题                                                                                                                                     |

登出无确认（`UserSection.tsx:45`、`Navbar.tsx:71`、`admin-layout-shell.tsx:44`）记为观察项：可重新登录挽回，
且桌面侧栏已把登出按钮用 `text-destructive` 与导航分离。

### 3.7 `contextual-live-badge-updates` —— 5 处

全仓 `aria-live` / `role="status"` 仅 1 处（`app/recall/components/JudgeScreen.tsx:198`），`role="alert"` 仅 1 处（`error-state.tsx:36`）。

好消息：`toast` 走 sonner，上游自带 `aria-live="polite"` 容器（已核 `node_modules/sonner/dist/index.js`），
所以经 toast 播报的状态变化（"回答正确！下次复习 3 天后"）屏幕阅读器能听到。缺口在**只有视觉变化**的地方：

- `components/chat/MessageList.tsx:56` **P2**：AI 流式逐字追加无 `aria-live`，"思考中"也是纯视觉 → 屏读用户按发送后毫无反馈；
- `app/practice/PracticeClient.tsx:48` **P2**：答题后整屏换成下一题，**焦点不移动、无 live 区域** → 不知道题变了、也不知道对错（对错只在一次性 toast 里）；
- `app/wrong-book/page.tsx:283`、`KnowledgeHeader.tsx` 的计数变化无播报；
- `login/page.tsx:81`、`register/page.tsx:87` 的失败提示条是普通 `div`，无 `role="alert"`。

范式：`JudgeScreen.tsx:196-215` —— `role="status"` + 主动 `scrollIntoView({block:"nearest"})` +
"不自动跳转，先让 `nextReviewText` 被看到"。

### 3.8 `web-target-size` / `touch-target-size` —— 8 处

WCAG 2.2 AA 硬线是 **24×24 CSS px**（触屏惯例 44pt / 48dp）。低于 24 的有 3 处：

| 位置                                                        | 实测      | 说明                                                                              |
| ----------------------------------------------------------- | --------- | --------------------------------------------------------------------------------- |
| `app/wrong-book/components/WrongQuestionCard.tsx:61` **P1** | **20×20** | 错题本列表的**主交互**（勾选→批量练），`<button>` 无 padding，内含 `w-5 h-5` 图标 |
| `app/wrong-book/components/FolderTreeView.tsx:270`          | **14×14** | 文件夹"更多"；`:242`/`:250` 的确认/取消同为 14×14                                 |
| `app/wrong-book/components/AddToFolderDialog.tsx:114`       | **20×20** | 颜色色板 `w-5 h-5`，五个连排 `gap-2`，易误选                                      |

其余 5 处 ≥24 但远低于 44（`HistoryCardItem.tsx:129` 22px、`ChatSidebar.tsx:163/175` 26px、
`HeaderProgressBar.tsx:94` 28px、`FeedbackDialog.tsx:75` 28px、`dashboard/page.tsx:145` 24px 压线）。

修法：`p-2.5 -m-2.5` 扩大热区**不改视觉**，或用 `min-h-11 min-w-11`。

**但色板那处不能照搬**：五个 `w-5 h-5`（20px）色块以 `gap-2`（8px）连排，
若各自 `p-2.5 -m-2.5` 把热区扩到 40px，相邻热区会**重叠 12px** —— 点交错处会选到另一个颜色，
比小热区更糟。相邻热区不重叠的条件是「热区宽度 ≤ 视觉宽度 + 间距」：

- 保持 20px 视觉：热区最多 28px（各边 4px），仍低于 44 → 只能靠**加大间距**：`gap-6`（24px）后
  热区可到 44px 且刚好相接；
- 或改 **44px 格 + 20px 圆点**（`h-11 w-11` + `gap-1`，pitch 48px），一次到位；
- 或换成 `<input type="radio">` + `<label>` 包 44px 容器，语义也一并修好。

`WrongQuestionCard` 与 `FolderTreeView` 是孤立按钮（无相邻），`p-2.5 -m-2.5` 可用。
正面例子：`QuestionManager.tsx:549` 的 `h-11 w-11 sm:h-8 sm:w-8`（移动端放大、桌面收紧）、
`practice/PracticeCard.tsx:350` 选项 `min-h-[48px]`。

### 3.9 `user-freedom`（escape-routes）—— 4 处

| 位置                                                          | 现象                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/recall/RecallSession.tsx:17-42` **P2**                   | 作答/判分态**没有任何退出入口**：`usePageBottomBar` 会隐藏 MobileNav（`MobileNav.tsx:37`），`ActionBar` 只放主操作。桌面可靠侧栏离开，**移动端只能靠浏览器返回**（PWA/WebView 可能无路可走）。旁边的"归档"语义是丢卡，不是退出 |
| `KnowledgeCardExpanded.tsx:38`、`HistoryCardExpanded.tsx:126` | 全屏浮层无 Esc                                                                                                                                                                                                                 |
| `ExitConfirmModal.tsx:19`                                     | 有"取消"按钮，但 Esc 无效                                                                                                                                                                                                      |
| `useStudyMode.ts:44` 附注                                     | 全局 `Space` `preventDefault()` → 学习模式内聚焦的按钮**无法用空格激活**                                                                                                                                                       |

做得对：练习页三重退路（X 退出 + 确认框说明"进度已自动保存" + `beforeunload` 兜住误关标签页）、
PDF 导入步骤可回退、OCR 可随时清空重来。

## 4. P1 清单与修复顺序

按「影响面 ÷ 改动量」排，前三条加起来不到 20 行：

| 序  | 问题                                                                             | 位置                                                                                      | 改法                                                                | 验证                                                                                     |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | 中文 IME 提交半截输入（3 处主路径）                                              | `ChatInput.tsx:99`、`PracticeCard.tsx:311`、`TagSelector.tsx:153`                         | `if (e.nativeEvent.isComposing) return;` 放在 `preventDefault()` 前 | 单测用合成事件 `isComposing: true` 断言未提交；E2E 用 `page.keyboard` 难以模拟，改用 RTL |
| 2   | 触屏主交互 20×20                                                                 | `WrongQuestionCard.tsx:61`、`FolderTreeView.tsx:242/250/270`、`AddToFolderDialog.tsx:114` | `p-2.5 -m-2.5`（不改视觉）                                          | 渲染后断言可点区域 ≥24px（`getBoundingClientRect`）                                      |
| 3   | 失败被渲染成"太棒了！暂无错题"                                                   | `use-wrong-book-controller.ts:115`                                                        | `try/catch/finally` + `loadError` 状态走 `ErrorState`               | 契约测试：让 action 返回 `{success:false}` 与 throw 两种，断言渲染 error 而非空态        |
| 4   | 删文件夹零确认                                                                   | `use-wrong-book-controller.ts:428` + `FolderTreeView.tsx:281`                             | 换 `AlertDialog`，标题带文件夹名与题量                              | 用例：点删除后先出现确认框，取消不调用 action                                            |
| 5   | 答题写库失败静默                                                                 | `use-practice-controller.tsx:317`                                                         | `.catch` 里 `toast.error` + 保留 payload 重试                       | 用例：mock action reject，断言出现可重试提示                                             |
| 6   | `label` 无关联控件（42 条）                                                      | 见第 2 节                                                                                 | 补 `htmlFor`/`id` 或 `<Label htmlFor>`                              | 静态计数降到 42 以下才 `--update`                                                        |
| 7   | 遮罩层 `onClick` 无 Esc/键盘路径（真问题集中在 `admin-layout-shell.tsx:117` 等） | 见第 2 节                                                                                 | 补 `Escape` 或换成 `<button>`/Radix                                 | 同上，逐条降                                                                             |

## 5. 门禁

`scripts/audit-a11y.cjs` + `eslint.a11y.config.mjs` + `a11y-baseline.json` 已就绪，**棘轮语义与 `lint:ci` 一致**：
某规则数量超基线、或出现基线外规则、或总数超基线 → 退出码 1；`--update` 只许持平或下降；
运行异常（ESLint 崩溃、JSON 解析失败、空报告）→ 退出码 **2**，不当通过。

**尚未接入 `npm run verify`** —— 是否进闸门需要一个决策：
96 条里约一半是 P2/误报，直接进 `verify` 会让「新写一个 div onClick」立刻挡合入。
两个选项见 `decisions.md`（2026-11-17 · 前端可用性审计）：接 verify，或暂时只作审计工具手动跑。

## 6. 明确不做

| 不做                           | 理由                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 把 96 条静态命中修到 0         | `no-static-element-interactions`(23) + `click-events-have-key-events`(22) 多为遮罩/卡片外层浮起事件，机械改成 `role="button"` 会引入伪语义   |
| 给所有 Dialog 补手写焦点陷阱   | `components/ui/*` 已有 Radix；自建浮层应**换用** `dialog.tsx`/`alert-dialog.tsx`，而不是再写一套                                             |
| 全局 `focus:ring-1` 提升到 3:1 | **不能按这个理由不做**：1.4.11 非文本对比度是 **AA**，焦点指示同样适用。当前状态是「未实测」，不是「已满足」；要真正关闭得先量一次实际对比度 | 假设 AAA-only 而跳过：会把 AA 违规留在账上 |
| 给每条 toast 加 `aria-live`    | sonner 上游已有 polite 区域，重复包裹会导致重复播报                                                                                          |
