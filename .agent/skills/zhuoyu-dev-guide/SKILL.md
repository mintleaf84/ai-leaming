---
name: zhuoyu-dev-guide
description: 琢玉项目开发指南。包含核心开发理念（KISS、第一性原理）、强制输出规范（全中文环境、中文代码注释）、以及渐进式开发工作流。在进行前后端开发、UI/UX 调整或系统重构时使用。
---

# 琢玉项目开发指南 (Zhuoyu Dev Guide)

本技能封装了「琢玉」项目的所有开发标准、设计哲学和避坑指南。

## 核心理念与原则

- **简洁至上 (KISS)**：遵守 Keep It Simple, Stupid 原则。崇尚简洁与可维护性，避免过度工程化。
- **深度分析**：立足于第一性原理（First Principles Thinking）剖析问题。
- **事实为本**：以事实为最高准则。接受事实并快速修正谬误。

## 开发工作流

1. **渐进式开发**：通过多轮对话迭代需求。严禁在理清疑点前动手编码。
2. **结构化流程**：严格遵守以下顺序：
    - **构思方案** (Conceptual Plan)
    - **提请审核** (User Review)
    - **分解任务** (Task Breakdown)
    - **验证关闭** (Verification)

## 输出规范 (Mandatory)

- **语言要求**：除非明确要求翻译，否则所有回复、思考过程、方案及任务清单必须使用 **简体中文**。
- **代码注释**：所有代码注释和文档字符串必须使用 **中文**。
- **指令执行**：严格执行 `Implementation Plan, Task List and Thought in Chinese`。

## 代码原则

- **Keep it clear**：代码务必易读、易维护、易解释。
- **Match the house style**：复用既有模式、命名规范和组件库约定。
- **适配性**：所有 UI 改动必须同时考虑 Web 端和移动端适配。

## 进阶参考

- **避坑指南**：见 [lessons-learned.md](references/lessons-learned.md)
- **项目上下文**：见 [project-context.md](references/project-context.md)
