# 系统页面资产清单 (Page Registry)

这份文档是项目的前端路由地图，用于追踪每个页面的功能、状态和维护记录。在进行全局性重构（如汉化、UI 升级）时，请务必遍历此清单。

## 1. 核心用户流 (User Core)

| 路由路径               | 页面组件文件                       | 功能描述                                             | 汉化 | 移动端适配 | 备注                                                              |
| :--------------------- | :--------------------------------- | :--------------------------------------------------- | :--- | :--------- | :---------------------------------------------------------------- |
| **`/`**                | `src/app/page.tsx`                 | **首页 (Landing)**: 系统入口，提供练习和仪表盘导航。 | ✅   | ✅         | 展示核心价值主张。                                                |
| **`/login`**           | `src/app/login/page.tsx`           | **登录页**: 用户身份验证。                           | ✅   | ✅         | 包含基础表单校验。                                                |
| **`/register`**        | `src/app/register/page.tsx`        | **注册页**: 新用户开户。                             | ✅   | ✅         | 包含密码一致性校验。                                              |
| **`/dashboard`**       | `src/app/dashboard/page.tsx`       | **仪表盘**: 知识概览与数据管理。                     | ✅   | ✅         | 集成 D3.js 知识图谱。                                             |
| **`/practice`**        | `src/app/practice/page.tsx`        | **练习引擎**: 核心答题页，包含复盘状态机。           | ✅   | ✅         | 支持单选/多选、AI 复盘及第一性原理标注。                          |
| **`/practice/setup`**  | `src/app/practice/setup/page.tsx`  | **练习配置**: 模式选择与参数配置。                   | ✅   | ✅         | Phase 16 新增；Flutter 端已同步（`practice_setup_screen.dart`）。 |
| **`/report`**          | `src/app/report/page.tsx`          | **分析报告**: 练习结算与 AI 诊断展示。               | ✅   | ✅         | 包含维度雷达图。                                                  |
| **`/history`**         | `src/app/history/page.tsx`         | **练习记录**: 历史练习会话列表。                     | ✅   | ✅         | 按时间倒序排列。                                                  |
| **`/history/[id]`**    | `src/app/history/[id]/page.tsx`    | **会话详情**: 历史题目回溯与错因分析。               | ✅   | ✅         | 支持回顾复盘内容。                                                |
| **`/wrong-book`**      | `src/app/wrong-book/page.tsx`      | **错题本**: 记录与重练错题。                         | ✅   | ✅         | 与移动端对齐的新增功能。                                          |
| **`/questions`**       | `src/app/questions/page.tsx`       | **全量题库**: C端题目浏览与检索。                    | ✅   | ✅         | 与移动端对齐的新增功能。                                          |
| **`/knowledge`**       | `src/app/knowledge/page.tsx`       | **知识库**: 知识卡片与概念学习。                     | ✅   | ✅         | 支持 3D 旋转卡片。                                                |
| **`/knowledge-graph`** | `src/app/knowledge-graph/page.tsx` | **独立知识图谱**: 专门的全局图谱展示页。             | ✅   | ❌         | Web 端独有进阶功能。                                              |
| **`/textbooks`**       | `src/app/textbooks/page.tsx`       | **教材库**: 教材列表与管理。                         | ✅   | ✅         | 新增功能。                                                        |
| **`/textbooks/[id]`**  | `src/app/textbooks/[id]/page.tsx`  | **教材阅读**: 教材目录与内容阅读。                   | ✅   | ✅         | 支持 Markdown 渲染与目录导航。                                    |
| **`/notes`**           | `src/app/notes/page.tsx`           | **笔记系统**: 学习笔记记录与管理。                   | ✅   | ❌         | Web 端独有进阶功能。                                              |
| **`/mindmap`**         | `src/app/mindmap/page.tsx`         | **思维导图**: 知识结构可视化。                       | ✅   | ❌         | Web 端独有进阶功能。                                              |
| **`/ocr`**             | `src/app/ocr/page.tsx`             | **OCR 识别**: 图像文本提取功能。                     | ✅   | ❌         | Web 端独有进阶功能。                                              |
| **`/cultivation`**     | `src/app/cultivation/page.tsx`     | **养成系统**: 学习游戏化养成玩法。                   | ✅   | ❌         | Web 端独有进阶功能。                                              |
| **`/chat`**            | `src/app/chat/page.tsx`            | **AI 助手**: 智能教研助手。                          | ✅   | ✅         | 支持流式协议与思维链。                                            |
| **`/profile`**         | `src/app/profile/page.tsx`         | **个人中心**: 账户、订阅、用量与学习成就。           | ✅   | ✅         | Phase 15 新增。                                                   |
| **`/settings`**        | `src/app/settings/page.tsx`        | **系统设置**: 偏好、外观与数据导出。                 | ✅   | ✅         | 支持数据重置与导出。                                              |
| **`/docs`**            | `src/app/docs/page.tsx`            | **使用文档**: 面向学生用户的功能使用说明。           | ✅   | ❌         | 包含侧边导航与章节锚点。                                          |

