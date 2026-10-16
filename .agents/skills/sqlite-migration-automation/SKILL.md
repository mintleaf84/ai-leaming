---
name: sqlite-migration-automation
description: Drizzle ORM 驱动的 SQLite 数据库迁移标准流程。涵盖 Drizzle Kit 生成迁移、自动化执行机制、以及与旧版 SQL 迁移的共存模式。
---

# SQLite 迁移自动化指南 (Drizzle 版)

本指南定义了在 Drizzle ORM 架构下管理 SQLite 数据库变更的标准流程。

## 核心原则

1.  **代码即 Schema**: `drizzle-schema.ts` 是数据库结构的唯一事实来源。
2.  **版本化迁移**: 所有变更必须通过 Drizzle Kit 生成 SQL 迁移文件。
3.  **双轨并行**: 保留旧版 `migrations/` 脚本作为基础地基，新变更使用 Drizzle 迁移。
4.  **启动即执行**: 应用启动时自动运行 `migrate()` 函数，确保环境一致。

## 目录结构

```text
my-next-app/
├── drizzle/                     <-- [Generated] Drizzle Kit 生成的 SQL 迁移文件
├── src/lib/db/
│   ├── drizzle-schema.ts        <-- [Source] 数据库定义文件
│   └── index.ts                 <-- [Runner] 包含 initDatabase() 逻辑
├── drizzle.config.ts            <-- [Config] Drizzle Kit 配置文件
└── scripts/
    └── migrate-runner.ts        <-- [CLI] 供 npm run db:migrate 使用的脚本
```

## 工作流

### 1. 修改 Schema

在 `src/lib/db/drizzle-schema.ts` 中修改表定义。

### 2. 生成迁移文件

运行 Drizzle Kit 检查差异并生成 SQL。

```bash
npx drizzle-kit generate
```

生成的 SQL 文件将存放在 `drizzle/` 目录下。**务必检查生成的 SQL 是否符合预期。**

### 3. 本地测试与同步

在开发环境下同步数据库：

```bash
# 方案 A: 运行迁移逻辑（生产推荐）
npx tsx scripts/migrate-runner.ts

# 方案 B: 强制同步 Schema（开发调试推荐）
npx drizzle-kit push
```

### 4. 自动执行逻辑 (initDatabase)

在 `src/lib/db/index.ts` 中确保包含以下逻辑：

```typescript
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";

export function initDatabase() {
  // 1. 执行旧版 SQL 地基 (可选)
  runOldMigrations(db);

  // 2. 执行 Drizzle 迁移 (核心)
  migrate(drizzleDb, {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
}
```

## 注意事项

- **幂等性**: Drizzle `migrate()` 函数会自动记录已执行的迁移，确保不会重复运行。
- **破坏性变更**: `drizzle-kit push` 在开发环境下非常快，但如果涉及数据删除，它会警告。
- **手动干预**: 严禁直接使用 DB 工具修改表结构。所有修改必须通过 Schema 代码 -> 迁移文件。

## 深度排坑经验 (Lessons Learned)

在真实的高并发与长链路开发中，必须注意以下致命陷阱：

1. **Next.js 异步仪表盘 (Instrumentation) 陷阱**
   - **坑点**：`drizzle-orm` 的 `migrate()` 函数是**异步**的。如果在 `src/instrumentation.ts` 调用数据库初始化时忘记加 `await`，Next.js 会在迁移还在后台运行甚至失败时直接启动服务。这会导致运行时的表结构和 Schema 不一致（如“找不到某列”）。
   - **对策**：必须确保 `initDatabase()` 是 `async` 并在 `instrumentation.ts` 中被严格 `await`。

2. **Next.js 热重载 (HMR) 导致的连接池死锁**
   - **坑点**：在开发环境下 (`npm run dev`)，频繁保存代码会导致多次初始化 `libsqlClient`。这些失去引用的幽灵连接池会一直锁住 SQLite 文件，导致后续的任何事务立即报出 `SQLITE_BUSY: database is locked`。
   - **对策**：
     - 必须将 `libsqlClient` 缓存到 `global` 单例对象中。
     - 强制执行 `client.execute('PRAGMA busy_timeout = 5000;')`，让高并发时主动排队而不是立刻报错崩溃。

3. **ORM 报错混淆视听**
   - **坑点**：Drizzle 抛出的错误 `error.message` 通常只会把执行失败的 SQL 字符串塞进去（如 `Failed query: insert into...`），而把真正的报错原因（如缺字段、缺索引）隐藏在 `error.cause` 中。
   - **对策**：遇到数据库报错，永远不要光看第一层的 `message`，一定要强行捕获并打印出底层的 `error.cause`。
