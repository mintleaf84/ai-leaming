# AI 教招客观题智能提升系统

这是一个基于 **Next.js 15 (App Router)**、**Vercel AI SDK** 和 **SQLite Vector** 构建的智能化教师招聘考试（教招）练习平台。系统超越了传统的刷题模式，通过 AI 实时监测认知偏差，并提供具备逻辑溯源能力的结构化修复方案。

## 🌟 核心特性

- **🧠 智能练习调度 (40/40/20)**:
  - 40% 顽固考点 (基于错题记录与长期观察区)
  - 40% 模块盲区 (未练习题目)
  - 20% 常规覆盖 (随机/温故)
- **🔄 线性复盘状态机**: 错题触发强制复盘流程：`知识点研读` -> `纠偏找茬 Quiz` -> `回归挑战 (1/3)`。
- **📈 动态掌握度算法**: 
  - +10/-30 基础计分。
  - **向下渗透惩罚**: 错“应用”维度题，自动扣除底层“理解”维度分值。
  - **高掌握度保护**: 分数达 100 后，惩罚系数降为 1。
- **📊 知识树可视化**: 使用 **D3.js** 实时渲染力导向图，展示知识点间的层级与掌握度热力矩阵。
- **🤖 AI 智能教研助手 (Chat)**:
  - 移植自 Cherry Studio 的专业级对话体验。
  - 支持 **DeepSeek-R1** 思考链 (Thinking Process) 展示。
  - 流式输出 (Streaming) 与 Markdown、代码块、公式渲染。
  - 集成 RAG 题库检索，回答更具教招针对性。
- **🤖 AI 双保险校验**: 
  - API A 生成变式，API B 独立校验，确保练习质量。
  - 具备 RAG 教材检索能力，减少 AI 幻觉。
- **💾 工程化保障**:
  - **本地化存储**: 使用 SQLite + `sqlite-vec` 向量检索，数据持久化于本地。
  - **备份恢复**: 支持一键导出/导入 JSON 格式的用户数据备份。
  - **单元测试与质量保证**: 核心服务与组件经过 Vitest 严格测试。

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
  - `/practice`: 核心练习与复盘界面。
  - `/dashboard`: 知识树可视化与数据管理。
- `src/components`: UI 组件与 D3 可视化组件。
- `src/lib`: 核心业务逻辑（算法、DB 配置、AI Service）。
- `src/hooks`: 自定义 React Hooks（如 `use-practice-engine`）。
- `docs/`: 需求文档 (PRD) 与 任务清单 (Todo)。

## 📝 许可证

MIT