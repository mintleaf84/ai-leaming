# AGENTS.md — AI 代理开发指南（正典）

本文件是项目面向所有 AI 编码代理（Claude Code、Gemini、Cursor、Qoder、Copilot 等）的**唯一正典**。
`CLAUDE.md` / `GEMINI.md` / `.cursorrules` 仅保留指针，不要在那些文件中复制内容。

## 项目概述

AI 教招客观题智能提升系统——基于 Next.js 15、Hono、SQLite 和 AI 集成的教师招聘考试智能刷题平台。

## 工程规范（先读）

改动代码前必读 [`docs/engineering.md`](docs/engineering.md)：幂等键、`catch` 三形态、关键路径真实依赖集成测试、四闸+审计、版本唯一事实来源。
计划进度见 [`docs/engineering-plan.md`](docs/engineering-plan.md)，取舍记录见 [`docs/decisions.md`](docs/decisions.md)。

### 五条硬规则（合并前必须满足）

1. **写操作先定幂等键**：优先用上游操作 ID（跨重试稳定）；内容指纹只能兜底，且需提供人工重推入口；同一份数据执行两次不得产生重复会话/重复累加；
2. **`catch` 只允许三种**：转换重抛 / 命中明确业务错误跳过（判定可测）/ 可忽略且打结构化日志；禁止只 `console.warn` 后继续；
3. **关键路径必须有真实依赖的集成测试**（DB 写入、鉴权、导入、结算），禁止用 mock 数据库冒充验证；
4. **闸门绿了才合**：`lint:ci`（按规则棘轮）/ `typecheck` / `test:run` / `next build` / `npm audit --audit-level=high`；
5. **版本唯一事实来源**：`.nvmrc` + `engines` + `preinstall` 守卫固定 Node 20，核心依赖写死版本。

细则、示例与验收命令见 [`docs/engineering.md`](docs/engineering.md)。

## 常用命令（在 `my-next-app/` 下执行）

```bash
npm run dev          # 开发服务器 (0.0.0.0:3000)
npm run build        # 生产构建
npm run start        # 启动生产服务
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint（全量看 warning）
npm run lint:ci      # ESLint 按规则棘轮（.eslint-baseline.json）
npm run lint:baseline # 收紧 warning 基线（总数下降后才执行）
npm run test:run     # Vitest 单次运行
npm run test:e2e     # Playwright（自己起 3001 测试服务；勿手起 dev server，否则 webServer.env 不生效）
npm test             # Vitest（监听模式）
npm run db:migrate   # 执行数据库迁移
```

## 架构约束（CRITICAL）

### API 层：Hono（禁止新增 Next.js API Routes）

所有 REST API 使用 Hono，通过单一 catch-all 路由挂载：

1. 在 `src/lib/api/routes/<feature>.ts` 创建路由，使用 `@hono/zod-openapi`；
2. 在主路由 `src/app/api/[[...route]]/route.ts` 中挂载：`app.route('/<feature>', featureRoute)`；
3. OpenAPI/Swagger 文档在 `/api/doc`；全局限流统一在主路由文件应用，不要自造边缘实现。

### Server Actions

客户端-服务端数据变更走 Server Actions，文件在 `src/server/actions/*.ts`。

### 数据库

- ORM：**Drizzle** + SQLite（`better-sqlite3`）；向量检索用 `sqlite-vec`（RAG）
- Schema：`src/lib/db/drizzle-schema.ts`；DB 实例：`src/lib/db/index.ts`
- 迁移：`drizzle-kit`，迁移文件在 `my-next-app/drizzle/`

### 前端

Next.js 15（App Router）、Radix UI + Tailwind CSS、React Query、Vercel AI SDK（`ai` 包）、D3.js / Recharts。

### Flutter 移动端（`mobile_app/`）

Feature-First 目录结构：模块代码放 `lib/features/<feature>/`（domain/data/presentation），跨模块单例放 `lib/shared/`（如 `ApiClient`）。移动 Dart 文件一律用 `git mv`。

## 关键目录

| 目录                              | 用途                                           |
| --------------------------------- | ---------------------------------------------- |
| `my-next-app/src/app/`            | Next.js 页面与布局                             |
| `my-next-app/src/server/actions/` | Server Actions                                 |
| `my-next-app/src/lib/api/routes/` | Hono API 路由                                  |
| `my-next-app/src/lib/db/`         | Schema 与数据库工具                            |
| `mobile_app/`                     | Flutter 客户端                                 |
| `lab/python/`                     | 离线实验与数据分析（非生产代码，可独立评审）   |
| `题库/`                           | 题库数据文件（不参与代码评审，不改动需先说明） |
| `docs/`                           | 设计文档与领域说明                             |

## 测试

Vitest + `@testing-library/react`；测试文件与组件共存或放 `__tests__/`；使用内存数据库，mock 在 `src/lib/db/__mocks__/`。

## 技能库（Skills）

开发前先检索 `.agents/skills/` 中相关专项技能并遵循（如 `zhuoyu-dev-guide`、`project-lint-standards`、`hono-api-development`、`drizzle-orm-engineering`）。

## 提交与终端规范

- 提交信息用**中文**，格式 `<type>: <简述>`（type ∈ feat/fix/refactor/docs/test/chore/style/perf），模板见 `.gitmessage`（每个 clone 执行 `git config commit.template .gitmessage` 启用）
- 终端多命令分行执行，不要用 `&&` 串联（部分代理执行器对链式命令处理不可靠）
- 用户答题日志、题库导出件、`*.db*` 数据文件一律不进仓库
