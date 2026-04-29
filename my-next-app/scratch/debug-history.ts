import { drizzleDb } from '@/lib/db';
import { practice_sessions, practice_logs } from '@/lib/db/drizzle-schema';
import { eq } from 'drizzle-orm';

async function debug() {
    try {
        const sessions = await drizzleDb.select().from(practice_sessions).limit(5).all();
        console.log('Recent Sessions:', sessions.map(s => ({ id: s.id, name: s.session_name, total: s.total_questions })));

        if (sessions.length > 0) {
            const sid = sessions[0].id;
            console.log('Checking Logs for Session ID:', sid);
            const logs = await drizzleDb.select().from(practice_logs).where(eq(practice_logs.session_id, sid)).all();
            console.log('Logs Count:', logs.length);
        }
    } catch (e) {
        console.error('Debug failed:', e);
    }
}

debug();
