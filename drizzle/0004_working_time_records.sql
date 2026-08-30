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

-- Carries the released generic audit trail of time entries over, so no recorded
-- change is lost when upgrading (retention of at least two years, ArbZG § 16).
INSERT INTO time_entry_audits (user_id, time_entry_id, action, actor, old_value, new_value, recorded_at)
SELECT
  audit_log.user_id,
  audit_log.entity_id,
  audit_log.action || 'd',
  COALESCE(
    (SELECT users.email FROM users WHERE users.id = audit_log.user_id),
    'user:' || audit_log.user_id
  ),
  audit_log.old_value,
  audit_log.new_value,
  audit_log.created_at
FROM audit_log
WHERE audit_log.entity = 'timeEntry' AND audit_log.action IN ('create', 'update', 'delete')
ORDER BY audit_log.id;
