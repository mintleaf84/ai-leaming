# 项目上下文与资源 (Project Context)

## 技术栈 (Technology Stack)

- **Frontend**: Next.js (App Router), Tailwind CSS, Lucide icons, Shadcn UI.
- **Backend**: Drizzle ORM, SQLite (WAL Mode enabled).
- **AI/LLM**: RAG (Knowledge base & Variable generation), Stream Protocol.

## 关键技术架构

### 1. 数据库与 Schema

- **SQLite 配置**: 数据文件路径 `data/ai-learning.db`，启用 WAL 模式。

* **多选题支持**:
  - `questions` 表 `type` 字段: `single` | `multi` | `truefalse`
  - `answer` 字段: 支持 JSON 数组字符串 (e.g. `["A","B"]`)；判断题时为 `"A"` 或 `"B"`
  - 全链路支持: Zod Schema (`QuestionSchema`) -> Admin UI -> DB -> History UI (`QuestionCard`)
* **新增表结构（Phase 11-16）**:
  - `users` — 用户账号与权限
  - `practice_sessions` — 练习会话（含题目快照 JSON）
  - `practice_logs` — 每道题答题记录
  - `subscription_plans` — 订阅套餐定义
  - `user_subscriptions` — 用户订阅关系
  - `textbooks` — 教材库
  - `textbook_sections` — 教材章节
  - `notes` — 学习笔记
  - `mindmaps` — 思维导图
  - `text_annotations` — 文本标注
  - `api_keys` — AI 服务商密钥

### 2. 前端架构

- **练习引擎**: 状态机位于 `use-practice-engine.ts`，防抖锁机制在此实现（防止重复提交）。

* **文本标注**: 基于 Selection API 实现悬浮工具栏，支持第一性原理递归解析。

### 3. 时间与时区

- **原则**: 全栈强制 `Asia/Shanghai`。

* **实现**: ISO 字符串存储，`datetime.ts` 转换显示，容器层 `TZ` 环境变量。

## 核心地图

- **前端页面注册表**: [page_registry.md](../../../../docs/page_registry.md)
- **参考项目**: `cherry-studio-main/` (仅供逻辑参考，非当前项目代码库)。

## 设计语言

- **Neo-Chinese Minimalism (新中式极简)** + **Notion-style**.
- **色调**: Emerald (#10b981), Teal, Neutral Palette.
- **字体**: Serif for titles, Sans-serif for content.
- **质感**: 纸质纹理背景 (`#faf9f6`).
