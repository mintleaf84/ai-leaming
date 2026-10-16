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

- **错题本与智能抽题**: 基于时间衰减与标签过滤的加权抽选算法引擎，定制化网页端随机练习生态。
- **智能练习调度**: 配置化 40/40/20 选题算法，动态监测知识边界与薄弱点。
- **AI 线性复盘**: 包含知识点研读、变式 Quiz 与归约挑战闭环流程。
- **AI 思维导图与 OCR 笔记**: 借助 PaddleOCR 高效实现图片文本截取，由底层模型联动 markmap 原生渲染实时结构思维。
- **修仙中心与全站监控后台**: 利用全站级监控流水线进行练习和成长数据复现、盘点及大屏分析。
- **可视化诊断**: 使用 D3.js 深度渲染实时动态热力地图和层级架构追踪。
- **AI 辅学教研生态**: 通过内置深度 DeepSeek-R1 模型思考链与双重校验安全防御系统阻截 AI 幻觉，提供流式体验。
- **本地化安全隔离**: 全量资产部署至本机的 SQLite 以及 `sqlite-vec` 向量引擎 (RAG)，保证工程化与个人隐私屏障。

## 文档指引

- **产品规格说明 (PRD)**: [docs/specs.md](docs/specs.md)
- **开发路线图**: [docs/todo.md](docs/todo.md)
- **用户交互流程**: [docs/user_flows.md](docs/user_flows.md)
- **页面清单**: [docs/page_registry.md](docs/page_registry.md)

---

_Last Updated: 2026-04-16_
