import { describe, expect, it } from 'vitest'
import type { Project } from '@/features/projects/project-schema'
import { DEFAULT_WORK_SETTINGS } from '@/features/settings/work-settings-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { monthOverviewMetrics, monthWeekStrip, rangeMetrics, weekMetrics } from './week-metrics'

function project(id: number, name: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    name,
    description: null,
    color: '#22c55e',
    active: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function entry(id: number, projectId: number | null, start: Date, end: Date | null): TimeEntry {
  return {
    id,
    projectId,
    startTime: start.toISOString(),
    endTime: end?.toISOString() ?? null,
    note: null,
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
  }
}

const at = (day: number, hour: number, minute = 0) => new Date(2026, 7, day, hour, minute)
const settings = DEFAULT_WORK_SETTINGS

describe('week metrics', () => {
  it('computes tracked, target and balance for a selected week', () => {
    const entries = [entry(1, 1, at(24, 9), at(24, 11)), entry(2, 1, at(25, 9), at(25, 12))]
    const metrics = weekMetrics({
      entries,
      projects: [project(1, 'Project')],
      settings,
      selectedDate: at(27, 12),
      now: at(27, 12).getTime(),
    })

    expect(metrics.trackedMinutes).toBe(300)
    expect(metrics.targetMinutes).toBe(2_400)
    expect(metrics.remainingMinutes).toBe(2_100)
    expect(metrics.progressPercentage).toBe(13)
  })

  it('uses a pro-rated target for mid-week balance', () => {
    const entries = [entry(1, 1, at(24, 9), at(24, 11))]
    const metrics = weekMetrics({
      entries,
      projects: [project(1, 'Project')],
      settings,
      selectedDate: at(27, 12),
      now: at(27, 12).getTime(),
    })

    expect(metrics.elapsedWorkingDays).toBe(4)
    expect(metrics.proratedTargetMinutes).toBe(1_920)
    expect(metrics.balanceToDateMinutes).toBe(-1_800)
  })

  it('forecasts with completed-day history and returns required average per remaining day', () => {
    const entries = [entry(1, 1, at(24, 9), at(24, 17)), entry(2, 1, at(25, 9), at(25, 17))]
    const metrics = weekMetrics({
      entries,
      projects: [project(1, 'Project')],
      settings,
      selectedDate: at(27, 12),
      now: at(27, 12).getTime(),
    })

    expect(metrics.remainingWorkingDays).toBe(1)
    expect(metrics.forecastMinutes).toBe(1_280)
    expect(metrics.requiredAveragePerRemainingDayMinutes).toBe(1_440)
  })

  it('falls back to daily target for forecast when there is no completed-day history', () => {
    const weekRange = {
      start: new Date(2026, 7, 31, 0, 0),
      end: new Date(2026, 8, 7, 0, 0),
    }
    const metrics = rangeMetrics({
      entries: [],
      projects: [project(1, 'Project')],
      settings,
      range: weekRange,
      now: new Date(2026, 7, 31, 10, 0).getTime(),
    })

    expect(metrics.forecastMinutes).toBe(2_400)
  })

  it('distinguishes tracked, zero-hour, untracked and non-working days', () => {
    const entries = [
      entry(1, 1, at(24, 9), at(24, 12)),
      entry(2, 1, at(25, 9), at(25, 9)), // booked without any duration
    ]
    const metrics = weekMetrics({
      entries,
      projects: [project(1, 'Project')],
      settings,
      selectedDate: at(27, 12),
      now: at(27, 12).getTime(),
    })
    const statusOf = (dateKey: string) => metrics.days.find((day) => day.dateKey === dateKey)?.status

    expect(statusOf('2026-08-24')).toBe('tracked')
    expect(statusOf('2026-08-25')).toBe('zero')
    expect(statusOf('2026-08-26')).toBe('untracked')
    expect(statusOf('2026-08-29')).toBe('non-working')
  })

  it('returns safe zero values for empty or zero-target ranges', () => {
    const emptyTargetSettings = { ...settings, weeklyTargetMinutes: 1, workingDays: [] }
    const metrics = weekMetrics({
      entries: [],
      projects: [project(1, 'Project')],
      settings: emptyTargetSettings,
      selectedDate: at(27, 12),
      now: at(27, 12).getTime(),
    })

    expect(metrics.progressPercentage).toBe(0)
    expect(metrics.averageDayLengthMinutes).toBe(0)
    expect(metrics.requiredAveragePerRemainingDayMinutes).toBe(0)
  })
})

describe('month metrics', () => {
  it('computes month-to-date totals and pro-rated month balance', () => {
    const entries = [entry(1, 1, at(1, 9), at(1, 11)), entry(2, 1, at(3, 9), at(3, 12))]
    const metrics = monthOverviewMetrics({
      entries,
      projects: [project(1, 'Project')],
      settings,
      selectedDate: at(27, 12),
      now: at(27, 12).getTime(),
    })

    expect(metrics.trackedMinutes).toBe(300)
    expect(metrics.elapsedWorkingDays).toBeGreaterThan(0)
    expect(metrics.balanceToDateMinutes).toBeLessThan(0)
  })

  it('forecasts the month using completed working days and computes required daily average', () => {
    const entries = [entry(1, 1, at(1, 9), at(1, 17)), entry(2, 1, at(4, 9), at(4, 17))]
    const metrics = monthOverviewMetrics({
      entries,
      projects: [project(1, 'Project')],
      settings,
      selectedDate: at(27, 12),
      now: at(27, 12).getTime(),
    })

    expect(metrics.forecastMinutes).toBeGreaterThan(0)
    expect(metrics.requiredAveragePerRemainingDayMinutes).toBeGreaterThanOrEqual(0)
  })

  it('aggregates month weeks and handles month boundaries with partial weeks', () => {
    const metrics = monthOverviewMetrics({
      entries: [entry(1, 1, at(31, 9), at(31, 11))],
      projects: [project(1, 'Project')],
      settings,
      selectedDate: new Date(2026, 8, 2, 12, 0),
      now: new Date(2026, 8, 2, 12, 0).getTime(),
    })

    expect(metrics.weekStrip.length).toBeGreaterThanOrEqual(4)
    expect(metrics.weekStrip[0]?.targetMinutes).toBeLessThanOrEqual(2_400)
    expect(metrics.weekStrip.at(-1)?.targetMinutes).toBeLessThanOrEqual(2_400)
  })

  it('builds week-strip rows for a month even when no entries are tracked', () => {
    const month = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) }
    const strip = monthWeekStrip({
      entries: [],
      projects: [project(1, 'Project')],
      settings,
      month,
      now: at(27, 12).getTime(),
    })

    expect(strip.length).toBeGreaterThan(0)
    expect(strip.every((row) => Number.isFinite(row.trackedMinutes))).toBe(true)
  })
})
