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
  mockFn: vi.fn().mockResolvedValue({ id: 1 }), // clearAllMocks 后变为空 vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks(); // 这行把上面的 .mockResolvedValue 清掉了！
});
```

### 正确模式：在 beforeEach 里重新注册

```typescript
// ✅ 正确：vi.hoisted 只声明引用，beforeEach 里重新配置
const { mockFn } = vi.hoisted(() => ({
  mockFn: vi.fn(), // 只建立引用，不设默认值
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFn.mockResolvedValue({ id: 1 }); // 每次重新设置 ✅
});
```

## Drizzle ORM 高级链式 Mock (Stable Proxy Pattern)

Drizzle 的链式调用（如 `.select().from().where().all()`）如果使用简单的 `vi.fn()` 模拟，在处理多个测试用例时非常脆弱。

### 核心挑战

1.  **Mock 不稳定**: 如果每次访问 `get()` 或 `all()` 都返回一个新的 `vi.fn()`，则测试中通过 `mockResolvedValueOnce` 设置的手动 Mock 会失效。
2.  **数据泄漏**: 测试间注入的模拟数据（如 `injectTableData`）如果不清理，会导致后续测试污染。
3.  **Await 挂起**: 直接 `await` 一个 query builder 会触发 `.then()` 调用，如果 Mock 处理不当会导致测试超时。

### 最佳实践：Proxy Apply Trap 模式

通过 Proxy 的 `apply` 陷阱拦截对稳定 Mock 函数的调用，既能实现动态逻辑，又能保留手动配置的能力。

```typescript
// db-mock-utils.ts 中的核心逻辑
export const createTableAwareDrizzleMock = (initialTableData = {}) => {
  const baseMock = createDrizzleMock(); // 返回一个带有很多 vi.fn() 的对象
  const tableData = { ...initialTableData };
  let currentTable: string | null = null;

  return new Proxy(baseMock, {
    get: (target, prop) => {
      // 1. 拦截执行方法 (get, all, run, execute)
      if (["get", "all", "run", "execute"].includes(prop)) {
        return new Proxy(target[prop], {
          apply: (fnTarget, thisArg, args) => {
            const table = currentTable;
            currentTable = null; // 消费后重置

            // 优先级 A: 注入的表数据
            if (table && tableData[table]) {
              const data = tableData[table];
              return Promise.resolve(prop === "get" ? data[0] || null : data);
            }

            // 优先级 B: 手动配置的 Mock (mockResolvedValueOnce 等)
            return Reflect.apply(fnTarget, thisArg, args);
          },
        });
      }

      // 2. 拦截表名识别 (from, update 等)
      if (["from", "update", "insert", "delete"].includes(prop)) {
        return (table: any) => {
          const tableName =
            typeof table === "string" ? table : table?.name || table?._?.name;
          if (tableName) currentTable = tableName;
          return target[prop](table);
        };
      }

      return target[prop];
    },
  });
};
```

## 处理 Awaitable Query Builder (Mocking `.then`)

当代码中出现 `const logs = await drizzleDb.select().from(table)` 时，JavaScript 引擎会调用 `proxy.then(resolve, reject)`。

### ❌ 错误做法：使用 `mockResolvedValue`

```typescript
// 会导致测试超时！因为 await 期待 resolve 被调用，而 mockResolvedValue 只是返回一个 Promise
mockDb.then.mockResolvedValueOnce(mockLogs);
```

### ✅ 正确做法：使用 `mockImplementation`

```typescript
// 显式调用 resolve，让 await 语句继续执行
mockDb.then.mockImplementationOnce((resolve) => resolve(mockLogs));
```

## 测试间的清理 (Clean Slate)

当使用 Proxy 或单例 Mock 时，必须在 `beforeEach` 中彻底重置。

```typescript
beforeEach(() => {
  // 1. 重置链式调用的返回值 (如 get 默认返回 [])
  resetDrizzleMock(mockDb);
  // 2. 清空 Proxy 内部注入的 Table 数据
  mockDb.resetTableData?.();
  // 3. 清除调用记录与 implementation
  vi.clearAllMocks();
});
```

## LibSQL 内存数据库陷阱：避免使用 `file::memory:`

当我们在 Vitest 中放弃全量 Mock，转而使用真实的内存数据库（如使用 `@libsql/client` 配合 Drizzle）时，有一个极易踩坑的反模式。

### ❌ 错误做法：使用 `file::memory:`

```typescript
// 这种写法会导致“跨事务丢表”的诡异 Bug
const client = createClient({ url: "file::memory:" });
const db = drizzle(client, { schema });
```

**坑点剖析**：
LibSQL 的客户端内部实现了连接池（Connection Pool）。对于 `file::memory:` 而言，由于它不像原生 SQLite 支持 `cache=shared` 的内存共享，**每一个底层连接都会获得一个全新、完全隔离且为空的内存数据库**。
这就导致：当你执行 `await db.transaction(...)` 时，驱动可能会从连接池分配一个连接（事务执行成功）；而事务结束后的下一次查询 `await db.select()...`，驱动可能会分配一个**新的连接**，面对一个空库，从而抛出令人费解的 `SQLITE_ERROR: no such table`。

### ✅ 正确做法：为每个测试生成临时物理文件

放弃 `file::memory:`，使用每次测试唯一的真实本地 `.db` 文件，并在 `afterEach` 中严格清理。

```typescript
// db-utils.ts
import fs from "fs";
import path from "path";

export async function setupTestDb() {
  // 1. 为每个测试生成独一无二的文件名，确保并发测试互相隔离
  const dbFileName = `test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`;
  const dbPath = path.join(process.cwd(), dbFileName);

  // 2. 连接真实的物理文件
  const client = createClient({ url: `file:${dbFileName}` });
  const db = drizzle(client, { schema });

  // 3. 运行迁移...
  // ...

  return {
    client,
    db,
    close: async () => {
      client.close();
      // 4. 测试结束后，清理临时文件及其副产物 (WAL/SHM)
      try {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        if (fs.existsSync(dbPath + "-journal"))
          fs.unlinkSync(dbPath + "-journal");
        if (fs.existsSync(dbPath + "-wal")) fs.unlinkSync(dbPath + "-wal");
        if (fs.existsSync(dbPath + "-shm")) fs.unlinkSync(dbPath + "-shm");
      } catch (e) {
        console.error(`Failed to cleanup temp db ${dbFileName}`, e);
      }
    },
  };
}
```

因为是真实物理文件，无论连接池开多少个连接，它们访问的都是**同一个数据库**，完美避免了连接池带来的幽灵丢表问题。
