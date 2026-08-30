import { describe, expect, it } from 'vitest'
import { GERMAN_COMPLIANCE_LIMITS } from '@/features/settings/work-settings-schema'
import type { EntryType, TimeEntry } from '@/features/time-entries/time-entry-schema'
import {
  complianceWarningsForEntries,
  requiredBreakMinutes,
  workingDays,
} from './compliance-rules'

let nextId = 1

function entry(day: string, start: string, end: string, entryType: EntryType = 'work'): TimeEntry {
  const startTime = new Date(`${day}T${start}:00`).toISOString()
  const endTime = new Date(`${day}T${end}:00`).toISOString()
  return {
    id: nextId++,
    projectId: entryType === 'break' ? null : 1,
    startTime,
    endTime,
    entryType,
    note: null,
    createdAt: startTime,
    updatedAt: startTime,
  }
}

function rules(entries: TimeEntry[]): string[] {
  return complianceWarningsForEntries(entries).map((warning) => warning.rule)
}

const SHORTER_LIMITS = { ...GERMAN_COMPLIANCE_LIMITS, maxDailyWorkMinutes: 480 }

describe('workingDays', () => {
  it('counts break entries separately from working time', () => {
    const [day] = workingDays([
      entry('2026-03-02', '08:00', '12:00'),
      entry('2026-03-02', '12:00', '12:30', 'break'),
      entry('2026-03-02', '12:30', '16:00'),
    ])

    expect(day.workMinutes).toBe(450)
    expect(day.breakMinutes).toBe(30)
    expect(day.countedBreakMinutes).toBe(30)
    expect(day.start?.getHours()).toBe(8)
    expect(day.end?.getHours()).toBe(16)
  })

  it('uses work timestamps for day boundaries and ignores break-only days', () => {
    const [day] = workingDays([
      entry('2026-03-02', '07:00', '07:15', 'break'),
      entry('2026-03-02', '08:00', '16:00'),
      entry('2026-03-02', '16:00', '16:15', 'break'),
    ])
    const [breakOnly] = workingDays([entry('2026-03-03', '08:00', '08:30', 'break')])

    expect(day.start?.getHours()).toBe(8)
    expect(day.end?.getHours()).toBe(16)
    expect(breakOnly.start).toBeNull()
    expect(breakOnly.end).toBeNull()
  })
})

describe('requiredBreakMinutes', () => {
  it('follows the six and nine hour thresholds', () => {
    expect(requiredBreakMinutes(360, GERMAN_COMPLIANCE_LIMITS)).toBe(0)
    expect(requiredBreakMinutes(361, GERMAN_COMPLIANCE_LIMITS)).toBe(30)
    expect(requiredBreakMinutes(540, GERMAN_COMPLIANCE_LIMITS)).toBe(30)
    expect(requiredBreakMinutes(541, GERMAN_COMPLIANCE_LIMITS)).toBe(45)
  })
})

