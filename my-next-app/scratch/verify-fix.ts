
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'ai-learning.db');
const db = new Database(dbPath);
try {
    const count = db.prepare("SELECT COUNT(*) as count FROM question_srs").get();
    console.log('Question SRS count:', count);
} catch (err) {
    console.error('Error:', err);
} finally {
    db.close();
}
