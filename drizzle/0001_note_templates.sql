-- Reusable note templates: predefined texts that can be inserted into any note
-- field. A template is a source of text only: the note stored on a time entry
-- or an overtime record is a plain copy, so editing or deleting a template
-- never changes a note that was already saved.
--
-- Idempotent: it also runs on a database that already recorded 0000_init.

CREATE TABLE IF NOT EXISTS wtt.note_templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES wtt.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT note_templates_name_unique UNIQUE (user_id, name)
);

ALTER TABLE wtt.note_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE wtt.note_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS note_templates_owner ON wtt.note_templates;
CREATE POLICY note_templates_owner ON wtt.note_templates
  USING (user_id = wtt.current_user_id())
  WITH CHECK (user_id = wtt.current_user_id());
