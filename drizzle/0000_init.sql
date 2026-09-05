-- Initial Postgres schema for WorkTimeTracker.
--
-- Timestamps are stored as TEXT in ISO 8601 UTC format
-- (e.g. "2024-01-01T12:34:56.789Z"), written by the application layer
-- (see src-tauri/src/postgres_store.rs).

CREATE SCHEMA IF NOT EXISTS wtt;

CREATE TABLE IF NOT EXISTS wtt.users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wtt.projects (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES wtt.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS projects_user_id ON wtt.projects (user_id);

CREATE TABLE IF NOT EXISTS wtt.time_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES wtt.users (id) ON DELETE CASCADE,
  project_id BIGINT REFERENCES wtt.projects (id) ON DELETE SET NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  entry_type TEXT NOT NULL DEFAULT 'work' CHECK (entry_type IN ('work', 'break')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT time_entries_break_project_constraint
    CHECK (entry_type <> 'break' OR project_id IS NULL)
);

CREATE INDEX IF NOT EXISTS time_entries_start_time ON wtt.time_entries (start_time);
CREATE INDEX IF NOT EXISTS time_entries_user_id ON wtt.time_entries (user_id);

CREATE TABLE IF NOT EXISTS wtt.project_budgets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES wtt.users (id) ON DELETE CASCADE,
  project_id BIGINT NOT NULL UNIQUE REFERENCES wtt.projects (id) ON DELETE CASCADE,
  budget_minutes BIGINT NOT NULL CHECK (budget_minutes > 0),
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS project_budgets_user_id ON wtt.project_budgets (user_id);

CREATE TABLE IF NOT EXISTS wtt.work_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT UNIQUE REFERENCES wtt.users (id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS wtt.app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Append-only trail of every change to a time entry; replaces the older
-- generic audit_log table (still exposed to the frontend as legacy shape via
-- PostgresStore::list_audit_log, derived from this table).
CREATE TABLE IF NOT EXISTS wtt.time_entry_audits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES wtt.users (id) ON DELETE CASCADE,
  time_entry_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS time_entry_audits_user_id ON wtt.time_entry_audits (user_id, id);

-- Absences (UC-4): days that are excused from the working-time target.
--
-- One record per calendar day, so a range is stored as several rows and the
-- unique constraint guarantees that a day can never carry two absences.
CREATE TABLE IF NOT EXISTS wtt.absences (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES wtt.users (id) ON DELETE CASCADE,
  absence_type TEXT NOT NULL CHECK (absence_type IN ('vacation', 'sick', 'unpaid', 'halfDay')),
  absence_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT absences_day_unique UNIQUE (user_id, absence_date)
);

CREATE INDEX IF NOT EXISTS absences_user_id ON wtt.absences (user_id, absence_date);

-- Append-only trail of every change to an absence, kept after the absence is
-- deleted so the record stays defensible.
CREATE TABLE IF NOT EXISTS wtt.absence_audits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES wtt.users (id) ON DELETE CASCADE,
  absence_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS absence_audits_user_id ON wtt.absence_audits (user_id, id);

-- Failed logins per email, persisted so that restarting the application does
-- not clear a lockout. Expired rows are deleted on the next login attempt, so
-- the table cannot grow without bound.
CREATE TABLE IF NOT EXISTS wtt.login_attempts (
  email TEXT PRIMARY KEY,
  failures BIGINT NOT NULL,
  last_failure TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS login_attempts_last_failure ON wtt.login_attempts (last_failure);

-- Explicit overtime records (UC-5): the balance carried over from before the
-- application was used, absolute corrections and deltas.
--
-- The overtime derived from time entries, the working time target and the
-- absences is never stored here; only the records that are set explicitly are
-- persisted, so the derived part cannot go stale. `origin` keeps the trace of
-- how a row came to be: a row written by the application from time entries is
-- `automatic`, a row entered or edited by the user is `manual` and is never
-- overwritten by the automatic calculation again.
CREATE TABLE IF NOT EXISTS wtt.overtime_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES wtt.users (id) ON DELETE CASCADE,
  effective_date TEXT NOT NULL,
  minutes BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('opening', 'balance', 'adjustment')),
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('automatic', 'manual')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT overtime_entries_day_unique UNIQUE (user_id, effective_date)
);

CREATE INDEX IF NOT EXISTS overtime_entries_user_id ON wtt.overtime_entries (user_id, effective_date);

-- Only one opening balance per user. The database enforces it, so two
-- concurrent writers cannot both pass an application side check and commit a
-- second opening balance.
CREATE UNIQUE INDEX IF NOT EXISTS overtime_entries_opening_unique
  ON wtt.overtime_entries (user_id)
  WHERE kind = 'opening';

-- Append-only trail of every change to an overtime record, kept after the
-- record is deleted so the balance stays defensible.
CREATE TABLE IF NOT EXISTS wtt.overtime_audits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES wtt.users (id) ON DELETE CASCADE,
  overtime_entry_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS overtime_audits_user_id ON wtt.overtime_audits (user_id, id);

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
CREATE TABLE IF NOT EXISTS wtt.security_audits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES wtt.users (id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  entity_id BIGINT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS security_audits_user_recorded_at
  ON wtt.security_audits (user_id, recorded_at);

-- The retention job deletes the auth events of the `auth` entity only, so the
-- configuration records stay for as long as the domain trails do.
CREATE INDEX IF NOT EXISTS security_audits_entity_recorded_at
  ON wtt.security_audits (entity, recorded_at);

-- Row level security.
--
-- Every query of the application already carries its own `AND user_id = $n`
-- predicate; the policies below are the second line of defence behind it. The
-- application connects as one Postgres role for all of its users, so the
-- signed in account is named per connection instead of per database role:
-- `PostgresStore::conn_for` sets `wtt.user_id` on the connection it hands out
-- and `PostgresStore::conn` clears it again. A statement that forgets its
-- predicate therefore reads and writes nothing instead of reaching another
-- account, and a connection without a session reaches no user-owned row at
-- all.
--
-- `users`, `login_attempts`, `app_metadata` and `schema_migrations` carry no
-- `user_id` and stay without policies: the first two are read to sign a user
-- in, which is precisely the moment at which no session exists yet, and the
-- last two describe the database rather than an account.

-- NULL for a connection that names no user, which makes every `user_id = ...`
-- comparison below unknown and therefore denies the row.
CREATE OR REPLACE FUNCTION wtt.current_user_id() RETURNS BIGINT
  LANGUAGE sql
  STABLE
  AS $$ SELECT NULLIF(current_setting('wtt.user_id', TRUE), '')::BIGINT $$;

-- The table owner is the application role itself, so the policies only take
-- effect with FORCE; ENABLE alone would let the owner bypass them.
ALTER TABLE wtt.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE wtt.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE wtt.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE wtt.time_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE wtt.project_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wtt.project_budgets FORCE ROW LEVEL SECURITY;
ALTER TABLE wtt.work_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE wtt.work_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE wtt.time_entry_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE wtt.time_entry_audits FORCE ROW LEVEL SECURITY;
ALTER TABLE wtt.absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE wtt.absences FORCE ROW LEVEL SECURITY;
ALTER TABLE wtt.absence_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE wtt.absence_audits FORCE ROW LEVEL SECURITY;
ALTER TABLE wtt.overtime_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE wtt.overtime_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE wtt.overtime_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE wtt.overtime_audits FORCE ROW LEVEL SECURITY;
ALTER TABLE wtt.security_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE wtt.security_audits FORCE ROW LEVEL SECURITY;

CREATE POLICY projects_owner ON wtt.projects
  USING (user_id = wtt.current_user_id())
  WITH CHECK (user_id = wtt.current_user_id());
CREATE POLICY time_entries_owner ON wtt.time_entries
  USING (user_id = wtt.current_user_id())
  WITH CHECK (user_id = wtt.current_user_id());
CREATE POLICY project_budgets_owner ON wtt.project_budgets
  USING (user_id = wtt.current_user_id())
  WITH CHECK (user_id = wtt.current_user_id());
CREATE POLICY work_settings_owner ON wtt.work_settings
  USING (user_id = wtt.current_user_id())
  WITH CHECK (user_id = wtt.current_user_id());
CREATE POLICY time_entry_audits_owner ON wtt.time_entry_audits
  USING (user_id = wtt.current_user_id())
  WITH CHECK (user_id = wtt.current_user_id());
CREATE POLICY absences_owner ON wtt.absences
  USING (user_id = wtt.current_user_id())
  WITH CHECK (user_id = wtt.current_user_id());
CREATE POLICY absence_audits_owner ON wtt.absence_audits
  USING (user_id = wtt.current_user_id())
  WITH CHECK (user_id = wtt.current_user_id());
CREATE POLICY overtime_entries_owner ON wtt.overtime_entries
  USING (user_id = wtt.current_user_id())
  WITH CHECK (user_id = wtt.current_user_id());
CREATE POLICY overtime_audits_owner ON wtt.overtime_audits
  USING (user_id = wtt.current_user_id())
  WITH CHECK (user_id = wtt.current_user_id());
CREATE POLICY security_audits_owner ON wtt.security_audits
  USING (user_id = wtt.current_user_id())
  WITH CHECK (user_id = wtt.current_user_id());

-- The four tables that predate the accounts still allow a NULL `user_id`, and
-- the first registration claims those rows (`PostgresStore::register_user`).
-- A row of nobody stays readable, because the claim has to find it, and the
-- claim is the one update that may touch it: it can only hand it to the user
-- the connection names, and no policy allows such a row to be written again.
CREATE POLICY projects_unclaimed ON wtt.projects FOR SELECT
  USING (user_id IS NULL);
CREATE POLICY projects_claim ON wtt.projects FOR UPDATE
  USING (user_id IS NULL)
  WITH CHECK (user_id = wtt.current_user_id());
CREATE POLICY time_entries_unclaimed ON wtt.time_entries FOR SELECT
  USING (user_id IS NULL);
CREATE POLICY time_entries_claim ON wtt.time_entries FOR UPDATE
  USING (user_id IS NULL)
  WITH CHECK (user_id = wtt.current_user_id());
CREATE POLICY project_budgets_unclaimed ON wtt.project_budgets FOR SELECT
  USING (user_id IS NULL);
CREATE POLICY project_budgets_claim ON wtt.project_budgets FOR UPDATE
  USING (user_id IS NULL)
  WITH CHECK (user_id = wtt.current_user_id());
CREATE POLICY work_settings_unclaimed ON wtt.work_settings FOR SELECT
  USING (user_id IS NULL);
CREATE POLICY work_settings_claim ON wtt.work_settings FOR UPDATE
  USING (user_id IS NULL)
  WITH CHECK (user_id = wtt.current_user_id());

-- The identity trail is written before a session exists: a failed login has
-- none, and a registration records the account it just created. Such a
-- connection may therefore append a record, and it may read and prune the
-- `auth` events, because the lockout decides from them whether the current
-- lockout was already recorded. It can still read no other entity and no
-- record of a signed in user.
CREATE POLICY security_audits_unscoped_write ON wtt.security_audits FOR INSERT
  WITH CHECK (wtt.current_user_id() IS NULL);
CREATE POLICY security_audits_auth_read ON wtt.security_audits FOR SELECT
  USING (wtt.current_user_id() IS NULL AND entity = 'auth');
CREATE POLICY security_audits_auth_prune ON wtt.security_audits FOR DELETE
  USING (wtt.current_user_id() IS NULL AND entity = 'auth');
