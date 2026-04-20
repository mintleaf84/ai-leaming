
export async function up(db: unknown) {
    // 1. Check if user_id column exists
    const tableInfo = db.prepare('PRAGMA table_info(chat_sessions)').all() as unknown[];
    const hasUserId = tableInfo.some((col: unknown) => col.name === 'user_id');

    if (!hasUserId) {
        console.log('📝 Adding user_id column to chat_sessions...');
        db.exec(`
      ALTER TABLE chat_sessions 
      ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0
    `);
    }

    // 2. Create Index
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_user 
    ON chat_sessions(user_id, updated_at DESC)
  `);
}
