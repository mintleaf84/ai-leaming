import { db, closeDb } from "../src/lib/db";

async function migrate() {
  console.log("🔄 Starting chat schema migration...");

  try {
    // 1. Check if user_id column exists
    const tableInfo = db
      .prepare("PRAGMA table_info(chat_sessions)")
      .all() as any[];
    const hasUserId = tableInfo.some((col) => col.name === "user_id");

    if (!hasUserId) {
      console.log("📝 Adding user_id column to chat_sessions...");
      // Add column with default value 0 using raw SQL as before
      db.exec(`
                ALTER TABLE chat_sessions 
                ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0
            `);
      console.log("✅ Added user_id column");
    } else {
      console.log("ℹ️ user_id column already exists");
    }

    // 2. Create Index
    console.log("📝 Creating index idx_chat_sessions_user...");
    db.exec(`
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_user 
            ON chat_sessions(user_id, updated_at DESC)
        `);
    console.log("✅ Index created/verified");

    console.log("🎉 Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    closeDb();
  }
}

migrate();
