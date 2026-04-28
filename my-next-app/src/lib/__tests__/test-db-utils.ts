import { drizzle } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import { sql } from 'drizzle-orm';
import { TEST_SCHEMA_SQL } from '../db/test-schema-utils';
import * as schema from '../db/drizzle-schema';

import fs from 'fs';
import path from 'path';

export interface TestDbHelper {
    client: Client;
    db: any; // Drizzle 实例
    close: () => Promise<void>;
    seedUser: (id: number, username: string) => Promise<void>;
}

/**
 * 设置并返回一个初始化好的内存数据库 (Drizzle 版)
 */
export async function setupTestDb(): Promise<TestDbHelper> {
    // 为每个测试创建一个独一无二的物理数据库文件，避免 LibSQL 的 file::memory: 连接池导致的跨事务丢表问题
    const dbFileName = `test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`;
    const dbPath = path.join(process.cwd(), dbFileName);
    
    // 使用 LibSQL，与生产环境驱动一致，支持异步事务
    const client = createClient({ url: `file:${dbFileName}` });
    const db = drizzle(client, { schema });
    
    // 动态加载并执行所有迁移文件
    const migrationsDir = path.join(process.cwd(), 'drizzle');
    
    if (fs.existsSync(migrationsDir)) {
        const files = fs.readdirSync(migrationsDir)
            .filter((f: string) => f.endsWith('.sql'))
            .sort();

        for (const file of files) {
            const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            
            // LibSQL 的 execute 可以一次执行多条语句，但最好还是按 statement-breakpoint 切分以防万一
            const statements = sqlContent.split('--> statement-breakpoint');
            for (let statement of statements) {
                statement = statement.trim();
                if (!statement) continue;
                await client.execute(statement);
            }
        }
    } else {
        await client.execute(TEST_SCHEMA_SQL);
    }

    return {
        client,
        db,
        close: async () => { 
            client.close(); 
            // 测试结束清理临时文件
            try {
                if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
                if (fs.existsSync(dbPath + '-journal')) fs.unlinkSync(dbPath + '-journal');
                if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
                if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
            } catch (e) {
                console.error(`Failed to cleanup temp db ${dbFileName}`, e);
            }
        },
        seedUser: async (id: number, username: string) => {
            await db.run(sql`INSERT INTO users (id, username, password_hash) VALUES (${id}, ${username}, 'test-hash')`);
        }
    };
}
