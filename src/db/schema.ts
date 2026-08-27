import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const timeEntries = sqliteTable('time_entries', {
  id: integer().primaryKey({ autoIncrement: true }),
  project: text().notNull(),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  notes: text(),
})
