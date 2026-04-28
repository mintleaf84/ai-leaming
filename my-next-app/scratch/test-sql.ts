import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { eq } from 'drizzle-orm';

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name')
});

async function run() {
  console.log('Creating client...');
  const client = createClient({ url: 'file:local-test.db' });
  const db = drizzle(client);

  console.log('Creating table...');
  await client.execute('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');

  console.log('Inserting data...');
  await db.insert(users).values({ id: 1, name: 'Alice' });

  console.log('Running transaction...');
  await db.transaction(async (tx) => {
    await tx.delete(users).where(eq(users.id, 1));
  });

  console.log('Querying after transaction...');
  try {
    const result = await db.select().from(users).all();
    console.log('Result:', result);
  } catch (err: any) {
    console.error('Error:', err.message, err.cause);
  }
}

run().catch(console.error);
