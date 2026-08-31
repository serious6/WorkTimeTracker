-- Work items (UC-5): what a time entry books its time against, besides a
-- project. Four presets are seeded for every user on first use
-- (flextime_compensation, unpaid_leave, sickness, training); a user can also
-- create any number of `project` kind items, each carrying its own cost
-- center, e.g. to track time against a client project without creating a
-- full project record.

CREATE TABLE IF NOT EXISTS work_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN ('flextime_compensation', 'unpaid_leave', 'sickness', 'training', 'project')
  ),
  name TEXT NOT NULL,
  cost_center TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS work_items_user_id ON work_items (user_id, name);

-- Every preset kind exists at most once per user; only `project` items can
-- repeat, so a user can track several projects this way.
CREATE UNIQUE INDEX IF NOT EXISTS work_items_preset_unique
  ON work_items (user_id, kind) WHERE kind <> 'project';

-- Time entries can book against a work item instead of a project; the two
-- are mutually exclusive (enforced in the application layer).
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS work_item_id BIGINT
  REFERENCES work_items (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS time_entries_work_item_id ON time_entries (work_item_id);
