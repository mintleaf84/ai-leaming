import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "data", "ai-learning.db");
const db = new Database(dbPath);

try {
  const userId = 1; // 假设用户 ID 为 1
  const total = db
    .prepare("SELECT COUNT(*) as count FROM question_srs WHERE user_id = ?")
    .get(userId) as { count: number };
  console.log(`Total SRS cards: ${total.count}`);

  const future = db
    .prepare(
      `
        SELECT date(due_date) as date, COUNT(*) as count 
        FROM question_srs 
        WHERE user_id = ? AND date(due_date) >= date('now')
        GROUP BY date
        ORDER BY date ASC
    `,
    )
    .all(userId);
  console.log("Future reviews:", JSON.stringify(future, null, 2));

  const sample = db
    .prepare("SELECT due_date FROM question_srs WHERE user_id = ? LIMIT 5")
    .all(userId);
  console.log("Sample due dates:", JSON.stringify(sample, null, 2));

  const now = db.prepare("SELECT date('now') as now").get() as { now: string };
  console.log("Current date in SQLite:", now.now);
} catch (err: any) {
  console.error("Error:", err);
} finally {
  db.close();
}
