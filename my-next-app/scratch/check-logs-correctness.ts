import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "data", "ai-learning.db");
const db = new Database(dbPath);

try {
  const userId = 1;
  const logsDist = db
    .prepare(
      `
        SELECT is_correct, COUNT(*) as count 
        FROM practice_logs 
        WHERE user_id = ?
        GROUP BY is_correct
    `,
    )
    .all(userId);
  console.log(
    "Practice logs correctness distribution (0=Wrong, 1=Correct):",
    JSON.stringify(logsDist, null, 2),
  );

  const srsLogs = db
    .prepare(
      `
        SELECT q.id, q.content, s.lapses, s.reps, s.state
        FROM question_srs s
        JOIN questions q ON s.question_id = q.id
        WHERE s.user_id = ?
        LIMIT 10
    `,
    )
    .all(userId);
  console.log("Sample SRS entries:", JSON.stringify(srsLogs, null, 2));
} catch (err) {
  console.error("Error:", err);
} finally {
  db.close();
}
