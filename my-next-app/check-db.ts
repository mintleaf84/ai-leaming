import { drizzleDb, drizzleSchema } from "./src/lib/db";
import { isNotNull } from "drizzle-orm";

async function check() {
  const results = await drizzleDb
    .select({ ratio: drizzleSchema.questions.correct_ratio })
    .from(drizzleSchema.questions)
    .where(isNotNull(drizzleSchema.questions.correct_ratio))
    .limit(5);
  console.log(JSON.stringify(results));
}

check().catch(console.error);
