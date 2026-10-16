import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "data", "ai-learning.db");
const db = new Database(dbPath);
try {
  const info = db.prepare("PRAGMA table_info(practice_sessions)").all();
  console.log("Columns:", info.map((c: any) => c.name).join(", "));
} catch (err) {
  console.error("Error:", err);
} finally {
  db.close();
}
