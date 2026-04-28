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

## Drizzle ORM 高级链式 Mock (Table-Aware Proxy)

Drizzle 的链式调用（如 `.select().from().where().all()`）容易受到测试间异步竞争（Race Condition）的影响。如果简单地使用顺序的 `mockReturnValueOnce`，一旦内部有异步（Fire-and-Forget）任务并发执行，就会导致 Mock 数据错乱（如著名的 `(intermediate value) is not iterable` 错误）。

### 最佳实践：基于表名的智能路由 (Table-Aware Mock)

不要假设 SQL 的执行顺序，而是让 Mock 引擎根据 `from(table)` 自动决定返回什么数据：

```typescript
vi.mock('@/lib/db', () => {
    const drizzleMock: any = {
        select: vi.fn(() => {
            const chain: any = {
                from: vi.fn((table) => {
                    // 核心：智能捕获表名
                    const tableName = (table as any).name || (table as any)[Symbol.for('drizzle:Name')] || (table as any)._?.name;
                    
                    const tableChain: any = {
                        where: vi.fn(() => {
                            const whereChain: any = {
                                limit: vi.fn(() => ({
                                    // limit(1) 通常被解构：const [row] = await ...
                                    then: (resolve: any) => {
                                        if (tableName === 'users') return resolve([{ id: 1 }]);
                                        if (tableName === 'settings') return resolve([]);
                                        return resolve([]);
                                    }
                                })),
                                all: vi.fn().mockImplementation(() => {
                                    if (tableName === 'settings') return [{ key: 'theme', value: 'dark' }];
                                    return [];
                                }),
                            };
                            return whereChain;
                        }),
                        then: (resolve: any) => resolve([]) // 兜底直接 await select().from()
                    };
                    return tableChain;
                })
            };
            return chain;
        }),
        insert: vi.fn(() => { /* 类似逻辑，可通过 Proxy 拦截 values 和 onConflictDoUpdate */ }),
    };
    return { drizzleDb: drizzleMock };
});
```

## 处理“Fire-and-Forget”异步副作用

在业务代码中，非关键路径的后台任务（如记录日志、更新统计、计算 EMA 阅读速度）通常会去掉 `await` 以防阻塞主流程：
`learnReadingSpeed(...).catch(console.error);`

**致命陷阱**：在测试中，这个后台任务可能会在下一个 `it` 块中才被事件循环挑起执行。此时前一个测试的 Mock 已被重置，导致后台任务拿到错误数据或污染后续测试。

### 最佳实践：显式等待副作用 (`vi.waitFor`)

绝不要在测试结束时就以为流程结束了。必须主动等待预期的副作用实际写入（或等待微任务队列清空）：

```typescript
it('should perform background update', async () => {
    // 触发带有后台更新的服务
    await myService.updateData();

    // ❌ 错误做法：直接断言，此时后台的 insert 可能还没执行
    // expect(capturedValues).toHaveLength(1); 

    // ✅ 正确做法：不断轮询直到副作用落地，带有自动超时
    await vi.waitFor(() => {
        const update = capturedValues.find(v => v.key === 'expected_key');
        if (!update) throw new Error('Not updated yet'); // 抛出错误以触发重试
        expect(update.value).toBe('success');
    }, { timeout: 1000 });
});

it('should NOT update if failed', async () => {
    await myService.updateData(true); // 传入失败条件
    
    // 如果期望【不发生】某事，必须使用 setTimeout 延迟一下，否则假阳性
    await new Promise(r => setTimeout(r, 50)); 
    expect(capturedValues).toHaveLength(0);
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
