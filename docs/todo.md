### 项目构建阶段概览 (已完成 Phase 1-13)

1. **第一阶段：基础设施与数据建模** —— 搭建 SQLite 向量环境与核心 Schema。(Completed)
2. **第二阶段：练习调度与掌握度引擎** —— 实现选题算法与核心评分逻辑。(Completed)
3. **第三阶段：AI 自动化打标与 RAG 基础** —— 自动化数据准备流水线。(Completed)
4. **第四阶段：线性复盘状态机与诊断逻辑** —— 实现最核心的“修复”闭环。(Completed)
5. **第五阶段：可视化、结算报告与高级功能** —— 完成知识树与最终交付物。(Completed)
6. **第六阶段：体验优化与交互增强** —— 动画、快捷键与移动端适配。(Completed)
7. **第七阶段：工程化与数据安全** —— 备份恢复与单元测试。(Completed)
8. **第八阶段：聊天功能完善** —— Markdown 渲染、会话管理、RAG 集成。(Completed)
9. **第九阶段：单元测试与质量保证** —— 核心服务与组件测试。(Completed)
10. **第十阶段：练习记录与溯源** —— 引入 Session 架构，实现历史回顾页面。(Completed)
11. **第十一阶段：用户中心与权限控制** —— 登录注册流程及多用户数据隔离。(Completed)
12. **第十二阶段：组件化重构与可视化增强** —— 提取 UI 抽象，完善 D3.js 知识图谱。(Completed)
13. **第十三阶段：后台管理面板深度优化** —— 专业级管理工具与配置中心。(Completed)

---

## 核心阶段详细记录

### Phase 8: 聊天功能完善 (Completed)

- [x] 修复 @ai-sdk/react 类型不匹配问题
- [x] 实现手动输入状态管理
- [x] 兼容 sendMessage 和 append 方法
- [x] 验证开发服务器运行状态

### Phase 9: 单元测试与质量保证 (Completed)

- [x] 配置 Vitest 测试环境
- [x] 编写 ChatService 单元测试
- [x] 编写 CodeBlock 组件测试
- [x] 运行并通过所有测试

### Phase 10: 练习记录与溯源 (Completed)

- [x] **Task 10.0: 练习会话 (Session) 架构重构**
  - [x] 数据库新增 `practice_sessions` 表。
  - [x] 重构 `practice_logs` 与练习保存逻辑。
- [x] **Task 10.1: 练习历史页面 (/history)**
  - [x] 实现历史列表 UI：展示日期、题数、正确率、复盘状态。
  - [x] 实现 Session 详情页 (/history/[id])：回顾题目、错因与 AI 复盘。

### Phase 11: 用户中心与权限控制 (Completed)

- [x] **Task 11.0: 身份验证系统**
  - [x] 实现 `/login` 与 `/register` 页面。
  - [x] 引入 `requireUser` 与 Session 校验逻辑。
  - [x] 实现基础的用户偏好设置 (/settings)。

### Phase 12: 组件化重构与可视化增强 (Completed)

- [x] **Task 12.0: 练习页面重构 (Practice Page)**
  - [x] 拆分 `HeaderProgressBar`, `PracticeCard`, `ReviewCard`。
- [x] **Task 12.1: 仪表盘与可视化重构 (Dashboard Refresh)**
  - [x] 提取 `KnowledgeTreeSection` 与 `DataManagementSection`。
  - [x] 封装 `KnowledgeTree` (D3.js) 与 `RadarChart` 为通用可视化组件。
- [x] **Task 12.2: 首页与全局导航**
  - [x] 引入 `Navbar` 与 `MobileNav` 响应式导航。

### Phase 13: 后台管理面板深度优化 (Completed)

- [x] **Task 13.0: 专业级管理后台 (/admin)**
  - [x] 实现 `QuestionManager` (试题 CRUD 与批量导入)。
  - [x] 引入 `ConfigManager` 与 `PromptManager` 用于动态调整 AI 参数。
  - [x] 增加 `AccessLock` 安全访问限制。
  - [x] 完成全局 UI 汉化。
- [x] **Task 13.1: 后台审计与监控强化**
  - [x] 实现管理员操作日志 (`admin_logs`) 记录与查询。
  - [x] 增加系统健康监控仪表盘（数据库大小、内存、运行时间）。
  - [x] 实现 AI API 调用逻辑埋点与多维度统计 (Tokens / 次数)。
- [x] **Task 13.2: 检索与重排序增强 (RAG Optimization)**
  - [x] 集成重排序 (Rerank) 模型，显著提升 RAG 回答的准确性。
- [x] **Task 13.3: 多服务商深度兼容 (Multi-Provider Routing)**
  - [x] 实现独立于全局配置的模型路由系统，支持混合使用不同服务商。

### 维护与问题修复 (Maintenance & Bug Fixes)

- [x] **2026-01-04**: 修复 PracticeCard 组件中因 options 数据缺失导致的渲染崩溃问题。
- [x] **2026-01-04**: 修复错题本练习功能，增加 `getSessionByIdAction` 支持根据 sessionId 加载会话。
- [x] **2026-01-04**: 错题本功能升级 (P0)：
  - 新增“标记已掌握”功能，移除已攻克错题并归档。
  - 新增错题详情页，支持查看完整题目、选顶、解析及历史作答记录。

---

### 后续展望 (Future Roadmap)

- [ ] **多端同步方案**: 适配移动端 App (Capacitor/React Native)。
- [ ] **协作学习模式**: 允许分享薄弱知识点或进行组队练习。
- [ ] **AI 导师增强**: 引入多模态解析（上传错题图片）。
