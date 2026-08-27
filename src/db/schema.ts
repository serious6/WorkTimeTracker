import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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

export const workSettings = sqliteTable('work_settings', {
  id: integer().primaryKey(),
  dailyTargetMinutes: integer('daily_target_minutes').notNull(),
  weeklyTargetMinutes: integer('weekly_target_minutes').notNull(),
  weekStartsOn: text('week_starts_on').notNull(),
})
