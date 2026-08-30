-- Failed logins per email, persisted so that restarting the application does
-- not clear a lockout. Expired rows are deleted on the next login attempt, so
-- the table cannot grow without bound.
CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY,
  failures BIGINT NOT NULL,
  last_failure TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS login_attempts_last_failure ON login_attempts (last_failure);
