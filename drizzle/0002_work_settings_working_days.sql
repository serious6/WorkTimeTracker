CREATE TABLE work_settings_new (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  weekly_target_minutes INTEGER NOT NULL,
  working_days TEXT NOT NULL,
  week_starts_on TEXT NOT NULL
);

INSERT INTO work_settings_new (id, weekly_target_minutes, working_days, week_starts_on)
SELECT id, weekly_target_minutes, 'monday,tuesday,wednesday,thursday,friday', week_starts_on
FROM work_settings;

DROP TABLE work_settings;

ALTER TABLE work_settings_new RENAME TO work_settings;

INSERT OR IGNORE INTO work_settings (id, weekly_target_minutes, working_days, week_starts_on)
VALUES (1, 2400, 'monday,tuesday,wednesday,thursday,friday', 'monday');
