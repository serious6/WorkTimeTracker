import { addDays, fromDateKey, startOfDay, type WeekStart } from '@/lib/date'
import { dayRange, monthRange, weekRange, type DateRange } from './metrics'

export type RangeKey = 'today' | 'yesterday' | 'this-week' | 'last-week' | 'this-month' | 'custom'

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'this-week': 'This week',
  'last-week': 'Last week',
  'this-month': 'This month',
  custom: 'Custom',
}

/** Resolves a range selector value relative to the selected day. */
export function resolveRange(
  key: RangeKey,
  reference: Date,
  weekStartsOn: WeekStart = 'monday',
  custom?: { from: string; to: string },
): DateRange {
  switch (key) {
    case 'yesterday':
      return dayRange(addDays(reference, -1))
    case 'this-week':
      return weekRange(reference, weekStartsOn)
    case 'last-week':
      return weekRange(addDays(reference, -7), weekStartsOn)
    case 'this-month':
      return monthRange(reference)
    case 'custom': {
      if (!custom?.from || !custom.to) return dayRange(reference)
      return { start: startOfDay(fromDateKey(custom.from)), end: addDays(fromDateKey(custom.to), 1) }
    }
    default:
      return dayRange(reference)
  }
}
