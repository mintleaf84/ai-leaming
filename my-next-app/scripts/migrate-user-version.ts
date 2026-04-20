
import db, { closeDb } from '../src/lib/db';

async function migrate() {
    console.log('🔄 Starting user schema migration (token_version)...');

    try {
        // Check if token_version column exists
        const tableInfo = db.prepare('PRAGMA table_info(users)').all() as any[];
        const hasTokenVersion = tableInfo.some(col => col.name === 'token_version');

        if (!hasTokenVersion) {
            console.log('📝 Adding token_version column to users table...');
            db.exec(`
                ALTER TABLE users 
                ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0
            `);
            console.log('✅ Added token_version column');
        } else {
            console.log('ℹ️ token_version column already exists');
        }

        console.log('🎉 Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        closeDb();
    }
}

migrate();
