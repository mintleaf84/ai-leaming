---
name: data-reimport-patterns
description: 数据重导入的最佳实践与常见陷阱。在开发数据导入功能（如题库导入、用户数据迁移、外部 API 数据同步）时使用，避免"只补充不修正"的设计缺陷。
---

# 数据重导入最佳实践

## 核心问题

**场景**：用户首次导入数据时发生错误（解析 bug、数据不完整等），后续重新导入正确数据时，错误数据未被修复。

**根因**：重导入逻辑只考虑"补充缺失信息"，未考虑"修正错误信息"。

## 反模式 ❌

```typescript
if (existing) {
    // 只更新部分字段，核心字段（如 type、answer）未更新
    db.prepare(`
        UPDATE items 
        SET description = ?, metadata = ?
        WHERE id = ?
    `).run(item.description, item.metadata, existing.id);
}
```

**问题**：`type`、`answer` 等核心字段错误后，永远无法通过重导入修复。

## 正确模式 ✅

```typescript
if (existing) {
    // 更新所有可能变化的字段
    db.prepare(`
        UPDATE items 
        SET type = ?, answer = ?, options = ?,
            description = ?, metadata = ?
        WHERE id = ?
    `).run(
        item.type,
        item.answer,
        JSON.stringify(item.options),
        item.description,
        item.metadata,
        existing.id
    );
}
```

## 设计原则

1. **幂等性**：相同输入多次导入，结果应一致
2. **完整性**：重导入时更新所有业务相关字段，不只是"补充"字段
3. **可追溯**：考虑记录更新历史（可选）

## 字段分类决策

| 字段类型 | 重导入时是否更新 | 示例 |
|----------|------------------|------|
| 业务核心字段 | ✅ 必须更新 | `type`, `answer`, `options`, `content` |
| 补充信息字段 | ✅ 建议更新 | `explanation`, `material`, `source` |
| 统计字段 | ⚠️ 按需更新 | `correct_ratio`, `view_count` |
| 系统字段 | ❌ 不更新 | `created_at`, `id` |

## 检查清单

开发导入功能时，回答以下问题：

- [ ] 首次导入错误后，重导入能否修复？
- [ ] 核心业务字段是否在 UPDATE 语句中？
- [ ] 是否有字段被遗漏（尤其是 `type`、状态字段）？
