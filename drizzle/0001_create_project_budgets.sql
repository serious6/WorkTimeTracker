CREATE TABLE IF NOT EXISTS project_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL UNIQUE REFERENCES projects (id) ON DELETE CASCADE,
  budget_minutes INTEGER NOT NULL CHECK (budget_minutes > 0),
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
