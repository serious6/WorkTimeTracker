import { describe, expect, it } from 'vitest'
import type { Project } from '@/features/projects/project-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import {
  dayRange,
  entriesInRange,
  entryMinutes,
  findRunningEntry,
  overtimeMinutes,
  progressPercentage,
  projectTotals,
  recentProjects,
  totalMinutes,
  weekRange,
} from './metrics'

function project(id: number, name: string, color: string): Project {
  return {
    id,
    name,
    description: null,
    color,
    active: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
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

const projects = [project(1, 'Website Redesign', '#22c55e'), project(2, 'Mobile App', '#3b82f6')]
const at = (day: number, hour: number, minute = 0) => new Date(2026, 7, day, hour, minute)

describe('metrics', () => {
  it('measures a running entry against the current time', () => {
    const running = entry(1, 1, at(27, 9), null)
    expect(entryMinutes(running, at(27, 10).getTime())).toBe(60)
    expect(findRunningEntry([running])).toBe(running)
  })

  it('selects entries of a single day and of the surrounding week', () => {
    const entries = [
      entry(1, 1, at(24, 9), at(24, 10)),
      entry(2, 1, at(27, 9), at(27, 11)),
      entry(3, 2, at(31, 9), at(31, 10)),
    ]

    expect(entriesInRange(entries, dayRange(at(27, 0))).map((item) => item.id)).toEqual([2])
    expect(entriesInRange(entries, weekRange(at(27, 0))).map((item) => item.id)).toEqual([1, 2])
    expect(totalMinutes(entriesInRange(entries, weekRange(at(27, 0))))).toBe(180)
  })

  it('clips entries to the requested range', () => {
    const spanning = entry(1, 1, at(26, 23), at(27, 1))
    const running = entry(2, 1, at(26, 23), null)
    const range = dayRange(at(27, 0))

    expect(totalMinutes(entriesInRange([spanning], range), Date.now(), range)).toBe(60)
    expect(
      totalMinutes(
        entriesInRange([running], range, at(27, 0, 30).getTime()),
        at(27, 0, 30).getTime(),
        range,
      ),
    ).toBe(30)
  })

  it('never reports negative overtime', () => {
    expect(overtimeMinutes(600, 480)).toBe(120)
    expect(overtimeMinutes(300, 480)).toBe(0)
    expect(progressPercentage(465, 480)).toBe(97)
  })

  it('summarises tracked time per project and hides projects without time', () => {
    const entries = [
      entry(1, 1, at(27, 9), at(27, 12)),
      entry(2, 2, at(27, 13), at(27, 14)),
      entry(3, 99, at(27, 15), at(27, 15, 30)),
    ]

    expect(projectTotals(entries, projects)).toEqual([
      { projectId: 1, name: 'Website Redesign', color: '#22c55e', minutes: 180, percentage: 67 },
      { projectId: 2, name: 'Mobile App', color: '#3b82f6', minutes: 60, percentage: 22 },
      { projectId: 99, name: 'Deleted project', color: '#64748b', minutes: 30, percentage: 11 },
    ])
  })

  it('lists recent projects with the newest tracked project first', () => {
    const entries = [entry(1, 1, at(26, 9), at(26, 10)), entry(2, 2, at(27, 9), at(27, 10))]

    expect(recentProjects(entries, projects).map((item) => item.name)).toEqual([
      'Mobile App',
      'Website Redesign',
    ])
  })

  it('returns empty array from findRunningEntry when no entries are running', () => {
    const closed = entry(1, 1, at(27, 9), at(27, 10))
    expect(findRunningEntry([closed])).toBeUndefined()
    expect(findRunningEntry([])).toBeUndefined()
  })

  it('entryMinutes defaults now when no second argument is given', () => {
    const start = new Date(Date.now() - 60_000)
    const e = entry(1, 1, start, null)
    expect(entryMinutes(e)).toBeGreaterThanOrEqual(1)
  })

  it('progressPercentage returns 0 when targetMinutes is 0', () => {
    expect(progressPercentage(120, 0)).toBe(0)
  })

  it('projectTotals with range clips minute contributions', () => {
    const range = dayRange(at(27, 0))
    const spanning = [entry(1, 1, at(26, 23), at(27, 1))]
    const totals = projectTotals(spanning, projects, at(27, 0).getTime(), range)
    expect(totals[0]?.minutes).toBe(60)
  })

  it('projectTotals hides entries with zero minutes in range', () => {
    const range = dayRange(at(27, 0))
    const outsideEntry = [entry(1, 1, at(28, 9), at(28, 10))]
    const totals = projectTotals(outsideEntry, projects, at(28, 0).getTime(), range)
    expect(totals).toEqual([])
  })

  it('recentProjects respects the limit parameter', () => {
    const manyEntries = [1, 2].map((id) => entry(id, id, at(27, id), at(27, id + 1)))
    expect(recentProjects(manyEntries, projects, 1).length).toBe(1)
  })

  it('recentProjects skips entries with null projectId', () => {
    const withNull = [entry(1, null, at(27, 9), at(27, 10))]
    expect(recentProjects(withNull, projects)).toEqual([])
  })

  it('recentProjects omits projects that are not found in the projects list', () => {
    const entries = [entry(1, 99, at(27, 9), at(27, 10))]
    expect(recentProjects(entries, projects)).toEqual([])
  })

  it('entriesInRange sorts results by start time', () => {
    const entries = [
      entry(2, 1, at(27, 10), at(27, 11)),
      entry(1, 1, at(27, 8), at(27, 9)),
    ]
    const result = entriesInRange(entries, dayRange(at(27, 0)))
    expect(result.map((e) => e.id)).toEqual([1, 2])
  })

  it('weekRange starts on Sunday when configured', () => {
    const { start } = weekRange(at(27, 0), 'sunday')
    expect(start.getDay()).toBe(0) // Sunday
  })
})
