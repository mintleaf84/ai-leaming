import { drizzleDb } from "@/lib/db";
import * as schema from "@/lib/db/drizzle-schema";

async function checkSchema() {
  console.log("Checking all tables for missing columns...");
  for (const [tableName, table] of Object.entries(schema)) {
    if (
      (typeof table === "object" && "id" in table) ||
      (table as any)._?.name
    ) {
      const actualTableName = (table as any)._?.name || tableName;
      try {
        // Try to select 1 row to see if it fails
        await drizzleDb
          .select()
          .from(table as any)
          .limit(1)
          .all();
        // console.log(`✅ Table ${actualTableName} looks good.`);
      } catch (e: any) {
        console.error(`❌ Table ${actualTableName} failed:`, e.message);
      }
    }
  }
}

checkSchema();
