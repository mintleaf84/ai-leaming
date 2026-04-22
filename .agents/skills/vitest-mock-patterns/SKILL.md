---
name: vitest-mock-patterns
description: Vitest 单元测试中 Mock 的最佳实践与常见陷阱。在为 Server Actions、Service 模块或含依赖注入的函数编写 Vitest 测试时使用。核心场景：(1) 使用 vi.hoisted + vi.mock 模拟模块，(2) 使用 vi.clearAllMocks 清理测试状态，(3) 模拟数据库（better-sqlite3）或第三方服务。
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

### 三个清除函数的语义

| 函数 | 清除内容 |
|---|---|
| `vi.clearAllMocks()` | 调用记录 + **mockImplementation / mockReturnValue** |
| `vi.resetAllMocks()` | 同上（行为基本相同）|
| `vi.restoreAllMocks()` | 还原原始实现（仅对 `vi.spyOn` 有效）|

## 模拟动态导入的模块（`vi.mock` + `vi.mocked`）

对于在模块级注册的 `vi.mock`，`clearAllMocks` 不会撤销模块替换本身，但会清空函数实现。
需要在 `beforeEach` 中用 `vi.mocked()` 重新注册：

```typescript
import * as safeQueryModule from '@/lib/db/safe-query';
vi.mock('@/lib/db/safe-query', () => ({ safeGet: vi.fn(), safeAll: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks 后必须重新注册实现
  vi.mocked(safeQueryModule.safeGet).mockImplementation((stmt, params, _schema) => {
    return stmt.get(...params) ?? null;
  });
});
```

## 模拟 better-sqlite3 数据库

按 SQL 内容分发不同的 Mock 返回值：

```typescript
mockDb.prepare.mockImplementation((sql: string) => {
  if (sql.includes('practice_sessions')) return { get: () => ({ id: 's1', ... }) };
  if (sql.includes('practice_logs'))     return { get: () => ({ count: 5 }) };
  if (sql.includes('questions'))         return { all: () => [mockQuestion] };
  return { get: () => null, all: () => [], run: () => ({ changes: 1 }) };
});
```

**注意**：如果业务逻辑里有多次查询同一张表，`sql.includes('表名')` 会匹配到所有调用，导致 Mock 结果混淆。此时改用 `mockReturnValueOnce` 按顺序模拟：

```typescript
mockDb.prepare
  .mockReturnValueOnce({ get: () => sessionData })   // 第一次查 sessions
  .mockReturnValueOnce({ get: () => ({ count: 5 }) }); // 第二次查 logs
```

## 完整的 beforeEach 模板

```typescript
describe('MyAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // 1. 重新设置身份认证 mock
    mockRequireUser.mockResolvedValue({ id: 1, username: 'test' });

    // 2. 重新设置外部服务 mock
    mockExternalService.someMethod.mockReturnValue(false);

    // 3. 重新设置工具函数 mock（如 safeGet）
    vi.mocked(safeQueryModule.safeGet).mockImplementation((stmt, params) => {
      return stmt.get(...params) ?? null;
    });

    // 4. 默认数据库行为
    mockDb.prepare.mockImplementation((_sql: string) => ({
      get: vi.fn().mockReturnValue(undefined),
      all: vi.fn().mockReturnValue([]),
      run: vi.fn().mockReturnValue({ changes: 1 })
    }));
  });
});
```
