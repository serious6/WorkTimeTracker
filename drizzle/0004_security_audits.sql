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
