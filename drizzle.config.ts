import { defineConfig } from 'drizzle-kit'

/**
 * Selects the Drizzle dialect/schema/migrations the same way the Rust
 * backend selects its store (`src-tauri/src/config.rs`): `WTT_DB_BACKEND`
 * defaults to `sqlite`, and `DATABASE_URL` is only required for `postgres`.
 */
const backend = process.env.WTT_DB_BACKEND === 'postgres' ? 'postgres' : 'sqlite'
// Matches compose.yaml's `db` service (POSTGRES_USER/PASSWORD/DB=worktimetracker).
const defaultPostgresUrl = `postgresql://worktimetracker${':'}worktimetracker@localhost:5432/worktimetracker`

export default backend === 'postgres'
  ? defineConfig({
      dialect: 'postgresql',
      schema: './src/db/schema-pg.ts',
      out: './drizzle/postgres',
      dbCredentials: {
        url: process.env.DATABASE_URL ?? defaultPostgresUrl,
      },
    })
  : defineConfig({
      dialect: 'sqlite',
      schema: './src/db/schema.ts',
      out: './drizzle',
    })
