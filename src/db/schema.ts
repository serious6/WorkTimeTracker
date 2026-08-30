import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer().primaryKey({ autoIncrement: true }),
  email: text().notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
})

export const projects = sqliteTable('projects', {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  description: text(),
  color: text().notNull(),
  active: integer({ mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const timeEntries = sqliteTable('time_entries', {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  startTime: text('start_time').notNull(),
  endTime: text('end_time'),
  entryType: text('entry_type', { enum: ['work', 'break'] })
    .notNull()
    .default('work'),
  note: text(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/** Append-only trail that keeps every change to a time entry defensible. */
export const timeEntryAudits = sqliteTable('time_entry_audits', {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  timeEntryId: integer('time_entry_id').notNull(),
  action: text({ enum: ['created', 'updated', 'deleted'] }).notNull(),
  actor: text().notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  recordedAt: text('recorded_at').notNull(),
})

export const projectBudgets = sqliteTable(
  'project_budgets',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
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
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  weeklyTargetMinutes: integer('weekly_target_minutes').notNull(),
  workingDays: text('working_days').notNull(),
  weekStartsOn: text('week_starts_on').notNull(),
  breakThresholdMinutes: integer('break_threshold_minutes').notNull().default(360),
  requiredBreakMinutes: integer('required_break_minutes').notNull().default(30),
  longBreakThresholdMinutes: integer('long_break_threshold_minutes').notNull().default(540),
  requiredLongBreakMinutes: integer('required_long_break_minutes').notNull().default(45),
  minBreakBlockMinutes: integer('min_break_block_minutes').notNull().default(15),
  maxContinuousWorkMinutes: integer('max_continuous_work_minutes').notNull().default(360),
  maxDailyWorkMinutes: integer('max_daily_work_minutes').notNull().default(600),
  minRestMinutes: integer('min_rest_minutes').notNull().default(660),
})

export const appMetadata = sqliteTable('app_metadata', {
  key: text().primaryKey(),
  value: text().notNull(),
})

/** Append-only history of every change to a time entry. */
export const auditLog = sqliteTable('audit_log', {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  entity: text().notNull(),
  entityId: integer('entity_id').notNull(),
  action: text().notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  createdAt: text('created_at').notNull(),
})
