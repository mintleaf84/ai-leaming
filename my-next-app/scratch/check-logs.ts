
import { drizzleDb, drizzleSchema } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function checkLogs() {
    try {
        const logs = await drizzleDb.select().from(drizzleSchema.practice_logs).limit(10).all();
        console.log('Sample logs:', JSON.stringify(logs, null, 2));
        
        const count = await drizzleDb.select({ count: sql<number>`count(*)` }).from(drizzleSchema.practice_logs).get();
        console.log('Total logs:', count);
    } catch (err) {
        console.error('Error checking logs:', err);
    }
}

checkLogs();
