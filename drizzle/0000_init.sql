-- Initial Postgres schema for WorkTimeTracker.
--
-- Timestamps are stored as TEXT in ISO 8601 UTC format
-- (e.g. "2024-01-01T12:34:56.789Z"), written by the application layer
-- (see src-tauri/src/postgres_store.rs).

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
  entry_type TEXT NOT NULL DEFAULT 'work' CHECK (entry_type IN ('work', 'break')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT time_entries_break_project_constraint
    CHECK (entry_type <> 'break' OR project_id IS NULL)
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
  week_starts_on TEXT NOT NULL,
  break_threshold_minutes BIGINT NOT NULL DEFAULT 360,
  required_break_minutes BIGINT NOT NULL DEFAULT 30,
  long_break_threshold_minutes BIGINT NOT NULL DEFAULT 540,
  required_long_break_minutes BIGINT NOT NULL DEFAULT 45,
  min_break_block_minutes BIGINT NOT NULL DEFAULT 15,
  max_continuous_work_minutes BIGINT NOT NULL DEFAULT 360,
  max_daily_work_minutes BIGINT NOT NULL DEFAULT 600,
  min_rest_minutes BIGINT NOT NULL DEFAULT 660
);

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Append-only trail of every change to a time entry; replaces the older
-- generic audit_log table (still exposed to the frontend as legacy shape via
-- PostgresStore::list_audit_log, derived from this table).
CREATE TABLE IF NOT EXISTS time_entry_audits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  time_entry_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS time_entry_audits_user_id ON time_entry_audits (user_id, id);

