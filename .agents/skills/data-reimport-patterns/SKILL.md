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
import { drizzleDb } from "@/lib/db";
import { questions } from "@/lib/db/drizzle-schema";

async function importItem(item: any) {
  await drizzleDb
    .insert(questions)
    .values({
      id: item.id,
      type: item.type,
      content: item.content,
      answer: item.answer,
      options: JSON.stringify(item.options),
      metadata: item.metadata,
    })
    .onConflictDoUpdate({
      target: questions.id,
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

| 字段类型         | 重导入时是否更新 | 示例                                   |
| :--------------- | :--------------- | :------------------------------------- |
| **业务核心字段** | ✅ 必须更新      | `type`, `answer`, `options`, `content` |
| **补充信息字段** | ✅ 建议更新      | `explanation`, `material`, `source`    |
| **统计字段**     | ⚠️ 按需更新      | `correct_ratio`, `view_count`          |
| **系统字段**     | ❌ 不更新        | `created_at`, `id`                     |

## 检查清单

开发导入功能时，请回答：

- [ ] 首次导入错误（如 `type` 标错）后，重导入能否修复？
- [ ] `onConflictDoUpdate` 的 `set` 子句是否包含所有业务核心字段？
- [ ] 字段解析逻辑（如 `JSON.parse`）是否有健壮性处理，防止重导入时崩溃？

## 深度踩坑教训 (Lessons Learned)

大批量数据（如题库、记录）导入时，极易触发以下灾难：

### 1. Upsert (ON CONFLICT) 的强制“唯一约束”陷阱

- **现象**：执行 `.onConflictDoUpdate({ target: column })` 时，终端抛出 `SQLITE_ERROR: ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint`，并且所有明细数据均插入失败。
- **真相**：SQLite 和绝大部分关系型数据库一样，只有在 `target` 列明确具备 **唯一约束 (UNIQUE INDEX / UNIQUE CONSTRAINT)** 时，才允许执行 Upsert。如果旧版 SQL 脚本错误地只建了一个普通索引，ORM 层面看不出毛病，但运行时会被底层拦截。
- **对策**：必须通过 `npx drizzle-kit generate` 或原生 SQL 检查物理数据库表，确认 `target` 列绝对是唯一的。

### 2. 长事务包揽大批量 JS 计算造成的 SQLITE_BUSY 死锁

- **现象**：如果将整个由数百道题组成的循环（里面含有大量的业务拼接、循环嵌套等计算）包在 `await drizzleDb.transaction(async (tx) => { ... })` 内部，会导致 Next.js 的其他普通并发查询全面爆出 `SQLITE_BUSY: database is locked`。
- **真相**：单文件的 SQLite（甚至 LibSQL）极度畏惧长命名的排他写锁。在事务内部跑费时的 JS 异步和计算逻辑，实际上是霸占了数据库写入权不放手。
- **对策 (K.I.S.S.)**：
  - **拆解事务**：如果底层插入全都是高健壮性的幂等 Upsert，对于不需要强一致原子回滚的辅助场景（比如导自己的个人题库），应**果断剥离长事务包装**。改为小批量顺序提交，用微不足道的性能损耗换取系统的永生死锁免疫。
