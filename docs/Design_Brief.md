# UI/UX 设计需求简报 (Design Brief)

这份文档旨在为 UI/UX 设计师提供关于 **[My Next App]** (暂定名) 的核心设计背景、功能范围及技术约束，确保设计方案精准落地。

## 1. 产品核心 (Product Core)

> **设计目标**：打造一个基于“第一性原理”思维的 AI 辅助学习平台，帮助用户不仅“做对题”，更能“懂原理”。

- **一句话介绍 (Elevator Pitch)**
  - 一个集成了 AI 深度诊断、知识图谱可视化与沉浸式练习的智能学习助手。它通过“第一性原理”分析，帮助学习者构建坚固的知识体系。

- **目标用户 (Target Audience)**
  - **核心群体**：追求深度理解而非死记硬背的学习者（如备考学生、自学者）。
  - **用户痛点**：刷题虽多但理解不深、知识点孤立不成体系、缺乏针对性的反馈。

- **核心价值 (Key Value Proposition)**
  - **深度 AI 复盘**：不仅给出答案，更提供基于“第一性原理”的深度拆解。
  - **知识图谱可视化**：使用动态图谱（Knowledge Graph）展示知识点关联。
  - **数据化成长**：通过雷达图（Radar Chart）多维度展示学习能力变化。

## 2. 功能范围与架构 (Scope & Structure)

基于目前的开发进度 (`src/app` 目录结构)，以下是核心页面流：

### 2.1 核心用户流 (The Happy Path)

1.  **Dashboard (仪表盘)**: 用户看到今日任务、知识点掌握概览。
2.  **Practice Setup (配置练习)**: 选择科目、模式（专注/随机）、题目数量。
3.  **Practice Engine (答题中)**:
    - 沉浸式答题界面（单选/多选）。
    - **关键交互**：提交答案 -> 实时展示 AI 流式解析（Markdown 渲染）。
4.  **Practice Report (结算页)**: 练习完成，展示得分、耗时、能力雷达图。

### 2.2 站点地图 (Sitemap)

- **Bottom Tab / 主要导航**:
  - **首页 (Home/Dashboard)**: 状态概览。
  - **练习 (Practice)**: 快速开始练习。
  - **知识库 (Knowledge)**: 概念卡片（3D 翻转效果）、教材 (Textbooks)。
  - **我的 (Profile)**: 历史记录 (History)、设置 (Settings)、会员 (Pricing)。

## 3. 内容与状态细节 (Content & States)

- **真实数据特征 (为设计提供参考)**:
  - **题目**: 可能包含长文本、代码块（Markdown）。
  - **AI 解析**: 文本较长，结构化（原因、推导、结论）。
  - **标签**: 题目会有“第一性原理”、“记忆”、“逻辑”等标签。
- **特殊状态**:
  - **Loading**: AI 生成解析时会有流式加载效果（Streaming）。
  - **Empty**: 历史记录为空时的引导页。

## 4. 视觉偏好 (Visual Direction) - _[待设计师/用户补充]_

- **风格关键词**: _[例如：极简、科技感、沉浸式、Glassmorphism]_
- **色调偏好**: _[例如：深色模式为主，搭配霓虹点缀]_
- **参考竞品 (Mood Board)**:
  - _Likes_: [Duolingo (游戏化)], [Brilliant (交互式学习)]
  - _Dislikes_: [传统复杂的 LMS 系统]

## 5. 技术约束 (Constraints)

- **运行环境**: 移动端 Web (Mobile Web / PWA)，需考虑浏览器地址栏高度。
- **开发框架**: Next.js (React)。
- **UI 库**: 基于 Shadcn UI (Tailwind CSS)，设计时可参考标准组件库的交互模式，减少开发成本。
- **响应式**: 首选移动端设计 (Mobile First)，兼容 iPad/Desktop。

---

**附录：现有资产路径**

- 路由地图: `docs/page_registry.md`
- 核心逻辑: `src/app/practice/`
