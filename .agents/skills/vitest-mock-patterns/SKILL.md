---
name: vitest-mock-patterns
description: Vitest 单元测试中 Mock 的最佳实践与常见陷阱。涵盖 Drizzle ORM 的链式 Mock 模式、异步 Service 模拟、以及 vi.hoisted 的正确用法。
---

# Vitest Mock 模式指南

## 核心陷阱：`vi.clearAllMocks()` 会清除 mockImplementation

这是最常见的隐蔽 Bug。

### 误解：以为 hoisted 里的默认值是"常驻"的

```typescript
// ❌ 错误：hoisted 只执行一次，clearAllMocks 后 mockReturnValue 被抹除
const { mockFn } = vi.hoisted(() => ({
  mockFn: vi.fn().mockResolvedValue({ id: 1 }) // clearAllMocks 后变为空 vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks(); // 这行把上面的 .mockResolvedValue 清掉了！
});
```

### 正确模式：在 beforeEach 里重新注册

```typescript
// ✅ 正确：vi.hoisted 只声明引用，beforeEach 里重新配置
const { mockFn } = vi.hoisted(() => ({
  mockFn: vi.fn() // 只建立引用，不设默认值
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFn.mockResolvedValue({ id: 1 }); // 每次重新设置 ✅
});
```

## Drizzle ORM 链式 Mock 模式

Drizzle 的链式调用（如 `.select().from().where().all()`）需要特殊的 Mock 结构。

### 1. 定义通用链式 Mock (在 `vi.hoisted` 中)

```typescript
const { mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
    const makeChain = () => {
        const chain: any = {
            // 使其成为 thenable 以支持直接 await 链
            then: vi.fn((resolve) => resolve([])),
        };
        const methods = ['insert', 'values', 'update', 'set', 'delete', 'select', 'from', 'where', 'limit', 'offset', 'orderBy', 'all', 'innerJoin', 'leftJoin', 'onConflictDoUpdate'];
        methods.forEach((m) => {
            chain[m] = vi.fn(() => chain); // 默认返回自身
        });
        return chain;
    };

    const chain = makeChain();
    const mockDrizzleDb = {
        ...chain,
        query: {
            users: { findFirst: vi.fn(), findMany: vi.fn() }, // Mock 关系查询
        },
        transaction: vi.fn(async (cb) => cb(chain)), // 事务传入链对象
    };

    return { mockDrizzleDb, mockDrizzleSchema: { /* 映射表字段 */ } };
});

vi.mock('@/lib/db', () => ({
    drizzleDb: mockDrizzleDb,
    drizzleSchema: mockDrizzleSchema,
}));
```

### 2. 在 `beforeEach` 中重置链行为

```typescript
beforeEach(() => {
    vi.clearAllMocks();
    
    // 确保每个链式方法仍然返回链对象（防止被 mockReturnValueOnce 破坏）
    const chain = mockDrizzleDb as any;
    ['select', 'from', 'where', 'limit'].forEach(m => chain[m].mockReturnValue(chain));
    
    // 设置默认返回结果
    chain.all.mockResolvedValue([]);
    chain.then.mockImplementation((resolve: any) => resolve([]));
});
```

## 模拟异步 Service

当 Service 相互依赖时，确保 Mock 返回正确的 Promise。

```typescript
import { getPromptFromDb } from '@/lib/ai/prompts';
vi.mock('@/lib/ai/prompts', () => ({
    getPromptFromDb: vi.fn()
}));

it('should handle async prompts', async () => {
    vi.mocked(getPromptFromDb).mockResolvedValue('My Custom Prompt');
    const result = await myService.execute();
    expect(result).toContain('My Custom Prompt');
});
```

## 三个清除函数的语义

| 函数 | 清除内容 |
|---|---|
| `vi.clearAllMocks()` | 调用记录 + **mockImplementation / mockReturnValue** |
| `vi.resetAllMocks()` | 同上（行为基本相同）|
| `vi.restoreAllMocks()` | 还原原始实现（仅对 `vi.spyOn` 有效）|

## 模拟 Legacy better-sqlite3

如果某些模块仍在使用原始 `db.prepare`，参考以下模式：

```typescript
mockDb.prepare.mockImplementation((sql: string) => {
  if (sql.includes('users')) return { get: () => ({ id: 1 }) };
  return { get: () => null, all: () => [], run: () => ({ changes: 1 }) };
});
```
