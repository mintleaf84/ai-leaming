import { Database } from 'better-sqlite3';

export async function up(db: any) {
    const sqlite = db as Database;
    console.log('Migrating: Creating question_srs table...');

    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS question_srs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            stability REAL NOT NULL DEFAULT 0,
            difficulty REAL NOT NULL DEFAULT 0,
            elapsed_days INTEGER NOT NULL DEFAULT 0,
            scheduled_days INTEGER NOT NULL DEFAULT 0,
            reps INTEGER NOT NULL DEFAULT 0,
            lapses INTEGER NOT NULL DEFAULT 0,
            state INTEGER NOT NULL DEFAULT 0,
            last_review TEXT,
            due_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, question_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
        );
    `);

    sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_question_srs_due ON question_srs(due_date);
    `);

    console.log('Migrating: question_srs table created.');
}
