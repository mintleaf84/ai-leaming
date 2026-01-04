# AI 教招客观题智能提升系统

这是一个旨在帮助考生高效备考教师招聘考试的智能化系统。

## 项目组成

- **主应用**: [my-next-app/](my-next-app/) - 基于 Next.js 15 的全栈应用。
- **文档**: [docs/](docs/) - 包含产品需求文档 (PRD) 和开发计划。

## 快速开始

请进入 `my-next-app` 目录查看详细的 [README](my-next-app/README.md) 并按照说明启动项目。

```bash
cd my-next-app
npm install
npm run dev
```

## 主要功能

- **智能练习调度**: 40/40/20 选题算法，动态监测薄弱点。
- **AI 线性复盘**: 包含知识点研读、变式 Quiz 与回归挑战。
- **可视化诊断**: 使用 D3.js 渲染实时热力知识树。
- **AI 智能助手**: 集成 DeepSeek-R1 思考链，流式教研对话体验。
- **本地化隐私**: 全量数据存储于本地 SQLite，支持向量检索 (RAG)。

## 文档指引

- **产品规格说明 (PRD)**: [docs/specs.md](docs/specs.md)
- **开发路线图**: [docs/todo.md](docs/todo.md)
- **用户交互流程**: [docs/user_flows.md](docs/user_flows.md)
- **页面清单**: [docs/page_registry.md](docs/page_registry.md)

---
*Last Updated: 2025-12-25*
