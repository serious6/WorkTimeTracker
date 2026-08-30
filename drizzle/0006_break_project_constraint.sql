CREATE TRIGGER IF NOT EXISTS time_entries_break_without_project_insert
BEFORE INSERT ON time_entries
WHEN NEW.entry_type = 'break' AND NEW.project_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'a break is not booked on a project');
END;

CREATE TRIGGER IF NOT EXISTS time_entries_break_without_project_update
BEFORE UPDATE OF entry_type, project_id ON time_entries
WHEN NEW.entry_type = 'break' AND NEW.project_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'a break is not booked on a project');
END;
