# AI 教招客观题智能提升系统

这是一个基于 **Next.js 15 (App Router)**、**Vercel AI SDK** 和 **SQLite Vector** 构建的智能化教师招聘考试（教招）练习平台。系统超越了传统的刷题模式，通过 AI 实时监测认知偏差，并提供具备逻辑溯源能力的结构化修复方案。

## 🌟 核心特性

- **🧠 智能错题本与加权抽题引擎**:
  - 基于时间衰减算法与标签过滤的智能加权抽题机制。
  - 支持自定义练习数量，提供流畅的 Web 端随机练习专属交互框架。
  - 错题触发强制复盘状态机流程：`知识点研读` -> `纠偏找茬 Quiz` -> `回归挑战`。
- **📈 动态掌握度算法与智能练习调度 (40/40/20)**:
  - 调度策略：配置化加载 40% 顽固考点、40% 模块盲区及 20% 常规覆盖。
  - +10/-30 基础计分，内置**向下渗透惩罚**及**高掌握度保护**。
- **📊 知识树、行为监控与修仙中心**:
  - 使用 **D3.js** 实时渲染力导向图，呈现知识层级与掌握度热力矩阵。
  - **管理后台**: 全站行为日志监控流水线，全面记录并分析练习轨迹与成长数据。
- **📝 AI 思维导图与 OCR 智能笔记**:
  - 集成 **PaddleOCR** 图片文字高精提取，用于快速导入及解析内容。
  - 结合大语言模型分析与 **markmap**，动态生成层级分明的结构化思维导图与智能笔记工作流。
- **🤖 AI 智能辅助生态 (Chat & Verify)**:
  - 移植自 Cherry Studio 的专业级对话体验，全面适配 **DeepSeek-R1** 思考链。
  - **双保险校验**: API A 生成变式，API B 独立严密校验，有效扼死大模型幻觉，并依托 RAG 增强准确率。
- **💾 工程架构层**:
  - 完全由 Next.js 15 (App Router) 驱动，集成 Vercel AI SDK 构建。
  - 使用 SQLite + `sqlite-vec` 提供稳定、高效的本地向量化存储。

## 🛠️ 技术栈

- **前端**: Next.js 15, TypeScript, Tailwind CSS, Framer Motion, Lucide React, Sonner
- **后端/AI**: Vercel AI SDK, Zod, better-sqlite3
- **向量检索**: `sqlite-vec`
- **可视化**: D3.js
- **测试**: Jest, ts-jest

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 环境配置

创建 `.env.local` 并配置您的 AI 模型 API Key：

```env
OPENAI_API_KEY=your_key_here
# 或其他支持的模型 key
```

### 3. 初始化数据库

项目首次运行会通过 `src/lib/init-db.ts` 自动初始化 SQLite 数据库文件 `ai-learning.db`。

### 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 即可开始。

### 5. 运行测试

```bash
npm test
```

## 📂 项目结构

- `src/app`: Next.js 页面与 Server Actions。
  - `/practice` & `/wrong-book`: 核心练习、加权抽题引擎与复盘控制台。
  - `/dashboard` & `/admin`: 知识树可视化概览、全站监控及“修仙中心”后台。
  - `/notes` & `/mindmap`: 智能学习笔记系统与 markmap 思维导图工作区。
- `src/components`: 全局 UI 组件库库与数据可视化（D3）模块。
- `src/lib`: 核心运行时依赖（OCR 插件、DB 配置、AI 流控制与算法工具类）。
- `docs/`: 需求工程及架构演进文档仓库。

## 📝 许可证

MIT
