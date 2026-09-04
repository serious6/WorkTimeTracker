-- Adds the archived flag to databases created before archiving existed.
-- Idempotent, because the baseline 0000_init already creates the column.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
