# 经验与教训 (Experience & Lessons Learned)

本档记录了开发过程中踩过的坑，遇到类似场景时请务必避雷。

## Web 开发

### SSR & Hydration

- **useTerminology**: 必须具备 SSR 兼容性。Provider 在 mounted 之前不能直接返回 children 的空壳，否则会导致子组件在服务端读取 Context 失败。

### Next.js Server Actions

- **Async 强制性**: `'use server'` 函数 **必须是 async 函数**。

### 流式处理 (Streaming)

- **useChat**: `@ai-sdk/react` 的 `useChat` 在某些流式协议下不透明，改用原生 `fetch + ReadableStream`。

## UI/UX & CSS

- **3D 动画**: 复杂 CSS 特性优先在 `globals.css` 中定义，避免 inline 导致的解析差异。
- **图标导入**: 增加图标时立即检查导入列表。

## 重构与维护

- **批量替换**: PowerShell 批量替换不可靠（容易破坏文件编码或导致部分漏改）。推荐使用 `npx replace` 或 `ast-grep`。
- **路径引用**: 跨模块使用绝对路径 (`@/...`)，模块内使用相对路径。
- **测试**: Mock 数据库模块而非使用真实数据库，确保测试隔离且高速。
