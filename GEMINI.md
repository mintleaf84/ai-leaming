# GEMINI.md - AI 助手配置文件

> **核心理念与原则**
>
> **简洁至上**：恪守KISS（Keep It Simple, Stupid）原则，崇尚简洁与可维护性，避免过度工程化与不必要的防御性设计。
> **深度分析**：立足于第一性原理（First Principles Thinking）剖析问题，并善用工具以提升效率。
> **事实为本**：以事实为最高准则。若有任何谬误，恳请坦率斧正，助我精进。
>
> **开发工作流**
>
> **渐进式开发**：通过多轮对话迭代，明确并实现需求。在着手任何设计或编码工作前，必须完成前期调研并厘清所有疑点。
> **结构化流程**：严格遵循"构思方案 → 提请审核 → 分解为具体任务"的作业顺序。
>
> **输出规范**
>
> **语言要求**：所有回复、思考过程及任务清单，均须使用中文。
> **固定指令**：`Implementation Plan, Task List and Thought in Chinese`

---

## 项目上下文

- 和我对话必须使用中文
- 这个项目的使用者为中国的学生，所以这个项目的界面必须为中文
- 我的项目主要面向 web 和移动端，在编程时要充分考虑这两端的适配性
- 目录下的 `E:\code\ai-leaming\cherry-studio-main` 是参考的项目，不是我的要做的项目
- 前端路由地图：`E:\code\ai-leaming\docs\page_registry.md`
- `implementation_plan.md` 必须要用中文
- 在编写代码时，请使用中文进行注释

---

## 代码原则 (Code Principles)

- **Keep it clear**: Write code that is easy to read, maintain, and explain.
- **Match the house style**: Reuse existing patterns, naming, and conventions.

---

## 角色设定 (Role)

1. **Language Requirement**:
   - Always respond in **Simplified Chinese (简体中文)** unless explicitly asked to translate.
   - This applies to all explanations, chat responses, and planning documents.

2. **Code Comments**:
   - Write all code comments and documentation strings in **Simplified Chinese**.

3. **Tone**:
   - Technical, concise, and professional.

---

## 经验与教训 (Experience & Lessons Learned)

### 2025-12-24: E2E 测试失败排查

- **问题**: Playwright 测试神秘失败，UI 交互静默报错
- **根因**: Next.js Server Actions (`'use server'`) **必须是 async 函数**
- **教训**: 检查服务端日志优先；严格遵守 `'use server'` 规则

### 2025-12-25: Chat 功能实现

- **SDK 问题**: `@ai-sdk/react` 的 `useChat` 行为不透明 → 改用原生 `fetch + ReadableStream`
- **流式协议**: 前后端流式协议必须明确且一致
- **小步快跑**: 每次只改动一小块代码，立即验证

### 2025-12-25: 知识卡片显示修复

- **3D 动画**: 复杂 CSS 特性优先在 `globals.css` 中定义
- **图标导入**: 添加图标时立即检查导入列表
- **全局监听器**: 必须具备严格的生命周期管理

### 2026-01-05: lib 目录重构

1. **PowerShell 批量替换不可靠** → 使用 `npx replace`、`sed` 或 VS Code 全局替换
2. **分批次重构 + 逐步验证** → 小步快走，边改边验
3. **TypeScript 是重构的安全网** → `tsc --noEmit` 验证
4. **路径引用策略**：跨模块绝对、模块内相对
5. **不要遗忘边缘文件**：scripts、tests 都要搜索
6. **考虑使用 ast-grep** 进行代码重构（基于 AST 更精确）
