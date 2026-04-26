
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'ai-learning.db');
const db = new Database(dbPath);
try {
    console.log('Adding missing column total_duration_ms to practice_sessions...');
    db.exec("ALTER TABLE practice_sessions ADD COLUMN total_duration_ms INTEGER DEFAULT 0");
    console.log('Done.');
} catch (err: any) {
    if (err.message.includes('duplicate column name')) {
        console.log('Column already exists.');
    } else {
        console.error('Error:', err);
    }
} finally {
    db.close();
}
