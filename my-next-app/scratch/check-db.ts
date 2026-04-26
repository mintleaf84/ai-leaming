import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'ai-learning.db');
console.log(`Checking database at: ${dbPath}`);

const db = new Database(dbPath);

try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables in database:');
    console.log(tables.map(t => (t as any).name).join(', '));

    const migrations = db.prepare("SELECT * FROM __drizzle_migrations").all();
    console.log('\nApplied Drizzle Migrations:');
    console.table(migrations);
} catch (err) {
    console.error('Error checking database:', err);
} finally {
    db.close();
}
