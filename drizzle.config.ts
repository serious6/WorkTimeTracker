import { defineConfig } from 'drizzle-kit'

const defaultPostgresUrl = 'postgresql://worktimetracker:worktimetracker@localhost:5432/worktimetracker'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? defaultPostgresUrl,
  },
})
