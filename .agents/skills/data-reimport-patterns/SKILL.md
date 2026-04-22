---
name: data-reimport-patterns
description: 数据重导入的最佳实践与常见陷阱。在开发数据导入功能（如题库导入、用户数据迁移、外部 API 数据同步）时使用，确保 Drizzle ORM 下的幂等更新。
---

# 数据重导入最佳实践 (Drizzle 版)

## 核心问题

**场景**：用户首次导入数据时发生错误（解析 bug、数据不完整等），后续重新导入正确数据时，如果逻辑只考虑"补充"，错误数据将永远得不到修复。

## 正确模式 ✅ (Drizzle ORM)

利用 `onConflictDoUpdate` (Upsert) 模式确保每次导入都能强制覆盖核心业务字段。

```typescript
import { drizzleDb, drizzleSchema } from '@/lib/db';

async function importItem(item: any) {
  await drizzleDb.insert(drizzleSchema.items)
    .values({
      id: item.id,
      type: item.type,
      content: item.content,
      answer: item.answer,
      options: JSON.stringify(item.options),
      metadata: item.metadata,
    })
    .onConflictDoUpdate({
      target: drizzleSchema.items.id,
      set: {
        // 核心：在冲突时更新所有可能错误的业务字段
        type: item.type,
        content: item.content,
        answer: item.answer,
        options: JSON.stringify(item.options),
        metadata: item.metadata,
        updated_at: sql`CURRENT_TIMESTAMP`,
      },
    });
}
```

## 设计原则

1.  **幂等性**：相同输入多次导入，结果应一致。
2.  **强制修正**：重导入时更新所有业务相关字段，不只是"补充"缺失字段。
3.  **区分系统字段**：保留 `created_at`，更新 `updated_at`。

## 字段分类决策

| 字段类型 | 重导入时是否更新 | 示例 |
| :--- | :--- | :--- |
| **业务核心字段** | ✅ 必须更新 | `type`, `answer`, `options`, `content` |
| **补充信息字段** | ✅ 建议更新 | `explanation`, `material`, `source` |
| **统计字段** | ⚠️ 按需更新 | `correct_ratio`, `view_count` |
| **系统字段** | ❌ 不更新 | `created_at`, `id` |

## 检查清单

开发导入功能时，请回答：

- [ ] 首次导入错误（如 `type` 标错）后，重导入能否修复？
- [ ] `onConflictDoUpdate` 的 `set` 子句是否包含所有业务核心字段？
- [ ] 字段解析逻辑（如 `JSON.parse`）是否有健壮性处理，防止重导入时崩溃？
