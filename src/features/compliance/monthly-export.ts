import { NO_ABSENCES, type AbsenceIndex } from '@/features/absences/absence-index'
import { ABSENCE_TYPE_LABELS, type AbsenceType } from '@/features/absences/absence-schema'
import { monthRange, type DateRange } from '@/features/dashboard/metrics'
import { targetMinutesForDay } from '@/features/settings/work-schedule'
import type { WorkSettings } from '@/features/settings/work-settings-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { addDays, fromDateKey, startOfDay, toDateKey, toTimeKey } from '@/lib/date'
import { workingDays } from './compliance-rules'

export type MonthlyExportRow = {
  dateKey: string
  start: string | null
  end: string | null
  breakMinutes: number
  workMinutes: number
  targetMinutes: number
  /** Reason why the day carries no or only half a target, `null` when worked. */
  absenceType: AbsenceType | null
  /** Cumulative balance of worked minutes against the target of the month. */
  balanceMinutes: number
}

export type MonthlyExport = {
  employee: string
  month: string
  rows: MonthlyExportRow[]
  totals: {
    workMinutes: number
    breakMinutes: number
    targetMinutes: number
    /** Days of the month excused by an absence, kept apart from worked time. */
    absenceDays: number
    balanceMinutes: number
  }
}

export const EXPORT_COLUMNS = [
  'Date',
  'Start',
  'End',
  'Break',
  'Daily total',
  'Absence',
  'Overtime balance',
] as const

/** `07:45`, and `-01:00` for a negative balance. */
export function formatHoursAndMinutes(minutes: number): string {
  const total = Math.round(Math.abs(minutes))
  const sign = minutes < 0 ? '-' : ''
  return `${sign}${`${Math.floor(total / 60)}`.padStart(2, '0')}:${`${total % 60}`.padStart(2, '0')}`
}

export function monthKey(month: Date): string {
  return toDateKey(month).slice(0, 7)
}

function inRange(dateKey: string, range: DateRange): boolean {
  const date = fromDateKey(dateKey).getTime()
  return date >= range.start.getTime() && date < range.end.getTime()
}

/**
 * Record of one employee for one month. Every day with recorded time appears
 * with its start, end, break, worked total, and the running overtime balance.
 * An absence day appears with its reason, so the record shows no unexplained
 * zero-hour weekday.
 */
