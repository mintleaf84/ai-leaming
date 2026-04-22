import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/drizzle-schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/ai-learning.db',
  },
});
