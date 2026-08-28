CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE projects ADD COLUMN user_id INTEGER REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE time_entries ADD COLUMN user_id INTEGER REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE project_budgets ADD COLUMN user_id INTEGER REFERENCES users (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS projects_user_id ON projects (user_id);

CREATE INDEX IF NOT EXISTS time_entries_user_id ON time_entries (user_id);

CREATE INDEX IF NOT EXISTS project_budgets_user_id ON project_budgets (user_id);

CREATE TABLE work_settings_scoped (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  weekly_target_minutes INTEGER NOT NULL,
  working_days TEXT NOT NULL,
  week_starts_on TEXT NOT NULL
);

INSERT INTO work_settings_scoped (user_id, weekly_target_minutes, working_days, week_starts_on)
SELECT NULL, weekly_target_minutes, working_days, week_starts_on
FROM work_settings;

DROP TABLE work_settings;

ALTER TABLE work_settings_scoped RENAME TO work_settings;
