import { describe, expect, it } from 'vitest'
import { absenceIndex } from '@/features/absences/absence-index'
import type { Absence, AbsenceType } from '@/features/absences/absence-schema'
import { DEFAULT_WORK_SETTINGS } from '@/features/settings/work-settings-schema'
import type { EntryType, TimeEntry } from '@/features/time-entries/time-entry-schema'
import {
  exportFileName,
  formatHoursAndMinutes,
  monthlyExport,
  toCsv,
  toPdf,
} from './monthly-export'

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

/** Monday and Tuesday, both working days of the default schedule. */
const ENTRIES = [
  entry('2026-03-02', '08:00', '12:00'),
  entry('2026-03-02', '12:00', '12:30', 'break'),
  entry('2026-03-02', '12:30', '17:00'),
  entry('2026-03-03', '09:00', '15:00'),
]

function absence(date: string, type: AbsenceType): Absence {
  return { id: nextId++, type, date, createdAt: date, updatedAt: date }
}

function report(entries = ENTRIES, absences: Absence[] = []) {
  return monthlyExport(
    entries,
    DEFAULT_WORK_SETTINGS,
    new Date(2026, 2, 15),
    'first@example.com',
    new Date('2026-03-31T12:00:00.000Z').getTime(),
    absenceIndex(absences),
  )
}

describe('formatHoursAndMinutes', () => {
  it('pads hours and keeps the sign of a negative balance', () => {
    expect(formatHoursAndMinutes(465)).toBe('07:45')
    expect(formatHoursAndMinutes(-60)).toBe('-01:00')
    expect(formatHoursAndMinutes(0)).toBe('00:00')
  })
})

describe('monthlyExport', () => {
  it('lists one row per day with start, end, break and daily total', () => {
    const { rows, totals } = report()

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      dateKey: '2026-03-02',
      start: '08:00',
      end: '17:00',
      breakMinutes: 30,
      workMinutes: 510,
    })
    expect(totals.workMinutes).toBe(870)
    expect(totals.breakMinutes).toBe(30)
  })

  it('accumulates the overtime balance across the month', () => {
    const { rows, totals } = report()
    const target = rows[0].targetMinutes

    expect(rows[0].balanceMinutes).toBe(510 - target)
    expect(rows[1].balanceMinutes).toBe(510 - target + (360 - target))
    expect(totals.balanceMinutes).toBe(870 - rows[0].targetMinutes * 22)
  })

  it('subtracts targets for elapsed scheduled days without records', () => {
    const { rows, totals } = monthlyExport(
      [entry('2026-03-03', '08:00', '16:00')],
      DEFAULT_WORK_SETTINGS,
      new Date(2026, 2, 15),
      'first@example.com',
      new Date('2026-03-03T12:00:00.000Z').getTime(),
    )

    expect(rows[0].balanceMinutes).toBe(480 - rows[0].targetMinutes * 2)
    expect(totals.balanceMinutes).toBe(rows[0].balanceMinutes)
  })

  it('includes future-dated records without charging future targets', () => {
    const { rows, totals } = monthlyExport(
      [entry('2026-03-20', '08:00', '16:00')],
      DEFAULT_WORK_SETTINGS,
      new Date(2026, 2, 15),
      'first@example.com',
      new Date('2026-03-03T12:00:00.000Z').getTime(),
    )

    expect(rows[0].balanceMinutes).toBe(480 - rows[0].targetMinutes * 2)
    expect(totals.balanceMinutes).toBe(rows[0].balanceMinutes)
  })

  it('ignores days outside of the selected month', () => {
    const { rows } = report([...ENTRIES, entry('2026-04-01', '08:00', '12:00')])

    expect(rows.map((row) => row.dateKey)).toEqual(['2026-03-02', '2026-03-03'])
  })

  it('keeps records older than the retention period accessible', () => {
    const old = monthlyExport(
      [entry('2020-03-02', '08:00', '12:00')],
      DEFAULT_WORK_SETTINGS,
      new Date(2020, 2, 15),
      'first@example.com',
    )

    expect(old.rows.map((row) => row.dateKey)).toEqual(['2020-03-02'])
  })
})

describe('toCsv', () => {
  it('writes the employee, the month and one line per day', () => {
    const lines = toCsv(report()).trim().split('\n')

    expect(lines[0]).toBe('Employee,first@example.com')
    expect(lines[1]).toBe('Month,2026-03')
    expect(lines[3]).toBe('Date,Start,End,Break,Daily total,Absence,Overtime balance')
    expect(lines[4]).toBe('2026-03-02,08:00,17:00,00:30,08:30,,00:30')
    expect(lines.at(-1)).toContain('Total')
  })

  it('names the absence of a day without recorded time', () => {
    const lines = toCsv(report(ENTRIES, [absence('2026-03-04', 'vacation')]))
      .trim()
      .split('\n')

    expect(lines[6]).toBe('2026-03-04,,,00:00,00:00,Vacation,-01:30')
    expect(lines.at(-1)).toContain('1 absence day')
  })

  it('quotes fields that contain a separator', () => {
    const quoted = monthlyExport(ENTRIES, DEFAULT_WORK_SETTINGS, new Date(2026, 2, 15), 'Last, First')

    expect(toCsv(quoted)).toContain('"Last, First"')
  })

  it.each(['=1+1', '+1+1', '-1+1', '@SUM(A1:A2)'])(
    'neutralizes an employee formula starting with %s',
    (employee) => {
      const exported = monthlyExport(ENTRIES, DEFAULT_WORK_SETTINGS, new Date(2026, 2, 15), employee)

      expect(toCsv(exported).split('\n')[0]).toBe(`Employee,'${employee}`)
    },
  )

  it.each([
    ['\t=1+1', "'\t=1+1"],
    ['\r@SUM(A1:A2)', "\"'\r@SUM(A1:A2)\""],
    ['\n+1+1', "\"'\n+1+1\""],
  ])(
    'neutralizes an employee formula hidden behind leading control characters',
    (employee, expected) => {
      const exported = monthlyExport(ENTRIES, DEFAULT_WORK_SETTINGS, new Date(2026, 2, 15), employee)

      expect(toCsv(exported).startsWith(`Employee,${expected}\n`)).toBe(true)
    },
  )
})

describe('toPdf', () => {
  it('produces a PDF document with correct cross reference offsets', () => {
    const document = new TextDecoder().decode(toPdf(report()))

    expect(document.startsWith('%PDF-1.4')).toBe(true)
    expect(document.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(document).toContain('first@example.com')
    expect(document).toContain('2026-03-02')

    const startxref = Number(/startxref\n(\d+)/.exec(document)?.[1])
    expect(document.slice(startxref, startxref + 4)).toBe('xref')
    const firstOffset = Number(/\nxref\n0 \d+\n0{10} 65535 f \n(\d{10})/.exec(document)?.[1])
    expect(document.slice(firstOffset, firstOffset + 7)).toBe('1 0 obj')
  })
})

describe('exportFileName', () => {
  it('names the file after the exported month', () => {
    expect(exportFileName(report(), 'csv')).toBe('working-time-2026-03.csv')
    expect(exportFileName(report(), 'pdf')).toBe('working-time-2026-03.pdf')
  })
})