export function monthlyExport(
  entries: TimeEntry[],
  settings: WorkSettings,
  month: Date,
  employee: string,
  now = Date.now(),
  absences: AbsenceIndex = NO_ABSENCES,
): MonthlyExport {
  const range = monthRange(month)
  const days = workingDays(entries, settings.complianceLimits, now).filter((day) =>
    inRange(day.dateKey, range),
  )
  const daysByKey = new Map(days.map((day) => [day.dateKey, day] as const))
  const absenceKeys = [...absences.keys()].filter((dateKey) => inRange(dateKey, range))
  const rowKeys = [...new Set([...daysByKey.keys(), ...absenceKeys])].sort((left, right) =>
    left.localeCompare(right),
  )
  const balanceByKey = new Map<string, number>()
  let balanceMinutes = 0
  const elapsedEnd = new Date(
    Math.min(range.end.getTime(), addDays(startOfDay(new Date(now)), 1).getTime()),
  )
  const lastRecordedEnd = rowKeys.at(-1) ? addDays(fromDateKey(rowKeys.at(-1)!), 1) : range.start
  const balanceEnd = new Date(Math.max(elapsedEnd.getTime(), lastRecordedEnd.getTime()))
  for (let date = range.start; date < balanceEnd; date = addDays(date, 1)) {
    const dateKey = toDateKey(date)
    balanceMinutes +=
      (daysByKey.get(dateKey)?.workMinutes ?? 0) -
      (date < elapsedEnd ? targetMinutesForDay(settings, date, absences) : 0)
    balanceByKey.set(dateKey, balanceMinutes)
  }
  const rows = rowKeys.map((dateKey) => {
    const day = daysByKey.get(dateKey)
    return {
      dateKey,
      start: day?.start ? toTimeKey(day.start) : null,
      end: day?.end ? toTimeKey(day.end) : null,
      breakMinutes: day?.breakMinutes ?? 0,
      workMinutes: day?.workMinutes ?? 0,
      targetMinutes: targetMinutesForDay(settings, fromDateKey(dateKey), absences),
      absenceType: absences.get(dateKey) ?? null,
      balanceMinutes: balanceByKey.get(dateKey) ?? 0,
    }
  })

  return {
    employee,
    month: monthKey(month),
    rows,
    totals: {
      workMinutes: rows.reduce((total, row) => total + row.workMinutes, 0),
      breakMinutes: rows.reduce((total, row) => total + row.breakMinutes, 0),
      targetMinutes: rows.reduce((total, row) => total + row.targetMinutes, 0),
      absenceDays: rows.filter((row) => row.absenceType !== null).length,
      balanceMinutes,
    },
  }
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function csvTextField(value: string): string {
  const safeValue = /^[\t\r\n]*[=+\-@]/.test(value) ? `'${value}` : value
  return csvField(safeValue)
}

function rowValues(row: MonthlyExportRow): string[] {
  return [
    row.dateKey,
    row.start ?? '',
    row.end ?? '',
    formatHoursAndMinutes(row.breakMinutes),
    formatHoursAndMinutes(row.workMinutes),
    row.absenceType ? ABSENCE_TYPE_LABELS[row.absenceType] : '',
    formatHoursAndMinutes(row.balanceMinutes),
  ]
}

/** Worked totals stay separate from the number of excused days. */
function totalValues(report: MonthlyExport): string[] {
  return [
    'Total',
    '',
    '',
    formatHoursAndMinutes(report.totals.breakMinutes),
    formatHoursAndMinutes(report.totals.workMinutes),
    `${report.totals.absenceDays} absence day${report.totals.absenceDays === 1 ? '' : 's'}`,
    formatHoursAndMinutes(report.totals.balanceMinutes),
  ]
}

export function toCsv(report: MonthlyExport): string {
  const lines = [
    [`Employee`, csvTextField(report.employee)].join(','),
    [`Month`, report.month].map(csvField).join(','),
    '',
    EXPORT_COLUMNS.join(','),
    ...report.rows.map((row) => rowValues(row).map(csvField).join(',')),
    totalValues(report).map(csvField).join(','),
  ]
  return `${lines.join('\n')}\n`
}

const PAGE_HEIGHT = 842
const PAGE_WIDTH = 595
const MARGIN = 40
const LINE_HEIGHT = 14
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LINE_HEIGHT)
const COLUMN_WIDTHS = [14, 8, 8, 8, 14, 14, 18]

/** Keeps the document to printable ASCII so byte and character offsets match. */
function ascii(value: string): string {
  return [...value].map((character) => (character.charCodeAt(0) < 128 ? character : '?')).join('')
}

function pdfText(value: string): string {
  return ascii(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
}

function columns(values: readonly string[]): string {
  return values.map((value, index) => ascii(value).padEnd(COLUMN_WIDTHS[index] ?? 12)).join(' ')
}

function reportLines(report: MonthlyExport): string[] {
  return [
    'Working time record',
    `Employee: ${report.employee}`,
    `Month: ${report.month}`,
    '',
    columns(EXPORT_COLUMNS),
    ...report.rows.map((row) => columns(rowValues(row))),
    '',
    columns(totalValues(report)),
  ]
}

function contentStream(lines: string[]): string {
  const body = lines.map((line) => `(${pdfText(line)}) Tj T*`).join('\n')
  return `BT\n/F1 9 Tf\n${LINE_HEIGHT} TL\n${MARGIN} ${PAGE_HEIGHT - MARGIN} Td\n${body}\nET`
}

function chunk(lines: string[]): string[][] {
  const pages: string[][] = []
  for (let index = 0; index < lines.length; index += LINES_PER_PAGE) {
    pages.push(lines.slice(index, index + LINES_PER_PAGE))
  }
  return pages.length > 0 ? pages : [[]]
}

/**
 * Minimal, dependency free PDF with one monospaced text column per page. The
 * generated file is a valid PDF 1.4 document with a cross reference table.
 */
export function toPdf(report: MonthlyExport): Uint8Array<ArrayBuffer> {
  const pages = chunk(reportLines(report))
  const fontId = 3
  const pageIds = pages.map((_, index) => fontId + 1 + index * 2)
  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>`,
  ]
  for (const [index, lines] of pages.entries()) {
    const content = contentStream(lines)
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${pageIds[index] + 1} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    )
  }

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const startxref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${`${offset}`.padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

export function exportFileName(report: MonthlyExport, extension: 'csv' | 'pdf'): string {
  return `working-time-${report.month}.${extension}`
}
