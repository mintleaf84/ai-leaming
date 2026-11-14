// Ensure required env vars have fallbacks before importing app modules
// (env.ts validates these at import time via @t3-oss/env-nextjs)
process.env.AI_API_KEY = process.env.AI_API_KEY || "migration-placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "migration-placeholder";

/**
 * 数据库迁移唯一入口。
 *
 * 真正的迁移执行者是 `initDatabase()` —— 它调用
 * `migrate(drizzleDb, { migrationsFolder: "drizzle" })`，按
 * `drizzle/*.sql` + `drizzle/meta/_journal.json` 的条目执行并记账到
 * `__drizzle_migrations`。
 *
 * 历史遗留的「扫 `src/lib/migrations/*.ts` 注册表」已经删除：该目录长期为空，
 * 且与 drizzle 迁移是两套互不感知的账本（旧注册表用自己的 schema_migrations
 * 表），保留只会让启动路径多一条永远不会走到的分支。
 */
async function run() {
  console.log("🚀 Starting database migration...");

  // Dynamic import after env vars are set
  const { initDatabase } = await import("../src/lib/db");

  console.log("📦 Initializing base tables...");
  await initDatabase();

  console.log("🎉 Migration finished.");
}

run().catch((error) => {
  console.error("❌ Migration failed");
  console.error(error);
  process.exit(1); // Exit with error to stop deployment
});
