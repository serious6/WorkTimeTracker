import type { TimeEntry } from './time-entry-schema'

export function buildWorkWeekData(entries: TimeEntry[], now = new Date()) {
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const weekStart = new Date(now)
  const daysSinceMonday = (weekStart.getDay() + 6) % 7
  weekStart.setDate(weekStart.getDate() - daysSinceMonday)
  weekStart.setHours(0, 0, 0, 0)

  const nextWeek = new Date(weekStart)
  nextWeek.setDate(nextWeek.getDate() + 7)

  const totals = entries
    .filter((entry) => {
      const startedAt = new Date(entry.startedAt)
      return startedAt >= weekStart && startedAt < nextWeek
    })
    .reduce((days, entry) => {
      const day = (new Date(entry.startedAt).getDay() + 6) % 7
      days.set(day, (days.get(day) ?? 0) + entry.durationMinutes / 60)
      return days
    }, new Map<number, number>())

  return [...totals]
    .sort(([left], [right]) => left - right)
    .map(([day, hours]) => ({ day: dayNames[day], hours }))
}
