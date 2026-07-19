# Drizzle ORM 工程化指南

> [!NOTE]
> 本指南总结了从原生 SQL 迁移至 Drizzle ORM 的核心模式与陷阱，适用于 Next.js + SQLite 技术栈。

## 1. 架构与命名规范

### 1.1 模块路径唯一性

**严禁**在同一目录下同时存在 `db.ts` 文件和 `db/` 目录。

- **正确做法**：使用 `src/lib/db/index.ts` 作为唯一入口，统一导出 `db` (Better-SQLite3 实例), `drizzleDb` (Drizzle 实例) 和 `drizzleSchema`。
- **原因**：避免 IDE 和路径解析器在处理 `@/lib/db` 时产生歧义。

### 1.2 Schema 定义

- **蛇形命名**：数据库字段必须使用 `snake_case`（如 `created_at`），在 Drizzle 定义中使用 `text('created_at')` 进行映射。
- **显式非空**：对于业务核心字段，务必添加 `.notNull()`，否则 Drizzle 会将其推断为 `T | null`，导致上层逻辑出现大量非空断言。

## 2. 数据映射 (Data Mapping)

### 2.1 处理 JSON 字段

SQLite 不支持原生 JSON 类型，Drizzle 返回的是字符串。

- **模式**：建立统一的 `mapRowToEntity` 助手函数。

```typescript
function mapQuestion(q: any): Question {
  return {
    ...q,
    options:
      typeof q.options === "string" ? JSON.parse(q.options) : q.options || [],
    // ... 其他 JSON 字段
  };
}
```

- **调用点**：在 Service 层获取数据后立即转换，严禁将原始数据库行直接透传给 UI 组件。

## 3. 异步重构 (Async Refactoring)

### 3.1 链式调用

- 所有 Drizzle 查询必须添加 `await`。
- 当函数从同步转为异步时，必须通过 `npx tsc --noEmit` 扫描所有调用点，确保没有漏掉 `await`。

### 3.2 事务处理

在事务中，务必显式标注 `tx` 的类型或使用 `any`（在类型推断失效时），以维持类型安全：

```typescript
await drizzleDb.transaction(async (tx: any) => {
  await tx.insert(...);
});
```

## 4. 单元测试 Mock 模式

### 4.1 链式 API Mock

使用 `vi.hoisted` 预定义一个支持链式调用的 Mock 对象：

```typescript
const { mockDrizzleDb } = vi.hoisted(() => {
    const chain = {};
    ['insert', 'values', 'where', 'select', 'from'].forEach(m => {
        chain[m] = vi.fn(() => chain);
    });
    return { mockDrizzleDb: { ...chain, query: { ... } } };
});
```

## 5. 迁移与同步流程

1.  **修改 Schema**：在 `drizzle-schema.ts` 中添加列。
2.  **生成脚本**：运行 `npx drizzle-kit generate`。
3.  **运行检查**：运行 `npx tsc --noEmit` 验证代码兼容性。
4.  **自动迁移**：确保 `initDatabase()` 在应用启动时自动运行 `migrate()`。
