# 依赖安全审计台账

> 生成时间：2026-11-12（`cd my-next-app && npm audit --json`）
> 门禁：CI 的 `npm audit --audit-level=high` 只要出现 **high / critical** 就直接失败。

## 现状

| 级别     | 数量   |
| -------- | ------ |
| critical | 0      |
| high     | 0      |
| moderate | 58     |
| low      | 7      |
| **合计** | **65** |

`npm audit fix`（非破坏模式）**没有任何可修项**：全部需要 major 升级或依赖上游发布。
所以这里不做批量升级，而是逐条判断"是否需要现在动"。

## 为什么 58 个 moderate 不能简单当成 58 个问题

审计按**包**计数，而一个 advisory 会传染整条依赖链。实际只有 **8 条 advisory**：

| 级别     | Advisory                                              | 影响包                                 | 我们装的版本                                                                                       | 结论                                                                                                        |
| -------- | ----------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| moderate | Tiptap `mergeAttributes()` 原型污染 → 可执行 DOM 属性 | 28 个 `@tiptap/*`                      | 2.27.3                                                                                             | **受影响的真实风险**，但修复要求 ≥3.30.4（跨大版本），且 `novel@1.0.2` 依赖 tiptap 2.x，**被上游锁死**      |
| moderate | esbuild 开发服务器可被任意站点读取响应                | 1                                      | 顶层 0.25.12 不受影响；受影响的是 `@esbuild-kit/core-utils` 里的 0.18.20（`drizzle-kit` 的旧依赖） | 仅 `next dev` / 构建期，生产不加载                                                                          |
| moderate | glob `AbortSignal` 取消绕过                           | 1（`@serwist/next` 链）                | 9–14.0.1                                                                                           | 构建期（Service Worker 打包），非运行时入口                                                                 |
| moderate | minimatch `globparts` 放大导致 DoS                    | 1（`webdav` 链）                       | 7–11.0.0                                                                                           | 仅 WebDAV 备份路径，输入来自管理员配置                                                                      |
| moderate | PostCSS 扁平选择器解析 CPU 耗尽                       | 1（`@tailwindcss/typography` 链）      | <6.1.5                                                                                             | 构建期 CSS 处理                                                                                             |
| moderate | uuid v3/v5/v6 传入 `buf` 时越界                       | 1（`simple-mind-map` 链）              | 9.x                                                                                                | 我们只用 v4（无 `buf` 参数），**实际不可达**                                                                |
| low      | KaTeX 原型污染可绕过 `trust` 限制                     | 1（`markmap-lib` / `rehype-katex` 链） | 0.16.47                                                                                            | 修复要 0.18.2，而所有上游都声明 `katex ^0.16`，强升需 `overrides` 且有渲染回归风险                          |
| low      | Quill HTML 导出 XSS                                   | 1（`simple-mind-map` 链）              | 2.0.3                                                                                              | `simple-mind-map` 声明 `^2.0.3`，**quill 一发布 2.0.4 就能直接升**；当前 npm 上最新仍是 2.0.3，故暂时无修复 |

## 处理策略

1. **high / critical = 0**，这是硬线，已由 CI 守住；一旦出现，当次 PR 必须修。
2. **moderate / low 按"可达性"而不是按数量处理**：
   - 构建期 / dev-only（esbuild、glob、postcss、drizzle-kit、eslint 链）→ 接受，跟随上游 minor 升级即可；
   - 代码路径不可达（uuid v3/v5/v6 的 `buf`）→ 接受；
   - 需要管理员输入才能触发（minimatch / WebDAV）→ 接受，风险面是内部管理端。
3. **被上游锁死的两条**（Tiptap 2.x、Quill 2.0.3）不单独 fork：
   - Tiptap：等 `novel` 支持 3.x，或评估替换掉 `novel` 后整体升到 3.30.4+；
   - Quill：等 `simple-mind-map` 放开 `^2.0.3`。
     这两条记在下方"待跟进"，每季度复核一次。
4. **不做** `npm audit fix --force`：它会把 `simple-mind-map` 降到 0.7.1 等旧版本，
   属于用"看起来干净的报告"换真实的回归风险。

## 待跟进

| 项                   | 触发条件                                                    | 动作                                            |
| -------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Tiptap 2.x → 3.30.4+ | `novel` 发布支持 tiptap 3 的版本，或决定弃用 `novel`        | 升 tiptap 全家桶，跑编辑器相关 E2E              |
| Quill 2.0.4+         | Quill 发布修复版本（`^2.0.3` 已允许 2.0.4，不必等上游放宽） | 发布后 `npm update quill` 并验证思维导图导出    |
| KaTeX 0.18+          | 上游把 `^0.16` 放宽                                         | 跟随升级，或用 `overrides` + 跑思维导图渲染用例 |

## 自动化

`.github/dependabot.yml`：

- npm（`/my-next-app`）每周一次，安全更新单独分组，最多 3 个 PR；
- GitHub Actions 每月一次；
- **版本更新只走 minor/patch**；major 需要单独适配，按包逐个登记在 `ignore` 里
  （`ai` / `@ai-sdk/*` / `framer-motion` / `lucide-react` / `better-sqlite3` / `ts-fsrs` /
  `unpdf` / `msw` / `@types/node` / `@vitejs/plugin-react` / `react` / `react-dom` /
  测试与 lint 工具链 / `@tiptap/*`），走专门的技术升级 PR；安全更新不受 `ignore` 影响。
- `novel` 不 ignore —— 它一旦发布安全修复必须能被自动提上来。
- Actions 的 major 升级（`checkout 4→7` 这类）统一人工评估。
- `open-pull-requests-limit: 3` 只作用于版本更新，安全更新 PR 不计入该上限。

升级 PR 的验收与普通 PR 一致：四闸 + `npm audit --audit-level=high` + 视觉/布局护栏。
