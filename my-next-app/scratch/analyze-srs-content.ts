
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'ai-learning.db');
const db = new Database(dbPath);

try {
    const userId = 1;
    
    // 1. 检查 lapses (忘记次数) 的分布
    const lapsesDist = db.prepare(`
        SELECT lapses, COUNT(*) as count 
        FROM question_srs 
        WHERE user_id = ?
        GROUP BY lapses
        ORDER BY lapses DESC
    `).all(userId);
    
    console.log('Lapses distribution:', JSON.stringify(lapsesDist, null, 2));

    // 2. 检查 state (状态) 分布
    // State: 0=New, 1=Learning, 2=Review, 3=Relearning
    const stateDist = db.prepare(`
        SELECT state, COUNT(*) as count 
        FROM question_srs 
        WHERE user_id = ?
        GROUP BY state
    `).all(userId);
    console.log('State distribution (0=New, 1=Learning, 2=Review, 3=Relearning):', JSON.stringify(stateDist, null, 2));

    // 3. 检查最近一次练习记录的正确性分布 (对于在 SRS 中的题目)
    const correctness = db.prepare(`
        SELECT 
            SUM(CASE WHEN lapses > 0 THEN 1 ELSE 0 END) as ever_forgotten,
            SUM(CASE WHEN lapses = 0 THEN 1 ELSE 0 END) as never_forgotten,
            COUNT(*) as total
        FROM question_srs
        WHERE user_id = ?
    `).get(userId) as any;
    console.log('Correctness summary:', JSON.stringify(correctness, null, 2));

} catch (err: any) {
    console.error('Error:', err);
} finally {
    db.close();
}
