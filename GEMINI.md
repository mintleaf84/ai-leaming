和我对话必须使用中文
将你已经做过的事情动态更新到todo.md文件中。
这个项目的使用者为中国的学生，所以这个项目的界面必须为中文。
这份文档是项目的前端路由地图，用于追踪每个页面的功能、状态和维护记录。在进行全局性重构（如汉化、UI 升级）时，请务必遍历此清单。@E:\code\ai-leaming\docs\page_registry.md
目录下的E:\code\ai-leaming\cherry-studio-main是参考的项目，不是我的要做的项目
我的项目主要面向web和移动端，在编程时要充分考虑这两端的适配性。

# Role: Chinese Speaking Developer Assistant

1. **Language Requirement**:
- Always respond in **Simplified Chinese (简体中文)** unless explicitly asked to translate.
- This applies to all explanations, chat responses, and planning documents.

2. **Code Comments**:
- Write all code comments and documentation strings in **Simplified Chinese**.

3. **Tone**:
- Technical, concise, and professional.


implementation_plan.md 必须要用中文

# Experience & Lessons Learned (2025-12-24)
## Bug: E2E Tests failing due to Server Action Error
- **Symptom**: Playwright tests for a new page were failing with generic timeout/selector errors. The logic seemed correct, but UI interactions (switching tabs) failed silently.
- **Root Cause**: Next.js Server Actions (`'use server'`) **MUST** be async functions. I exported a synchronous helper function `getPromptFromDbSync` from a file marked `'use server'`, causing a build/runtime error that wasn't immediately obvious in the frontend.
- **Resolution**: Moved synchronous utility functions to a separate library file (`src/lib/prompts.ts`) that is NOT marked as `'use server'`.
- **Lesson**: 
    1. **Check Server Logs First**: When E2E tests fail mysteriously on UI interactions, check the server console for build/runtime errors first.
    2. **Next.js Constraints**: Strict adherence to `'use server'` rules. Only export async functions from these files.

# Experience & Lessons Learned (2025-12-25)
## Chat 功能实现经验总结

### 1. 避免过度依赖"黑盒"SDK
- **问题**: 使用 `@ai-sdk/react` 的 `useChat` hook 时，`append` 方法时有时无，类型定义与文档不一致，调试困难。
- **解决**: 改用原生 `fetch` + `ReadableStream` + `useState` 方案，完全可控。
- **教训**: 当 SDK 行为不透明且难以调试时，考虑使用更底层的方案。

### 2. 流式响应需要统一协议
- **问题**: API 使用 `.tee()` 分流后返回原始字节流，但前端仍按 SDK 协议格式（`0:"..."\\n`）解析，导致内容丢失。
- **解决**: 在前端同时兼容 SDK 协议格式和原始文本格式。
- **教训**: 前后端的流式协议必须明确且一致。

### 3. E2E 测试的 Mock 边界
- **问题**: Playwright 的 `page.route()` 难以准确模拟 Vercel AI SDK 的复杂流式协议。
- **解决**: E2E 测试聚焦于 UI 状态切换（如按钮状态、输入框清空），而非完整数据流。
- **教训**: 对于协议敏感的场景，使用集成测试更合适。

### 4. 小步快跑，边改边验证
- **问题**: 一次性修改多处代码后难以定位引入问题的具体位置。
- **教训**: 每次只改动一小块代码，立即在浏览器验证，避免问题累积。

### 5. 状态更新频率控制
- **问题**: 在流式循环中频繁调用 `setMessages` 导致性能问题。
- **解决**: 将状态更新移到循环外部（每个 chunk 只更新一次）。


# Experience & Lessons Learned (2025-12-25)
## 知识卡片显示与交互修复经验总结

### 1. 3D 动画样式的稳定性管理
- **问题**: 在组件内使用 `style jsx` 定义的 3D 转换样式（如 `perspective`, `backface-visibility`）在某些环境下表现不稳。
- **解决**: 将核心 3D 变换样式移至 `globals.css` 的 `@layer utilities` 中，确保全局一致性并利用 Tailwind 的层级机制。
- **教训**: 对于复杂的 CSS 特性，优先考虑在全局样式表中定义通用的工具类。

### 2. 图标库引用的完备性检查
- **问题**: 在增加功能时使用了 Lucide 图标但遗漏了导入，导致页面崩溃。
- **解决**: 补充了 `CheckCircle2`, `Play`, `ChevronLeft`, `ChevronRight`, `AlertCircle` 等图标的导入。
- **教训**: 在编写 UI 组件时，添加图标应立即检查导入列表。

### 3. 内容溢出与滚动处理
- **问题**: 知识卡片正反面内容长度不确定，固定高度可能导致内容截断。
- **解决**: 优化了滚动条样式（`.scrollbar-hide` 和 `.scrollbar-thin`），确保长内容可滚动。
- **教训**: 涉及用户生成内容的容器必须预留滚动机制。

### 4. 键盘交互的鲁棒性
- **问题**: 复习模式下的全局键盘监听器可能会干扰其他页面的正常交互。
- **解决**: 增加了严格的 `studyMode` 状态判断，并在卸载时移除监听器。
- **教训**: 全局事件监听器必须具备严格的生命周期管理和状态开关。


在编写代码时，请使用中文进行注释