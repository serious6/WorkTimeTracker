import type { ProjectBudget } from '@/features/budgets/budget-schema'
import { entryMinutesInRange } from '@/features/dashboard/metrics'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { addDays, DAY_MS, fromDateKey, startOfDay } from '@/lib/date'

export type BudgetReport = {
  budgetMinutes: number
  trackedMinutes: number
  remainingMinutes: number
  consumptionPercentage: number
  exceeded: boolean
  daysElapsed: number
  daysRemaining: number
  paceMinutesPerDay: number
  projectedMinutes: number
  /** Projected over-run (positive) or under-run (negative) in minutes at the due date. */
  differenceMinutes: number
  willExceed: boolean
}

function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS)
}

/**
 * Consumption and forecast of a project budget. Time is counted from the first
 * tracked entry of the project until the end of the due date; the forecast
 * extrapolates the average pace so far over the remaining days.
 */
export function budgetReport(
  budget: ProjectBudget,
  entries: TimeEntry[],
  now = Date.now(),
): BudgetReport {
  const dueDay = fromDateKey(budget.dueDate)
  const period = { start: new Date(0), end: addDays(dueDay, 1) }
  const projectEntries = entries.filter((entry) => entry.projectId === budget.projectId)
  const trackedMinutes = projectEntries.reduce(
    (total, entry) => total + entryMinutesInRange(entry, period, now),
    0,
  )

  const today = new Date(Math.min(now, period.end.getTime() - 1))
  const firstTrackedAt = projectEntries
    .map((entry) => Date.parse(entry.startTime))
    .reduce((earliest, start) => Math.min(earliest, start), Number.POSITIVE_INFINITY)
  const daysElapsed = Number.isFinite(firstTrackedAt)
    ? Math.max(1, calendarDaysBetween(new Date(firstTrackedAt), today) + 1)
    : 0
  const daysRemaining = Math.max(0, calendarDaysBetween(new Date(now), dueDay))

  const paceMinutesPerDay = daysElapsed > 0 ? trackedMinutes / daysElapsed : 0
  const projectedMinutes = trackedMinutes + paceMinutesPerDay * daysRemaining

  return {
    budgetMinutes: budget.budgetMinutes,
    trackedMinutes,
    remainingMinutes: budget.budgetMinutes - trackedMinutes,
    consumptionPercentage: Math.round((trackedMinutes / budget.budgetMinutes) * 100),
    exceeded: trackedMinutes > budget.budgetMinutes,
    daysElapsed,
    daysRemaining,
    paceMinutesPerDay,
    projectedMinutes,
    differenceMinutes: projectedMinutes - budget.budgetMinutes,
    willExceed: projectedMinutes > budget.budgetMinutes,
  }
}
