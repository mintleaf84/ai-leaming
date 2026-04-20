
export async function up(db: unknown) {
    // Check if token_version column exists
    const tableInfo = db.prepare('PRAGMA table_info(users)').all() as unknown[];
    const hasTokenVersion = tableInfo.some((col: unknown) => col.name === 'token_version');

    if (!hasTokenVersion) {
        console.log('📝 Adding token_version column to users table...');
        db.exec(`
      ALTER TABLE users 
      ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0
    `);
    }
}
