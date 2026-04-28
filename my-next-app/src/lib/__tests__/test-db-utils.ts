import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { TEST_SCHEMA_SQL } from '../db/test-schema-utils';
import * as schema from '../db/drizzle-schema';

export interface TestDbHelper {
    client: any;
    db: ReturnType<typeof drizzle<typeof schema>>;
    close: () => Promise<void>;
    seedUser: (id: number, username: string) => Promise<void>;
    getSchemaSql: () => string;
}

/**
 * 设置并返回一个初始化好的内存数据库 (Drizzle 版)
 */
export async function setupTestDb(): Promise<TestDbHelper> {
    const client = createClient({ url: ':memory:' });
    const db = drizzle(client, { schema });
    
    // 初始化全表结构
    const statements = TEST_SCHEMA_SQL.split(';');
    for (const statement of statements) {
        const sql = statement.trim();
        if (sql) {
            try {
                await client.execute(sql);
            } catch (err) {
                console.error(`Failed to execute SQL: ${sql.slice(0, 50)}...`, err);
                throw err;
            }
        }
    }

    return {
        client,
        db,
        close: async () => { await client.close(); },
        seedUser: async (id: number, username: string) => {
            await db.run(sql`INSERT INTO users (id, username, password_hash) VALUES (${id}, ${username}, 'test-hash')`);
        },
        getSchemaSql: () => TEST_SCHEMA_SQL
    };
}
