import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(process.cwd(), 'data', 'ai-learning.db');
const db = new Database(dbPath);

const migrations = [
    { id: 0, hash: 'manual', created_at: Date.now() }, // 0000
    { id: 1, hash: 'manual', created_at: Date.now() }, // 0001
    { id: 2, hash: 'manual', created_at: Date.now() }, // 0002
    { id: 3, hash: 'manual', created_at: Date.now() }, // 0003
    { id: 4, hash: 'manual', created_at: Date.now() }, // 0004
    { id: 5, hash: 'manual', created_at: Date.now() }, // 0005
];

try {
    console.log('Syncing migration status...');
    const insert = db.prepare('INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (?, ?, ?)');
    
    for (const m of migrations) {
        try {
            insert.run(m.id, m.hash, m.created_at);
            console.log(`✅ Marked migration ${m.id} as completed.`);
        } catch (e: any) {
            console.log(`⚠️ Migration ${m.id} already marked or failed: ${e.message}`);
        }
    }
    console.log('Done.');
} finally {
    db.close();
}
