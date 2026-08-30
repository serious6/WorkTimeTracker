-- Postgres equivalent of the SQLite schema built up by drizzle/0000_*.sql
-- through drizzle/0004_create_audit_log.sql. Kept as a single init migration
-- since Postgres deployments start from a clean database; see
-- docs/data-model.md for how the two migration sets relate.
--
-- Timestamps are stored as TEXT in the same ISO 8601 UTC format the SQLite
-- backend produces (e.g. "2024-01-01T12:34:56.789Z"), written by the
-- application layer (see src-tauri/src/postgres_store.rs) so both backends
-- return byte-for-byte identical values to the frontend.

CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS projects_user_id ON projects (user_id);

CREATE TABLE IF NOT EXISTS time_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES users (id) ON DELETE CASCADE,
  project_id BIGINT REFERENCES projects (id) ON DELETE SET NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS time_entries_start_time ON time_entries (start_time);
CREATE INDEX IF NOT EXISTS time_entries_user_id ON time_entries (user_id);

CREATE TABLE IF NOT EXISTS project_budgets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES users (id) ON DELETE CASCADE,
  project_id BIGINT NOT NULL UNIQUE REFERENCES projects (id) ON DELETE CASCADE,
  budget_minutes BIGINT NOT NULL CHECK (budget_minutes > 0),
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS project_budgets_user_id ON project_budgets (user_id);

CREATE TABLE IF NOT EXISTS work_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  weekly_target_minutes BIGINT NOT NULL,
  working_days TEXT NOT NULL,
  week_starts_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  entity_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_user_id ON audit_log (user_id, id);
