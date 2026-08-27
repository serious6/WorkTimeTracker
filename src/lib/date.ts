export const MINUTE_MS = 60_000
export const DAY_MS = 86_400_000

export type WeekStart = 'monday' | 'sunday'

export function startOfDay(date: Date): Date {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  return start
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function startOfWeek(date: Date, weekStartsOn: WeekStart = 'monday'): Date {
  const start = startOfDay(date)
  const offset = weekStartsOn === 'monday' ? (start.getDay() + 6) % 7 : start.getDay()
  return addDays(start, -offset)
}

/** Local calendar day of a date as `YYYY-MM-DD`. */
export function toDateKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function fromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Local time of day of a date as `HH:MM`, ready for a time input. */
export function toTimeKey(date: Date): string {
  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`
}

export function combineDateAndTime(dateKey: string, timeKey: string): Date {
  const date = fromDateKey(dateKey)
  const [hours, minutes] = timeKey.split(':').map(Number)
  date.setHours(hours, minutes, 0, 0)
  return date
}

export function formatDay(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatShortDay(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6)
  return `${formatShortDay(weekStart)} – ${formatShortDay(weekEnd)}, ${weekEnd.getFullYear()}`
}

export function formatTimeOfDay(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** Human duration such as `7h 45m`. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  return `${Math.floor(total / 60)}h ${`${total % 60}`.padStart(2, '0')}m`
}

/** Signed human duration such as `+6h 15m`. */
export function formatSignedDuration(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  return `${sign}${formatDuration(Math.abs(minutes))}`
}

/** Stopwatch duration such as `01:23:47`. */
export function formatStopwatch(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => `${part}`.padStart(2, '0'))
    .join(':')
}
