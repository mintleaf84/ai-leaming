const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

async function syncMigrations() {
  const dbPath = path.resolve(process.cwd(), "data", "ai-learning.db");
  const db = new Database(dbPath);
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");

  console.log(`[Sync] Connecting to ${dbPath}...`);

  // Ensure table exists
  db.exec(`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash text NOT NULL,
            created_at numeric
        );
    `);

  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));

  for (const entry of journal.entries) {
    const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
    const sql = fs.readFileSync(sqlPath, "utf8");

    // Drizzle hash is sha256 of the SQL content
    const hash = crypto.createHash("sha256").update(sql).digest("hex");

    const existing = db
      .prepare("SELECT * FROM __drizzle_migrations WHERE hash = ?")
      .get(hash);

    if (!existing) {
      console.log(`[Sync] Marking migration ${entry.tag} as completed...`);
      db.prepare(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      ).run(hash, Date.now());
    } else {
      console.log(`[Sync] Migration ${entry.tag} already marked.`);
    }
  }

  db.close();
  console.log("[Sync] Done!");
}

syncMigrations().catch(console.error);
