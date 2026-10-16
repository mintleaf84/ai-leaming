import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "data", "ai-learning.db");
const db = new Database(dbPath);
try {
  console.log("Cleaning up __drizzle_migrations...");
  const result = db
    .prepare("DELETE FROM __drizzle_migrations WHERE id >= 4")
    .run();
  console.log(`Deleted ${result.changes} rows.`);
} catch (err) {
  console.error("Error:", err);
} finally {
  db.close();
}
