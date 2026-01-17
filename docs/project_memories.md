# 项目开发备忘录 (Project Memories)

## 1. 关键技术决策与教训

### 1.1 工具使用规范

* **禁止使用占位符**: 在使用 `replace` 工具时，严禁使用 `... existing code ...` 等占位符。必须提供完整的 `new_string`，或者对于大文件修改优先使用 `write_file` 全量覆盖。此教训源于一次导致核心 UI 组件代码丢失的事故。

### 1.2 数据库与 Schema

* **多选题支持**:
  * `questions` 表新增 `type` 字段 (`single` | `multi`)。
  * `answer` 字段不仅支持纯字符串，也支持 JSON 字符串 (如 `["A", "C"]`)。
  * 导入脚本 `scripts/import-fenbi.ts` 已包含多选识别逻辑。
* **SQLite 路径**: 开发环境使用相对路径 `ai-learning.db`。生产部署需注意持久化挂载。
* **WAL 模式**: 已启用 WAL 模式以支持更高并发，但事务原子性仍需在业务层（`db.transaction`）严格保证。

### 1.3 前端架构

* **练习引擎 (Practice Engine)**:
  * 核心状态机位于 `use-practice-engine.ts`。
  * 页面 `practice/page.tsx` 负责 UI 渲染，已实现单选/多选的差异化渲染。
  * 必须确保 `QuestionSchema` (Zod) 与数据库字段同步，否则会引发构建错误。
* **防抖与锁**:
  * `handleAnswer` 必须包含 `isHandlingRef` 防抖锁 (500ms)，防止用户快速点击导致重复提交或状态机紊乱。
  * AI 生成过程中需锁定 UI (`isLoadingAI`)。

### 1.4 时间与时区 (Timezone)

* **统一北京时间**:
  * **核心原则**: 全栈统一使用 `Asia/Shanghai` (UTC+8)。
  * **Docker**: 容器环境变量强制设置 `TZ=Asia/Shanghai`。
  * **代码层**: 严禁直接使用 `new Date()` 进行日期计算。必须统一使用 `src/lib/utils/datetime.ts` 中的 `getBeijingDateString()` 等工具函数。
  * **数据库**: ISO 时间戳仅作为存储格式，业务逻辑比较时必须转换为北京时间。

### 1.5 文本标注系统 (Annotation)

* **交互设计**:
  * 基于选区 (`window.getSelection()`) 触发悬浮工具栏。
  * **第一性原理解析**: 支持对任意选中文本进行深层递归分析，弹窗展示。
  * **工具栏定位**: 需通过 `getBoundingClientRect()` 精确计算位置，防止溢出屏幕。

## 2. 外部数据源处理

* **粉笔题库**:
  * 源文件：`题库/粉笔示例数据.json`。
  * 清洗逻辑：去除 HTML 标签，映射 `correctAnswer.choice` 索引到选项文本。
  * 多选特征：`correctAnswer.choice` 包含逗号 (e.g., `"0,1,2"`) 或 `type: 2`。

## 3. 遗留问题与待办

* **AI 降级**: 目前仅实现了部分 Action 的 RAG 降级，需推广至全局。
* **事务原子化**: `mastery-service.ts` 中的多步更新尚未完全事务化，存在极端情况下的数据不一致风险。
* **用户偏好**: 尚未开发 `/settings` 页面。

## 4. 2025年12月关键教训 (Latest Lessons)

### 4.1 Next.js Server Actions 异步陷阱

* **现象**: Playwright E2E 测试在某些页面交互（如 Tab 切换）时莫名超时或失败，但并无明显报错。
* **原因**: 在标记为 `'use server'` 的文件中导出了同步函数 (`export function ...`)。Next.js 编译器要求 Server Action 文件边界内的导出必须均为 async 函数。
* **解决**: 将同步的工具函数（如数据库辅助转换逻辑）移至非 `'use server'` 的 `lib/` 目录下。
* **原则**: **Server Action 文件 (`actions.ts`) 只应当包含 `export async function`，严禁混入同步导出。**

### 4.2 时区不一致导致的数据漂移

* **现象**: 用户的"今日练习"在凌晨时段统计错误，或者连续签到中断。
* **原因**: Docker 容器默认 UTC 时间，而用户思维是北京时间。直接用 `new Date().toISOString().split('T')[0]` 会导致 0-8 点的数据被算作"昨天"。
* **解决**: 封装 `datetime.ts` 工具库，强制转换时区偏移。

---
*Last Updated: 2025-12-23*
