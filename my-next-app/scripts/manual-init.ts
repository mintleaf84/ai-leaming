import { initDatabase } from '../src/lib/init-db';
import db from '../src/lib/db';

console.log('Starting manual database initialization...');
try {
    initDatabase();
    console.log('Database initialization successful!');

    // Print current tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Current tables:', tables.map((t: any) => t.name));

} catch (error) {
    console.error('Database initialization failed:', error);
} finally {
    process.exit(0);
}
