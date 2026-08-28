import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  description: text(),
  color: text().notNull(),
  active: integer({ mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const timeEntries = sqliteTable('time_entries', {
  id: integer().primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  startTime: text('start_time').notNull(),
  endTime: text('end_time'),
  note: text(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const projectBudgets = sqliteTable(
  'project_budgets',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .unique()
      .references(() => projects.id, { onDelete: 'cascade' }),
    budgetMinutes: integer('budget_minutes').notNull(),
    dueDate: text('due_date').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [check('project_budgets_budget_minutes_check', sql`${table.budgetMinutes} > 0`)],
)

export const workSettings = sqliteTable('work_settings', {
  id: integer().primaryKey(),
  weeklyTargetMinutes: integer('weekly_target_minutes').notNull(),
  workingDays: text('working_days').notNull(),
  weekStartsOn: text('week_starts_on').notNull(),
})