describe('complianceWarningsForEntries', () => {
  it('ignores break blocks shorter than fifteen minutes, ArbZG § 4 sentence 2', () => {
    const warnings = complianceWarningsForEntries([
      entry('2026-03-02', '08:00', '11:00'),
      entry('2026-03-02', '11:00', '11:10', 'break'),
      entry('2026-03-02', '11:10', '13:00'),
      entry('2026-03-02', '13:00', '13:20', 'break'),
      entry('2026-03-02', '13:20', '16:00'),
    ])

    expect(warnings.map((warning) => warning.rule)).toEqual(['break'])
    expect(warnings[0].message).toContain('shorter than 15 minutes')
  })

  it('merges adjacent break entries into one qualifying block', () => {
    expect(
      rules([
        entry('2026-03-02', '08:00', '12:00'),
        entry('2026-03-02', '12:00', '12:15', 'break'),
        entry('2026-03-02', '12:15', '12:30', 'break'),
        entry('2026-03-02', '12:30', '16:00'),
      ]),
    ).toEqual([])
  })

  it('does not count a break that does not interrupt work', () => {
    expect(
      rules([
        entry('2026-03-02', '07:00', '18:00'),
        entry('2026-03-02', '18:00', '18:45', 'break'),
      ]),
    ).toContain('break')
  })

  it('warns about more than six hours of work in a row, ArbZG § 4 sentence 3', () => {
    const warnings = complianceWarningsForEntries([
      entry('2026-03-02', '08:00', '14:30'),
      entry('2026-03-02', '14:30', '15:15', 'break'),
      entry('2026-03-02', '15:15', '16:00'),
    ])

    expect(warnings.map((warning) => warning.rule)).toEqual(['continuousWork'])
    expect(warnings[0].message).toContain('6h 30m')
  })

  it('applies configured limits instead of the German defaults', () => {
    const entries = [
      entry('2026-03-02', '06:00', '12:00'),
      entry('2026-03-02', '12:00', '12:45', 'break'),
      entry('2026-03-02', '12:45', '15:00'),
    ]

    expect(complianceWarningsForEntries(entries)).toEqual([])
    expect(
      complianceWarningsForEntries(entries, SHORTER_LIMITS).map((warning) => warning.rule),
    ).toEqual(['dailyMaximum'])
  })

  it('warns about a break below thirty minutes after six hours', () => {
    const warnings = complianceWarningsForEntries([
      entry('2026-03-02', '08:00', '11:00'),
      entry('2026-03-02', '11:00', '11:15', 'break'),
      entry('2026-03-02', '11:15', '16:00'),
    ])

    expect(warnings.map((warning) => warning.rule)).toEqual(['break'])
    expect(warnings[0].message).toContain('at least 0h 30m are required')
  })

  it('accepts six hours of work without a break', () => {
    expect(rules([entry('2026-03-02', '08:00', '14:00')])).toEqual([])
  })

  it('warns when a nine hour day only has a thirty minute break', () => {
    const warnings = complianceWarningsForEntries([
      entry('2026-03-02', '06:00', '12:00'),
      entry('2026-03-02', '12:00', '12:30', 'break'),
      entry('2026-03-02', '12:30', '16:00'),
    ])

    expect(warnings.map((warning) => warning.rule)).toEqual(['break'])
    expect(warnings[0].message).toContain('45m')
  })

  it('warns when the daily maximum of ten hours is exceeded', () => {
    expect(
      rules([
        entry('2026-03-02', '06:00', '12:00'),
        entry('2026-03-02', '12:00', '12:45', 'break'),
        entry('2026-03-02', '12:45', '18:00'),
      ]),
    ).toEqual(['dailyMaximum'])
  })

  it('warns when the rest period stays below eleven hours', () => {
    const warnings = complianceWarningsForEntries([
      entry('2026-03-02', '10:00', '15:00'),
      entry('2026-03-03', '01:00', '05:00'),
    ])

    expect(warnings.map((warning) => warning.rule)).toEqual(['restPeriod'])
    expect(warnings[0].dateKey).toBe('2026-03-03')
  })

  it('accepts eleven hours of rest between two working days', () => {
    expect(
      rules([entry('2026-03-02', '08:00', '14:00'), entry('2026-03-03', '01:00', '05:00')]),
    ).toEqual([])
  })

  it('reports every broken rule of a day without discarding the record', () => {
    const entries = [entry('2026-03-02', '06:00', '17:30')]

    expect(rules(entries)).toEqual(['break', 'continuousWork', 'dailyMaximum'])
    expect(workingDays(entries)[0].workMinutes).toBe(690)
  })

  it('raises no warning for an absence day that carries no time entries', () => {
    expect(workingDays([])).toEqual([])
    expect(rules([])).toEqual([])
    expect(
      complianceWarningsForEntries([entry('2026-03-02', '08:00', '14:00')]).map(
        (warning) => warning.dateKey,
      ),
    ).not.toContain('2026-03-03')
  })
})
