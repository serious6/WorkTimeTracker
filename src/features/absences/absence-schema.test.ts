import { describe, expect, it } from 'vitest'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { absenceIndex } from './absence-index'
import {
  absenceDaysOfForm,
  absenceFormSchema,
  ABSENCE_RANGE_MESSAGE,
  MAX_ABSENCE_RANGE_DAYS,
  type Absence,
} from './absence-schema'
import { absenceWorkWarnings } from './absence-warnings'

function absence(date: string): Absence {
  return { id: 1, type: 'vacation', date, createdAt: date, updatedAt: date }
}

function entry(day: string, start: string, end: string): TimeEntry {
  const startTime = new Date(`${day}T${start}:00`).toISOString()
  const endTime = new Date(`${day}T${end}:00`).toISOString()
  return {
    id: 1,
    projectId: 1,
    startTime,
    endTime,
    entryType: 'work',
    note: null,
    createdAt: startTime,
    updatedAt: startTime,
  }
}

describe('absence form', () => {
  it('expands a range into one record per calendar day', () => {
    const form = absenceFormSchema.parse({
      type: 'vacation',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
    })

    expect(absenceDaysOfForm(form)).toEqual([
      { type: 'vacation', date: '2026-09-01' },
      { type: 'vacation', date: '2026-09-02' },
      { type: 'vacation', date: '2026-09-03' },
    ])
  })

  it('accepts a single day as a range of one', () => {
    const form = absenceFormSchema.parse({
      type: 'halfDay',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
    })

    expect(absenceDaysOfForm(form)).toEqual([{ type: 'halfDay', date: '2026-09-01' }])
  })

  it('rejects a range that ends before it starts', () => {
    const result = absenceFormSchema.safeParse({
      type: 'vacation',
      startDate: '2026-09-03',
      endDate: '2026-09-01',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(ABSENCE_RANGE_MESSAGE)
  })

  it('rejects a range longer than a year', () => {
    expect(
      absenceFormSchema.safeParse({
        type: 'vacation',
        startDate: '2026-01-01',
        endDate: '2027-12-31',
      }).success,
    ).toBe(false)
    expect(MAX_ABSENCE_RANGE_DAYS).toBe(366)
  })

  it('limits ranges by calendar days across daylight-saving transitions', () => {
    expect(
      absenceFormSchema.safeParse({
        type: 'vacation',
        startDate: '2026-03-01',
        endDate: '2027-03-02',
      }).success,
    ).toBe(false)
  })
})

describe('absence warnings', () => {
  const now = new Date('2026-09-02T18:00:00.000Z').getTime()

  it('warns about time recorded on an absence day without blocking it', () => {
    const warnings = absenceWorkWarnings(
      [entry('2026-09-01', '08:00', '12:00')],
      absenceIndex([absence('2026-09-01')]),
      now,
    )

    expect(warnings).toHaveLength(1)
    expect(warnings[0].dateKey).toBe('2026-09-01')
    expect(warnings[0].message).toContain('vacation')
  })

  it('stays silent for days without an absence and for absences without time', () => {
    expect(
      absenceWorkWarnings(
        [entry('2026-09-02', '08:00', '12:00')],
        absenceIndex([absence('2026-09-01')]),
        now,
      ),
    ).toEqual([])
    expect(absenceWorkWarnings([], absenceIndex([absence('2026-09-01')]), now)).toEqual(
      [],
    )
  })

  it('warns for overnight work and describes a remaining half-day target', () => {
    const overnight = {
      ...entry('2026-09-01', '22:00', '23:00'),
      endTime: new Date('2026-09-02T02:00:00').toISOString(),
    }
    const warnings = absenceWorkWarnings(
      [overnight],
      absenceIndex([absence('2026-09-02'), { ...absence('2026-09-01'), id: 2, type: 'halfDay' }]),
      now,
    )

    expect(warnings.map((warning) => warning.dateKey)).toEqual(['2026-09-01', '2026-09-02'])
    expect(warnings[0]?.message).toContain('half the target still applies')
  })
})
