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
})
