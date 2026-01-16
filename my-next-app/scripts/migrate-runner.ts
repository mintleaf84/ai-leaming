import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import db from '../src/lib/db';

// Migration Interface
interface Migration {
    up: (db: any) => void | Promise<void>;
    down?: (db: any) => void | Promise<void>;
}

async function run() {
    console.log('🚀 Starting database migration...');

    // 1. Ensure migrations table exists
    db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      run_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

    // 2. Get executed migrations
    const executed = new Set(
        (db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map(r => r.name)
    );

    // 3. Discover migration files
    const migrationsDir = path.join(process.cwd(), 'src', 'lib', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.ts'))
        .sort(); // Run in alphabetical order (timestamp prefix ensures chronological order)

    let count = 0;

    for (const file of files) {
        if (executed.has(file)) {
            continue;
        }

        console.log(`⚡ Running migration: ${file}`);

        try {
            // Import the migration module
            const migrationPath = path.join(migrationsDir, file);
            // Use pathToFileURL for dynamic import on Windows
            const migrationUrl = pathToFileURL(migrationPath).href;

            const migrationModule = await import(migrationUrl);

            if (typeof migrationModule.up !== 'function') {
                throw new Error(`Migration ${file} must export an 'up' function.`);
            }

            // Execute 'up'
            await migrationModule.up(db);

            // Record success
            db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);

            console.log(`✅ Completed: ${file}`);
            count++;
        } catch (error) {
            console.error(`❌ Failed: ${file}`);
            console.error(error);
            process.exit(1); // Exit with error to stop deployment
        }
    }

    console.log(`🎉 Migration finished. ${count} new migrations executed.`);
}

run();
