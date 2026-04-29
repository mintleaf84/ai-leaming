# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本项目中工作时提供指导。

## 项目概述

AI 教招客观题智能提升系统 - 基于 Next.js 15、Hono、SQLite 和 AI 集成的教师招聘考试智能刷题平台。

## 常用命令

```bash
cd my-next-app

# 开发
npm run dev              # 启动开发服务器 (0.0.0.0:3000)

# 构建
npm run build            # 生产环境构建
npm run start            # 启动生产服务器
npm run lint             # 运行 ESLint

# 测试
npm test                 # 运行所有测试 (Vitest)
npm test -- --run        # 单次运行测试（不监听）
npm test -- <文件>       # 运行指定测试文件

# 数据库
npm run db:migrate       # 执行数据库迁移
```

## 架构

### API 层：Hono（禁止使用 Next.js API Routes）

项目所有 REST API 均使用 **Hono** 框架，通过单一 catch-all 路由挂载：

- 路由定义：`src/lib/api/routes/<功能>.ts`
- 主路由文件：`src/app/api/[[...route]]/route.ts`
- OpenAPI/Swagger 文档：`/api/doc`
- 全局限流在主路由文件中应用

新增 API 端点步骤：
1. 在 `src/lib/api/routes/<功能>.ts` 创建路由，使用 `@hono/zod-openapi`
2. 在主路由中挂载：`app.route('/<功能>', 功能Route)`

### Server Actions

用于 Next.js 内的客户端-服务端交互，文件位于 `src/server/actions/*.ts`。

### 数据库

- ORM：**Drizzle** + SQLite (`better-sqlite3`)
- 向量搜索：`sqlite-vec` 用于 RAG 能力
- Schema：`src/lib/db/drizzle-schema.ts`
- DB 实例：`src/lib/db/index.ts`
- 迁移：`drizzle-kit`，迁移文件在 `drizzle/` 目录

### 前端

- 框架：Next.js 15 (App Router)
- UI：Radix UI 组件 + Tailwind CSS
- 状态管理：React Query (`@tanstack/react-query`)
- AI SDK：Vercel AI SDK (`ai` 包)
- 可视化：D3.js、Recharts

## 关键目录

| 目录 | 用途 |
|------|------|
| `src/app/` | Next.js 页面和布局 |
| `src/server/actions/` | Server Actions 数据变更 |
| `src/lib/api/routes/` | Hono API 路由定义 |
| `src/lib/db/` | 数据库 Schema 和工具函数 |
| `src/components/` | 可复用 UI 组件 |

## 测试

测试使用 **Vitest** + `@testing-library/react`。测试文件与组件共存或放在 `__tests__` 目录。测试使用内存数据库，通过 `src/lib/db/__mocks__/` 中的 mock 工具实现。

## Cursor 规则（来自 .cursorrules）

- API 开发必须使用 Hono，禁止使用标准 Next.js API Routes
- Flutter 移动端 (`mobile_app/`) 使用 Feature-First 目录结构，`lib/features/<功能>/`