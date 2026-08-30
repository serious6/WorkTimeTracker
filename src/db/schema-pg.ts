import { sql } from 'drizzle-orm'
import { bigint, boolean, check, pgTable, text } from 'drizzle-orm/pg-core'

/**
 * Postgres mirror of `src/db/schema.ts`, used when `WTT_DB_BACKEND=postgres`.
 * The two schemas must stay in sync; see `drizzle/postgres/0000_init.sql`
 * (the Rust backend's source of truth for the Postgres schema) and
 * `docs/data-model.md`.
 */

export const users = pgTable('users', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  email: text().notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
})

export const projects = pgTable('projects', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'number' }).references(() => users.id, {
    onDelete: 'cascade',
  }),
  name: text().notNull(),
  description: text(),
  color: text().notNull(),
  active: boolean().notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const timeEntries = pgTable('time_entries', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'number' }).references(() => users.id, {
    onDelete: 'cascade',
  }),
  projectId: bigint('project_id', { mode: 'number' }).references(() => projects.id, {
    onDelete: 'set null',
  }),
  startTime: text('start_time').notNull(),
  endTime: text('end_time'),
  note: text(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const projectBudgets = pgTable(
  'project_budgets',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'number' }).references(() => users.id, {
      onDelete: 'cascade',
    }),
    projectId: bigint('project_id', { mode: 'number' })
      .notNull()
      .unique()
      .references(() => projects.id, { onDelete: 'cascade' }),
    budgetMinutes: bigint('budget_minutes', { mode: 'number' }).notNull(),
    dueDate: text('due_date').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [check('project_budgets_budget_minutes_check', sql`${table.budgetMinutes} > 0`)],
)

export const workSettings = pgTable('work_settings', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'number' })
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  weeklyTargetMinutes: bigint('weekly_target_minutes', { mode: 'number' }).notNull(),
  workingDays: text('working_days').notNull(),
  weekStartsOn: text('week_starts_on').notNull(),
})

export const appMetadata = pgTable('app_metadata', {
  key: text().primaryKey(),
  value: text().notNull(),
})

/** Append-only history of every change to a time entry. */
export const auditLog = pgTable('audit_log', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  entity: text().notNull(),
  entityId: bigint('entity_id', { mode: 'number' }).notNull(),
  action: text().notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  createdAt: text('created_at').notNull(),
})
