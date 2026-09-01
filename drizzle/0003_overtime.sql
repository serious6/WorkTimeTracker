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
