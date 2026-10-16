# 第一轮系统测试清单 (First Pass System Testing)

状态图例:

- [x] **CR**: Code Review Passed (逻辑验证通过)
- [ ] **Pending**: 待验证
- [!] **Issue**: 发现问题

## 1. 仪表盘 (Dashboard) - `/dashboard`

- [x] **页面加载**: 组件导出正常，依赖完整。 (CR)
- [x] **数据概览**: `getKnowledgeGraphData` Action 连接正常，Loading 状态已处理。 (CR)
- [x] **开始入口**: 包含 KnowledgeTree 可视化组件。 (CR)
- [x] **数据管理**: JSON 导入/导出逻辑包含完整的 try-catch 和 File Reader 处理。 (CR)

## 2. 练习引擎 (Practice Engine) - `/practice`

- [x] **初始化**: `useEffect` 钩子正确分发 `INIT_SESSION`。 (CR)
- [x] **答题交互**: `handleAnswer` 包含 `isHandlingRef` 防抖锁 (500ms)。 (CR)
- [x] **键盘支持**: 键盘监听器包含状态检查 (`status === 'practicing'`)。 (CR)
- [x] **复盘触发**: 错误逻辑连接正确。 (CR)
- [x] **AI 内容**: 修复了 `loadReviewData` 逻辑，正确调用 Server Actions。 (CR)
- [x] **熔断机制**: Reducer 中统一处理了 `failedAttempts >= 3` 的跳转逻辑。 (CR)
- [x] **UI 交互**: 找茬题和回归题已改为 Button 交互模式。 (CR)

## 3. 分析报告 (Report) - `/report`

- [x] **加载与渲染**: 页面结构完整，Grid 布局合理。 (CR)
- [x] **AI 诊断**: `generateDiagnosticReportAction` 调用包含 Loading 状态处理。 (CR)
- [!] **数据源**: 当前使用 Mock `sessionSummary` 数据。建议后续改为从 URL 参数或 LocalStorage 读取上一轮练习的实际数据。

## 4. 首页 (Landing) - `/`

- [x] **引导页**: UI 结构清晰，Link 导航指向正确。 (CR)

## 5. 构建验证

- [x] `npm run build`: 成功 (无 TypeScript 错误)。
- [x] `npm run test`: 核心逻辑单元测试通过。
