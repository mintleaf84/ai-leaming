# AI 教招客观题智能提升系统 - 测试用例集

本项目采用资深测试架构师设计的测试策略，结合等价类划分 (EP)、边界值分析 (BVA) 和错误推测法 (Error Guessing)，重点覆盖核心算法与引擎状态。

## 1. 掌握度算法模块测试 (Mastery Service)

| ID | 测试方法 | 测试场景 | 输入数据 (当前分, 维度, 正确性) | 预期结果 (计算过程与最终分) | 优先级 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **M-01** | EP | 普通正确加分 | Score=50, Dim=Knowledge, Correct=True | 50 + 10 = **60** | High |
| **M-02** | EP | 普通错误扣分 | Score=50, Dim=Knowledge, Correct=False | 50 - 30 = **20** (k=3) | High |
| **M-03** | BVA | 0分边界扣分 (下限保护) | Score=10, Dim=Knowledge, Correct=False | 10 - 30 = -20 $\rightarrow$ **0** (Min=0) | High |
| **M-04** | BVA | 100分边界加分 (上限溢出) | Score=100, Dim=Knowledge, Correct=True | 100 + 10 = **110** (Max=100, 允许溢出至110) | Medium |
| **M-05** | BVA | 110分边界加分 (硬顶) | Score=110, Dim=Knowledge, Correct=True | 110 + 10 = 120 $\rightarrow$ **110** | Low |
| **M-06** | BVA | 99分高惩罚边界 | Score=99, Dim=Knowledge, Correct=False | 99 - 30 = **69** (Score < 100, k=3) | Critical |
| **M-07** | BVA | 100分保护机制触发 | Score=100, Dim=Knowledge, Correct=False | 100 - (10 * 1) = **90** (Score >= 100, k=1) | Critical |
| **M-10** | EP | 应用维度错误 (额外惩罚) | Score=50, Dim=Application, Correct=False | Step1: 50-30=20; Step2: 50*0.3=15; Final: **5** | Critical |
| **M-11** | Error Guess | 浮点数精度处理 | Score=33, Dim=Application, Correct=False | 最终分需验证数据库存储是否能正确处理小数或截断 | Medium |

## 2. 练习引擎状态机测试 (Practice Engine)

| ID | 测试方法 | 测试场景 | 前置状态 (State) | 动作 (Action) | 预期后置状态 & 行为 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P-01** | BVA | 第24题普通流转 | Index=23, Q_Count=25 | ANSWER_QUESTION (Correct) | Status: `practicing`, Index: **24** |
| **P-02** | BVA | 第25题触发复盘 | Index=24, Q_Count=25, ReviewQueue=[1] | ANSWER_QUESTION (Wrong) | Status: **`reviewing`**, ReviewIndex: 0 |
| **P-03** | BVA | 第25题全对不复盘 | Index=24, Q_Count=25, ReviewQueue=[] | ANSWER_QUESTION (Correct) | Status: `practicing`, Index: 25 |
| **P-04** | EP | 复盘步骤流转 | Status=`reviewing`, Step=`study` | COMPLETE_REVIEW_STEP (Success) | Step: **`quiz`** |
| **P-05** | BVA | 复盘熔断机制 | Status=`reviewing`, Fail=2 | COMPLETE_REVIEW_STEP (Fail) | Fail: 3 $\rightarrow$ **NEXT_REVIEW_ITEM** |
| **P-06** | EP | 复盘结束回归练习 | Status=`reviewing` (Last Item) | NEXT_REVIEW_ITEM | Status: `practicing`, **ReviewTriggerAt: 35** |

## 3. 系统集成与异常测试 (Integration)

| ID | 场景 | 测试步骤/输入 | 预期结果 |
| :--- | :--- | :--- | :--- |
| **S-01** | RAG 检索无结果降级 | 模拟 `sqlite-vec` 返回空数组 | 系统回退到纯 LLM 生成，不 Crash |
| **S-02** | 双保险生成超时 | 模拟 API A 超时 > 15s | 自动触发 API B 进行校验或重试 |
| **S-03** | SQL 注入防御 | 标签名输入 `' OR 1=1 --` | 参数化查询确保数据库安全 |
| **S-04** | Zod Schema 校验 | AI 返回非法格式 JSON | 拦截错误并触发重试机制 |

## 4. AI 聊天模块测试 (Chat Features)

| ID | 测试方法 | 测试场景 | 前置条件 | 动作 (Action) | 预期结果 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **C-01** | EP | 发送普通文本消息 | 进入 /chat | 输入 "你好" 并发送 | 1. 输入框清空<br>2. 消息列表中出现用户消息<br>3. AI 开始流式响应 |
| **C-02** | BVA | 发送空消息/纯空格 | 进入 /chat | 输入 "   " 并回车 | 发送被拦截，无网络请求发生 |
| **C-03** | EP | Markdown 代码块渲染 | /chat | AI 返回包含 ```typescript 的内容 | 前端正确渲染为 CodeBlock 组件，具备高亮和复制功能 |
| **C-04** | EP | 会话状态维持 | 已有一轮对话 | 刷新页面 | (当前实现) 历史记录清空<br>(规划目标) 历史记录从 LocalStorage 恢复 |
| **C-05** | Error | API 网络错误 | 断网或 Mock 500 | 发送消息 | Toast 弹出 "发送失败"，输入框内容不丢失 |
| **C-06** | EP | 停止生成 (Stop Generation) | AI 正在输出长文 | 点击停止按钮 | 流式输出立刻中断，保留已生成部分 |
