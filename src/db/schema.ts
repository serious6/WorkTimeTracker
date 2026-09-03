import { sql } from 'drizzle-orm'
import { bigint, boolean, check, index, pgTable, text, unique } from 'drizzle-orm/pg-core'

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

export const timeEntries = pgTable(
  'time_entries',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'number' }).references(() => users.id, {
      onDelete: 'cascade',
    }),
    projectId: bigint('project_id', { mode: 'number' }).references(() => projects.id, {
      onDelete: 'set null',
    }),
    startTime: text('start_time').notNull(),
    endTime: text('end_time'),
    entryType: text('entry_type', { enum: ['work', 'break'] }).notNull().default('work'),
    note: text(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    // `enum` only narrows the TypeScript type, so the value constraint is modelled explicitly.
    check('time_entries_entry_type_check', sql`${table.entryType} IN ('work', 'break')`),
    check('time_entries_break_project_constraint', sql`${table.entryType} <> 'break' OR ${table.projectId} IS NULL`),
  ],
)

/** Append-only trail that keeps every change to a time entry defensible. */
export const timeEntryAudits = pgTable('time_entry_audits', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  timeEntryId: bigint('time_entry_id', { mode: 'number' }).notNull(),
  action: text({ enum: ['created', 'updated', 'deleted'] }).notNull(),
  actor: text().notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  recordedAt: text('recorded_at').notNull(),
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
  breakThresholdMinutes: bigint('break_threshold_minutes', { mode: 'number' }).notNull().default(360),
  requiredBreakMinutes: bigint('required_break_minutes', { mode: 'number' }).notNull().default(30),
  longBreakThresholdMinutes: bigint('long_break_threshold_minutes', { mode: 'number' }).notNull().default(540),
  requiredLongBreakMinutes: bigint('required_long_break_minutes', { mode: 'number' }).notNull().default(45),
  minBreakBlockMinutes: bigint('min_break_block_minutes', { mode: 'number' }).notNull().default(15),
  maxContinuousWorkMinutes: bigint('max_continuous_work_minutes', { mode: 'number' }).notNull().default(360),
  maxDailyWorkMinutes: bigint('max_daily_work_minutes', { mode: 'number' }).notNull().default(600),
  minRestMinutes: bigint('min_rest_minutes', { mode: 'number' }).notNull().default(660),
})

export const appMetadata = pgTable('app_metadata', {
  key: text().primaryKey(),
  value: text().notNull(),
})

/**
 * One record per excused calendar day; a range is stored as several rows so
 * the unique constraint keeps a day from carrying two absences.
 */
export const absences = pgTable(
  'absences',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    absenceType: text('absence_type', {
      enum: ['vacation', 'sick', 'unpaid', 'halfDay'],
    }).notNull(),
    absenceDate: text('absence_date').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [unique('absences_day_unique').on(table.userId, table.absenceDate)],
)

export const absenceAudits = pgTable('absence_audits', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  absenceId: bigint('absence_id', { mode: 'number' }).notNull(),
  action: text({ enum: ['created', 'updated', 'deleted'] }).notNull(),
  actor: text().notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  recordedAt: text('recorded_at').notNull(),
})

/**
 * Explicit overtime records. The overtime derived from time entries, the target
 * and the absences is not stored; only an opening balance, an absolute
 * correction or a delta is persisted, one record per effective date.
 */
export const overtimeEntries = pgTable(
  'overtime_entries',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    effectiveDate: text('effective_date').notNull(),
    minutes: bigint({ mode: 'number' }).notNull(),
    kind: text({ enum: ['opening', 'balance', 'adjustment'] }).notNull(),
    origin: text({ enum: ['automatic', 'manual'] })
      .notNull()
      .default('manual'),
    note: text(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    unique('overtime_entries_day_unique').on(table.userId, table.effectiveDate),
    // `enum` only narrows the TypeScript type, so the value constraint is modelled explicitly.
    check('overtime_entries_kind_check', sql`${table.kind} IN ('opening', 'balance', 'adjustment')`),
    check('overtime_entries_origin_check', sql`${table.origin} IN ('automatic', 'manual')`),
  ],
)

export const overtimeAudits = pgTable('overtime_audits', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  overtimeEntryId: bigint('overtime_entry_id', { mode: 'number' }).notNull(),
  action: text({ enum: ['created', 'updated', 'deleted'] }).notNull(),
  actor: text().notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  recordedAt: text('recorded_at').notNull(),
})

/**
 * Append-only trail of the identity and configuration changes that carry no
 * trail of their own. `userId` is null for a failed login of an unknown email,
 * `entityId` for the records that name no row, such as the work settings.
 * Credentials are never stored in `oldValue`/`newValue`.
 */
export const securityAudits = pgTable(
  'security_audits',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'number' }).references(() => users.id, {
      onDelete: 'cascade',
    }),
    entity: text().notNull(),
    entityId: bigint('entity_id', { mode: 'number' }),
    action: text().notNull(),
    actor: text().notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    recordedAt: text('recorded_at').notNull(),
  },
  (table) => [
    index('security_audits_user_recorded_at').on(table.userId, table.recordedAt),
    index('security_audits_entity_recorded_at').on(table.entity, table.recordedAt),
  ],
)

/**
 * Failed logins per email. Persisted so a restart does not clear a lockout;
 * rows are evicted once their lockout has been served.
 */
export const loginAttempts = pgTable('login_attempts', {
  email: text().primaryKey(),
  failures: bigint({ mode: 'number' }).notNull(),
  lastFailure: text('last_failure').notNull(),
})
