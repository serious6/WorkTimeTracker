ALTER TABLE time_entries
ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'work' CHECK (entry_type IN ('work', 'break'));

CREATE TABLE IF NOT EXISTS time_entry_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users (id) ON DELETE CASCADE,
  time_entry_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  actor TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS time_entry_audits_user_id ON time_entry_audits (user_id);

CREATE INDEX IF NOT EXISTS time_entry_audits_recorded_at ON time_entry_audits (recorded_at);
