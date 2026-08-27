import { describe, expect, it } from 'vitest'
import type { TimeEntry } from './time-entry-schema'
import { buildWorkWeekData } from './work-week-data'

function entry(startedAt: string, durationMinutes: number): TimeEntry {
  return {
    id: durationMinutes,
    project: 'Project',
    startedAt,
    endedAt: startedAt,
    durationMinutes,
  }
}

describe('buildWorkWeekData', () => {
  it('groups only entries from the current Monday-to-Sunday week', () => {
    const date = (day: number, hour: number) => new Date(2026, 7, day, hour).toISOString()
    const result = buildWorkWeekData(
      [
        entry(date(25, 9), 60),
        entry(date(24, 9), 30),
        entry(date(24, 14), 90),
        entry(date(17, 9), 480),
      ],
      new Date(2026, 7, 27, 12),
    )

    expect(result).toEqual([
      { day: 'Mon', hours: 2 },
      { day: 'Tue', hours: 1 },
    ])
  })
})
