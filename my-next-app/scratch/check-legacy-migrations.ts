import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "data", "ai-learning.db");
const db = new Database(dbPath);
try {
  const migrations = db.prepare("SELECT * FROM schema_migrations").all();
  console.log("Legacy Migrations:", JSON.stringify(migrations, null, 2));
} catch (err) {
  console.error("Error:", err);
} finally {
  db.close();
}
