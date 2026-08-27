DROP TABLE IF EXISTS time_entries;

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS time_entries_start_time ON time_entries (start_time);

CREATE TABLE IF NOT EXISTS work_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  daily_target_minutes INTEGER NOT NULL,
  weekly_target_minutes INTEGER NOT NULL,
  week_starts_on TEXT NOT NULL
);

INSERT OR IGNORE INTO work_settings (id, daily_target_minutes, weekly_target_minutes, week_starts_on)
VALUES (1, 480, 2400, 'monday');
