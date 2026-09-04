import { describe, expect, it } from 'vitest'
import type { ProjectBudget } from '@/features/budgets/budget-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { budgetReport, overdueBudget } from './budget-metrics'

function entry(id: number, projectId: number | null, start: Date, end: Date | null): TimeEntry {
  return {
    id,
    projectId,
    startTime: start.toISOString(),
    endTime: end?.toISOString() ?? null,
    entryType: 'work',
    note: null,
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
  }
}

function budget(budgetMinutes: number, dueDate = '2026-08-30'): ProjectBudget {
  return {
    id: 1,
    projectId: 1,
    budgetMinutes,
    dueDate,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

const at = (day: number, hour: number, minute = 0) => new Date(2026, 7, day, hour, minute)
const entries = [
  entry(1, 1, at(24, 9), at(24, 11)),
  entry(2, 1, at(25, 9), at(25, 11)),
  entry(3, 2, at(25, 13), at(25, 17)),
]

describe('budgetReport', () => {
  it('counts only the entries of the budgeted project', () => {
    const report = budgetReport(budget(600), entries, at(26, 12).getTime())

    expect(report.trackedMinutes).toBe(240)
    expect(report.remainingMinutes).toBe(360)
    expect(report.consumptionPercentage).toBe(40)
    expect(report.exceeded).toBe(false)
  })

  it('extrapolates the pace so far until the due date', () => {
    const report = budgetReport(budget(600), entries, at(26, 12).getTime())

    expect(report.daysElapsed).toBe(3)
    expect(report.daysRemaining).toBe(4)
    expect(report.paceMinutesPerDay).toBe(80)
    expect(report.projectedMinutes).toBe(560)
    expect(report.differenceMinutes).toBe(-40)
    expect(report.willExceed).toBe(false)
  })

  it('reports a projected over-run when the pace is too high', () => {
    const report = budgetReport(budget(300), entries, at(26, 12).getTime())

    expect(report.projectedMinutes).toBe(560)
    expect(report.differenceMinutes).toBe(260)
    expect(report.willExceed).toBe(true)
  })

  it('flags an already exceeded budget', () => {
    const report = budgetReport(budget(120), entries, at(26, 12).getTime())

    expect(report.exceeded).toBe(true)
    expect(report.remainingMinutes).toBe(-120)
    expect(report.consumptionPercentage).toBe(200)
  })

  it('ignores time tracked after the due date and truncates entries at it', () => {
    const late = [
      entry(1, 1, at(30, 22), at(31, 1)),
      entry(2, 1, at(31, 9), at(31, 11)),
    ]

    const report = budgetReport(budget(600), late, at(31, 12).getTime())

    expect(report.trackedMinutes).toBe(120)
    expect(report.daysRemaining).toBe(0)
    expect(report.projectedMinutes).toBe(120)
  })

  it('handles a project without tracked time', () => {
    const report = budgetReport(budget(600), [], at(26, 12).getTime())

    expect(report.trackedMinutes).toBe(0)
    expect(report.daysElapsed).toBe(0)
    expect(report.paceMinutesPerDay).toBe(0)
    expect(report.projectedMinutes).toBe(0)
    expect(report.willExceed).toBe(false)
  })

  it('measures a running entry against the current time', () => {
    const report = budgetReport(budget(600), [entry(1, 1, at(26, 9), null)], at(26, 12).getTime())

    expect(report.trackedMinutes).toBe(180)
  })
})

describe('overdueBudget', () => {
  it('stays silent without a project or without a budget', () => {
    expect(overdueBudget([budget(600)], entries, null, at(26, 12).getTime())).toBeNull()
    expect(overdueBudget([], entries, 1, at(26, 12).getTime())).toBeNull()
  })

  it('stays silent while the budget holds and the due date is ahead', () => {
    expect(overdueBudget([budget(600)], entries, 1, at(26, 12).getTime())).toBeNull()
  })

  it('warns once the tracked time exceeds the budget', () => {
    const overdue = overdueBudget([budget(180)], entries, 1, at(26, 12).getTime())

    expect(overdue?.exceeded).toBe(true)
    expect(overdue?.pastDue).toBe(false)
    expect(overdue?.message).toBe('The budget is exceeded by 1h 00m.')
  })

  it('warns after the due date has passed', () => {
    const overdue = overdueBudget([budget(600, '2026-08-25')], entries, 1, at(26, 12).getTime())

    expect(overdue?.pastDue).toBe(true)
    expect(overdue?.exceeded).toBe(false)
    expect(overdue?.message).toContain('was due on')
  })

  it('names both reasons when the budget is late and exceeded', () => {
    const overdue = overdueBudget([budget(60, '2026-08-25')], entries, 1, at(26, 12).getTime())

    expect(overdue?.pastDue).toBe(true)
    expect(overdue?.exceeded).toBe(true)
    expect(overdue?.message).toContain('exceeded by')
  })

  it('takes the budget of the selected project only', () => {
    const other = { ...budget(60, '2026-08-25'), id: 2, projectId: 2 }

    expect(overdueBudget([other], entries, 1, at(26, 12).getTime())).toBeNull()
  })
})
