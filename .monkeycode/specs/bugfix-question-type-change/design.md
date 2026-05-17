# 技术设计方案：修复题目类型切换导致的答案格式问题

## 1. 方案概述

在后台题目编辑弹窗中，当管理员切换题目类型时（特别是 `single` ↔ `multi`），自动将答案转换为目标类型对应的格式。

## 2. 修改方案

### 2.1 修改文件

`src/app/admin/components/EditQuestionDialog.tsx`

### 2.2 修改内容

#### 2.2.1 新增答案转换辅助函数

在文件顶部添加答案转换函数：

```typescript
/**
 * 将答案转换为目标类型对应的格式
 * @param currentAnswer 当前答案
 * @param targetType 目标类型 'single' | 'multi' | 'truefalse'
 * @param options 当前选项列表
 */
function convertAnswerFormat(
  currentAnswer: string,
  targetType: 'single' | 'multi' | 'truefalse',
  options: string[]
): string {
  if (!currentAnswer) return '';

  const trimmed = currentAnswer.trim();
  let currentArr: string[];

  // 解析当前答案为数组
  if (trimmed.startsWith('[')) {
    try {
      currentArr = JSON.parse(trimmed);
    } catch {
      currentArr = [trimmed];
    }
  } else if (trimmed.includes(',')) {
    currentArr = trimmed.split(',').map(s => s.trim());
  } else {
    currentArr = [trimmed];
  }

  // 根据目标类型转换
  switch (targetType) {
    case 'multi':
      return JSON.stringify(currentArr);

    case 'single':
    case 'truefalse':
      // 取第一个有效答案
      if (currentArr.length === 0) return '';
      const firstAnswer = currentArr[0];
      // 单选题需要验证答案是否在选项中
      if (options.length > 0 && !options.includes(firstAnswer)) {
        return options[0]; // 回退到第一个选项
      }
      return firstAnswer;

    default:
      return currentAnswer;
  }
}
```

#### 2.2.2 修改类型切换处理逻辑

找到 `onValueChange` 回调（第 176 行附近），修改为：

```typescript
onValueChange={(val) => {
  const newType = val as 'single' | 'multi' | 'truefalse';
  const oldType = formData.type;

  // 判断题选项固定
  let newOptionsStr = formData.optionsStr;
  if (newType === 'truefalse') {
    newOptionsStr = '正确\n错误';
  }

  // 切换类型时转换答案格式
  let newAnswer = formData.answer;
  if (newType !== oldType) {
    // 先计算新的选项列表用于校验
    const checkOptions = newType === 'truefalse'
      ? ['正确', '错误']
      : newOptionsStr.split("\n").map(s => s.trim()).filter(Boolean);

    newAnswer = convertAnswerFormat(formData.answer, newType, checkOptions);
  }

  setFormData(prev => ({
    ...prev,
    type: newType,
    optionsStr: newOptionsStr,
    answer: newAnswer
  }));
}}
```

### 2.3 用户体验优化

在类型切换时添加提示信息，告知用户答案已自动转换：

```typescript
// 在 onValueChange 回调中添加提示
if (newType !== oldType && formData.answer) {
  toast.info(`答案已自动转换为${newType === 'multi' ? '多选' : '单选'}格式`);
}
```

## 3. 数据一致性保障

### 3.1 历史数据修复

对于已经存在的数据问题，提供数据库迁移脚本：

```sql
-- 将 type='multi' 但 answer 不是 JSON 格式的记录修复
UPDATE questions
SET answer = '["' || answer || '"]'
WHERE type = 'multi'
  AND answer IS NOT NULL
  AND answer != ''
  AND answer NOT LIKE '[%';

-- 将 type='single' 但 answer 是 JSON 格式的记录修复（取第一个）
UPDATE questions
SET answer = json_extract(answer, '$[0]')
WHERE type = 'single'
  AND answer LIKE '[%';
```

### 3.2 幂等性

- 转换函数可重复执行，结果一致
- 已符合目标格式的答案不会被重复处理

## 4. 测试用例

| 输入答案 | 原类型 | 目标类型 | 预期输出 |
|---------|--------|----------|----------|
| `"A"` | single | multi | `["A"]` |
| `"A,B"` | single | multi | `["A","B"]` |
| `["A","B"]` | multi | single | `"A"` |
| `"A"` | single | truefalse | `"A"` |
| `""` | single | multi | `""` |

## 5. 风险评估

- **低风险**：纯前端 UI 逻辑修改，不影响现有练习流程
- **兼容性**：已处理空值、非法 JSON 等边界情况
- **回滚**：如有问题，可快速回滚代码