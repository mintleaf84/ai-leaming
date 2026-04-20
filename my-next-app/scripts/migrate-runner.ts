import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import db from '../src/lib/db';
import { createTables } from '../src/lib/db/schema';

// Migration Interface
interface _Migration {
    up: (db: unknown) => void | Promise<void>;
    down?: (db: unknown) => void | Promise<void>;
}

async function run() {
    console.log('🚀 Starting database migration...');

    // 0. Ensure base tables exist
    console.log('📦 Initializing base tables...');
    createTables(db);

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
        .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
        // 去重：如果同时存在 foo.ts 和 foo.js，只保留一个
        .reduce((acc: string[], f) => {
            const base = f.replace(/\.(ts|js)$/, '');
            if (!acc.some(x => x.replace(/\.(ts|js)$/, '') === base)) acc.push(f);
            return acc;
        }, [])
        .sort(); // 按时间戳前缀的字母序保证执行顺序

    let count = 0;

    for (const file of files) {
        // 去掉扩展名后作为唯一标识（兼容 .ts/.js 共存场景）
        const migrationName = file.replace(/\.(ts|js)$/, '') + '.ts'; // 统一记录为 .ts
        if (executed.has(migrationName) || executed.has(file)) {
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

            // Record success（统一记录为 .ts 名称，保持与开发环境一致）
            db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migrationName);

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
