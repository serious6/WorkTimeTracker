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
  archived BOOLEAN NOT NULL DEFAULT FALSE,
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

-- Absences (UC-4): days that are excused from the working-time target.
--
-- One record per calendar day, so a range is stored as several rows and the
-- unique constraint guarantees that a day can never carry two absences.
CREATE TABLE IF NOT EXISTS absences (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  absence_type TEXT NOT NULL CHECK (absence_type IN ('vacation', 'sick', 'unpaid', 'halfDay')),
  absence_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT absences_day_unique UNIQUE (user_id, absence_date)
);

CREATE INDEX IF NOT EXISTS absences_user_id ON absences (user_id, absence_date);

-- Append-only trail of every change to an absence, kept after the absence is
-- deleted so the record stays defensible.
CREATE TABLE IF NOT EXISTS absence_audits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  absence_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS absence_audits_user_id ON absence_audits (user_id, id);

-- Failed logins per email, persisted so that restarting the application does
-- not clear a lockout. Expired rows are deleted on the next login attempt, so
-- the table cannot grow without bound.
CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY,
  failures BIGINT NOT NULL,
  last_failure TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS login_attempts_last_failure ON login_attempts (last_failure);

-- Explicit overtime records (UC-5): the balance carried over from before the
-- application was used, absolute corrections and deltas.
--
-- The overtime derived from time entries, the working time target and the
-- absences is never stored here; only the records that are set explicitly are
-- persisted, so the derived part cannot go stale. `origin` keeps the trace of
-- how a row came to be: a row written by the application from time entries is
-- `automatic`, a row entered or edited by the user is `manual` and is never
-- overwritten by the automatic calculation again.
CREATE TABLE IF NOT EXISTS overtime_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  effective_date TEXT NOT NULL,
  minutes BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('opening', 'balance', 'adjustment')),
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('automatic', 'manual')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT overtime_entries_day_unique UNIQUE (user_id, effective_date)
);

CREATE INDEX IF NOT EXISTS overtime_entries_user_id ON overtime_entries (user_id, effective_date);

-- Only one opening balance per user. The database enforces it, so two
-- concurrent writers cannot both pass an application side check and commit a
-- second opening balance.
CREATE UNIQUE INDEX IF NOT EXISTS overtime_entries_opening_unique
  ON overtime_entries (user_id)
  WHERE kind = 'opening';

-- Append-only trail of every change to an overtime record, kept after the
-- record is deleted so the balance stays defensible.
CREATE TABLE IF NOT EXISTS overtime_audits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  overtime_entry_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS overtime_audits_user_id ON overtime_audits (user_id, id);

-- Append-only trail of the identity and configuration changes that carry no
-- trail of their own: account creation, failed logins and lockouts, and the
-- create, update and delete of projects, budgets and the work settings.
--
-- `user_id` is nullable because a failed login for an unknown email belongs to
-- no account; such a row is evidence only and is never listed by the audit
-- view, which is scoped to the signed in user. `entity_id` is nullable for the
-- records that name no row, such as the work settings or an auth event.
-- Credentials are never written here: `old_value` and `new_value` carry the
-- changed fields of the audited record and never a password or a hash.
CREATE TABLE IF NOT EXISTS security_audits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES users (id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  entity_id BIGINT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS security_audits_user_recorded_at
  ON security_audits (user_id, recorded_at);

-- The retention job deletes the auth events of the `auth` entity only, so the
-- configuration records stay for as long as the domain trails do.
CREATE INDEX IF NOT EXISTS security_audits_entity_recorded_at
  ON security_audits (entity, recorded_at);
