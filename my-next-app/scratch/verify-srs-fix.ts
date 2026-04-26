
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'ai-learning.db');
const db = new Database(dbPath);

try {
    const userId = 1;
    
    const futureDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d.toISOString().split('T')[0];
    });

    const rawFutureRows = db.prepare(`
        SELECT 
        CASE 
            WHEN date(due_date) <= date('now') THEN date('now')
            ELSE date(due_date)
        END as date,
        COUNT(*) as count
        FROM question_srs
        WHERE user_id = ? AND date(due_date) <= date('now', '+7 days')
        GROUP BY date
    `).all(userId) as { date: string; count: number }[];

    const futureRows = futureDays.map(day => {
        const row = rawFutureRows.find(r => r.date === day);
        return {
        date: day,
        count: row?.count || 0
        };
    });

    console.log('Resulting futureRows:', JSON.stringify(futureRows, null, 2));

} catch (err: any) {
    console.error('Error:', err);
} finally {
    db.close();
}
