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
