import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDb, type TestDbHelper } from './src/lib/__tests__/test-db-utils';
import * as schema from './src/lib/db/drizzle-schema';

describe('In-Memory DB Test', () => {
    let dbHelper: TestDbHelper;

    beforeEach(async () => {
        dbHelper = await setupTestDb();
    });

    afterEach(async () => {
        await dbHelper.close();
    });

    it('should be able to insert and query data', async () => {
        const { db } = dbHelper;
        
        // Insert a user
        await db.insert(schema.users).values({
            id: 1,
            username: 'testuser',
            password_hash: 'hash'
        });

        // Insert a session
        await db.insert(schema.practice_sessions).values({
            id: 'session-1',
            user_id: 1,
            practice_mode: 'normal'
        });

        // Query with alias
        const rows = await db.select({ mode: schema.practice_sessions.practice_mode })
            .from(schema.practice_sessions)
            .all();

        expect(rows).toEqual([{ mode: 'normal' }]);
    });
});
