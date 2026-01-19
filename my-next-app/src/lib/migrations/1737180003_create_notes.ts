import { Database } from 'better-sqlite3';

export async function up(db: Database) {
    console.log('Migrating: Creating notes table...');

    db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT DEFAULT '无标题',
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
        CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
    `);

    console.log('Migrating: notes table created.');
}

export async function down(db: Database) {
    console.log('Migrating: Dropping notes table...');
    db.exec('DROP TABLE IF EXISTS notes');
}