## 2. 管理与后台 (Admin)

| 路由路径               | 页面组件文件                       | 功能描述                                 | 汉化 | 移动端适配 | 备注                                  |
| :--------------------- | :--------------------------------- | :--------------------------------------- | :--- | :--------- | :------------------------------------ |
| **`/admin`**           | `src/app/admin/page.tsx`           | **题库概览**: 试题统计与管理入口。       | ✅   | ❌         | 已完成基本汉化。                      |
| **`/admin/questions`** | `src/app/admin/questions/page.tsx` | **题目管理**: 题目 CRUD、批量导入/导出。 | ✅   | ❌         | 支持单选/多选/判断题管理。            |
| **`/admin/users`**     | `src/app/admin/users/page.tsx`     | **用户管理**: 查看用户、订阅状态及权限。 | ✅   | ❌         | 新增订阅管理功能。                    |
| **`/admin/plans`**     | `src/app/admin/plans/page.tsx`     | **套餐管理**: 配置订阅套餐与用量限制。   | ✅   | ❌         | Phase 14 新增。                       |
| **`/admin/system`**    | `src/app/admin/system/page.tsx`    | **系统配置**: 功能开关与系统健康监控。   | ✅   | ❌         | 含 `ENABLE_INTELLIGENT_REVIEW` 开关。 |
| **`/admin/ai`**        | `src/app/admin/ai/page.tsx`        | **AI 管理**: Prompt 管理与调试操场。     | ✅   | ❌         | 支持模型路由与 Rerank 配置。          |
| **`/admin/activity`**  | `src/app/admin/activity/page.tsx`  | **操作日志**: 管理员行为审计。           | ✅   | ❌         | 按时间倒序排列。                      |
| **`/admin/api-keys`**  | `src/app/admin/api-keys/page.tsx`  | **API 密钥**: 管理 AI 服务商密钥。       | ✅   | ❌         | 支持多服务商密钥切换。                |
| **`/pricing`**         | `src/app/pricing/page.tsx`         | **定价页面**: 套餐对比与订阅信息。       | ✅   | ✅         | Phase 14 新增；Flutter 端已同步。     |

## 3. 系统级页面 (System)

| 路由路径       | 文件位置                           | 描述                                   | 汉化 | 备注               |
| :------------- | :--------------------------------- | :------------------------------------- | :--- | :----------------- |
| **Error**      | `src/components/ErrorBoundary.tsx` | **全局错误页**: 捕获渲染崩溃。         | ✅   | 优雅降级展示。     |
| **Toast**      | `sonner` (Global)                  | **全局提示**: 反馈操作结果。           | ✅   | 统一视觉样式。     |
| **Not Found**  | `src/app/not-found.tsx`            | **404 页面**: 资源不存在提示。         | ✅   | 包含返回首页链接。 |
| **`/offline`** | `src/app/offline/page.tsx`         | **离线提示页**: PWA 离线状态降级展示。 | ✅   | PWA 支持。         |

---

## 维护检查表 (Checklist)

每次新增页面或进行全局修改时，请检查：

1. [x] 路由是否已注册到本表？
2. [x] UI 文本是否全量提取并汉化？
3. [x] 响应式布局在 `< 768px` 宽度下是否正常？
4. [x] 是否包含必要的 Error Boundary？
