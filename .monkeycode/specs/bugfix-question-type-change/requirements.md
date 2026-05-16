# Bug 报告：后台题目类型切换导致历史记录显示异常

## 1. 问题概述

管理员在后台将单选题改成多选题时，答案格式未同步转换，导致历史记录页显示异常。

## 2. 问题现象

- 后台将题目类型从 `single` 改为 `multi`
- 历史记录页显示的"正确答案"和"你的答案"显示格式异常
- 原因：单选题答案格式为 `"A"`，多选题应为 `["A","B"]`

## 3. 根本原因分析

### 3.1 答案格式不一致

| 类型 | 答案格式 | 示例 |
|------|---------|------|
| 单选题 | 字符串 | `"A"` |
| 多选题 | JSON 数组 | `["A","B"]` |

### 3.2 类型切换逻辑缺陷

`EditQuestionDialog.tsx:176-180` 行的类型切换处理只处理了 `truefalse` 情况，未处理 `single` ↔ `multi` 切换：

```typescript
// 当前代码只处理了 truefalse 情况
const newOptionsStr = val === 'truefalse' ? '正确\n错误' : (val !== formData.type ? '' : formData.optionsStr);
```

### 3.3 数据流分析

```
后台编辑 → updateQuestionAction → 数据库更新
                                         ↓
历史记录页 → historyService.getSessionDetail → practice_logs JOIN questions
                                         ↓
QuestionCard.tsx → parseAnswer(correctAnswer) → 显示
```

## 4. 影响范围

- **受影响的页面**：练习历史记录页 (`/history/[id]`)
- **受影响的组件**：`QuestionCard` 组件的统计栏
- **数据影响**：所有类型被修改过的题目的历史作答记录

## 5. 验收标准

1. 管理员将单选题改为多选题时，答案自动转换为 JSON 数组格式
2. 管理员将多选题改为单选题时，答案自动取第一个选项
3. 历史记录页正确显示各类题型的答案
4. 切换类型时给出用户提示