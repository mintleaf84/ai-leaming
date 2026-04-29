import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'ai-learning.db');
const db = new Database(dbPath);

try {
    console.log('Adding total_duration_ms to practice_sessions...');
    db.prepare('ALTER TABLE practice_sessions ADD COLUMN total_duration_ms INTEGER DEFAULT 0').run();
    console.log('Success!');
} catch (e: any) {
    if (e.message.includes('duplicate column name')) {
        console.log('Column already exists.');
    } else {
        console.error('Failed:', e.message);
    }
} finally {
    db.close();
}
