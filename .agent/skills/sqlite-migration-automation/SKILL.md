---
name: sqlite-migration-automation
description: Best practices and workflow for automated SQLite schema migrations in persistent Docker environments. Use when you need to modify the database structure, add new tables/columns, or debug migration issues in the SQLite + Docker setup.
---

# SQLite Migration Automation

This skill defines the standard workflow for managing SQLite database schema changes in a persistent containerized environment (e.g., Docker with Volumes).

## 核心原则 (Core Principles)

1. **自动化 (Automated)**: 迁移应当在应用启动前自动执行，无需人工干预。
2. **幂等性 (Idempotent)**: 脚本需记录执行状态（`schema_migrations` 表），确保每个脚本只运行一次。
3. **持久化 (Persistent)**: 配合 Docker Volume，确保升级容器时数据不丢失。

## 目录结构 (Directory Structure)

```text
project-root/
├── src/
│   └── lib/
│       └── migrations/          <-- [Store] 存放所有迁移脚本
│           ├── 1737036000_init_schema.ts
│           └── 1737036666_add_column.ts
├── scripts/
│   └── migrate-runner.ts        <-- [Runner] 核心调度器
├── start.sh                     <-- [Entrypoint] 启动脚本
├── Dockerfile                   <-- [Config] 镜像构建配置
└── package.json                 <-- [Script] 定义 db:migrate
```

## 工作流 (Workflow)

### 1. 创建新迁移脚本

在 `src/lib/migrations/` 下新建 TypeScript 文件。
**命名规范**: `UnixTimestamp_Description.ts` (时间戳确保执行顺序)。

**模板**:

```typescript
import db from '../db'; // 或传入的 db 实例

export async function up(db: any) {
    // 检查列是否存在（幂等性双重保障）
    const info = db.prepare("PRAGMA table_info(users)").all();
    if (!info.some((c: any) => c.name === 'new_col')) {
        db.exec("ALTER TABLE users ADD COLUMN new_col TEXT");
    }
}
```

### 2. 本地验证

运行 Runner 检查是否有语法错误并测试逻辑：

```bash
npm run db:migrate
```

### 3. 部署上线

不需要额外操作。
提交代码并部署后，`Dockerfile` defined `CMD ["./start.sh"]` 会自动触发：

1. 运行 `npm run db:migrate`
2. 若成功，启动 `node server.js`
3. 若失败，容器启动终止（防止坏数据启动）

## 关键文件参考 (Reference Implementations)

### `scripts/migrate-runner.ts` (Simplified)

```typescript
// Auto-creates schema_migrations table
// Scans src/lib/migrations/*.ts
// Compares against DB records
// Executes new scripts in strict alphabetical order
```

### `start.sh`

```bash
#!/bin/sh
set -e
echo "Running migrations..."
npm run db:migrate
echo "Starting app..."
node server.js
```
