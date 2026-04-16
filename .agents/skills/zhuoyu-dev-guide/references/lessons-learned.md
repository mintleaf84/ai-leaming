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

## 工具链规范

- **禁止占位符**: 使用 `replace` 工具编辑代码时，**严禁使用** `... existing code ...` 等占位符。必须提供完整的 `new_string`，或者对于大文件修改优先使用 `write_file` 全量覆盖。
- **PowerShell 命令链**: PowerShell **不支持 `&&` 链接多条命令**。必须分开执行，例如先 `git add`，再 `git commit`。

## 其他陷阱

### 时间与时区

- **时区漂移**: Docker 容器默认为 UTC。若直接使用 `new Date()`，会导致跨天统计（如"今日练习"）在凌晨出错。
- **强制转换**: 严禁直接使用 JS 原生日期对象进行业务计算。必须统一使用 `src/lib/utils/datetime.ts` 中的工具函数（如 `getBeijingDateString`），并确保容器设置 `TZ=Asia/Shanghai`。
