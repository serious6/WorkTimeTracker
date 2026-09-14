import { describe, expect, it } from 'vitest'
import type { Project } from '@/features/projects/project-schema'
import { DEFAULT_WORK_SETTINGS } from '@/features/settings/work-settings-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { rangeMetrics } from './week-metrics'

const SPRING_FORWARD_MINUTES = 1_380

function project(id: number, name: string): Project {
  return {
    id,
    name,
    description: null,
    color: '#22c55e',
    active: true,
    archived: false,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  }
}

function entry(id: number, projectId: number, start: Date, end: Date): TimeEntry {
  return {
    id,
    projectId,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    entryType: 'work',
    note: null,
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
  }
}

/**
 * Runs in `Europe/Berlin` (see the `timezone` project in `vitest.config.ts`),
 * where 2026-03-29 is the spring-forward day and therefore only 23 hours long.
 * In UTC the same local midnights are a full 1,440 minutes apart, so a
 * DST-naive day split would stay unnoticed.
 */
describe('week metrics across a daylight-saving boundary', () => {
  it('summarises the actual length of the spring-forward day', () => {
    const day = new Date(2026, 2, 29)
    const nextDay = new Date(2026, 2, 30)

    const metrics = rangeMetrics({
      entries: [entry(1, 1, day, nextDay)],
      projects: [project(1, 'Project')],
      settings: DEFAULT_WORK_SETTINGS,
      range: { start: day, end: nextDay },
      now: nextDay.getTime(),
    })

    expect((nextDay.getTime() - day.getTime()) / 60_000).toBe(SPRING_FORWARD_MINUTES)
    expect(metrics.trackedMinutes).toBe(SPRING_FORWARD_MINUTES)
    expect(metrics.days[0]?.projects[0]?.minutes).toBe(SPRING_FORWARD_MINUTES)
  })
})
