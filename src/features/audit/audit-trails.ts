import {
  ABSENCE_TYPE_LABELS,
  type AbsenceAudit,
  type AbsenceType,
} from '@/features/absences/absence-schema'
import {
  OVERTIME_KIND_LABELS,
  OVERTIME_ORIGIN_LABELS,
  type OvertimeAudit,
  type OvertimeKind,
  type OvertimeOrigin,
} from '@/features/overtime/overtime-schema'
import type { ListRange } from '@/features/storage/list-range'
import { addDays, formatDay, formatSignedDuration, fromDateKey, startOfDay } from '@/lib/date'
import { auditChanges, auditSummary } from './audit-changes'
import { parseSnapshot, type AuditAction, type AuditChange, type TimeEntryAudit } from './audit-schema'

/** The trails the audit view can read, all of them append-only and read-only. */
export const AUDIT_TRAIL_TYPES = ['timeEntry', 'absence', 'overtime'] as const

export type AuditTrailType = (typeof AUDIT_TRAIL_TYPES)[number]

export const AUDIT_TRAIL_TYPE_LABELS: Record<AuditTrailType, string> = {
  timeEntry: 'Time Entry',
  absence: 'Absence',
  overtime: 'Overtime',
}

export const AUDIT_TRAIL_ACTION_LABELS: Record<AuditAction, string> = {
  created: 'Created',
  updated: 'Edited',
  deleted: 'Deleted',
}

export type AuditRangeId = 'today' | 'last3' | 'last7' | 'last14' | 'lastMonth' | 'always'

/**
 * Windows offered by the audit view. `days` counts the current day, so "Today"
 * is one day; "Always" names no bounds at all and leaves the paging limits of
 * the repositories in charge.
 */
export const AUDIT_RANGES: { id: AuditRangeId; label: string; days?: number; months?: number }[] = [
  { id: 'today', label: 'Today', days: 1 },
  { id: 'last3', label: 'Last 3 days', days: 3 },
  { id: 'last7', label: 'Last 7 days', days: 7 },
  { id: 'last14', label: 'Last 14 days', days: 14 },
  { id: 'lastMonth', label: 'Last month', months: 1 },
  { id: 'always', label: 'Always' },
]

export const DEFAULT_AUDIT_RANGE: AuditRangeId = 'last7'

/** The same day of month a number of months earlier, clamped to a short month. */
function monthsBefore(date: Date, months: number): Date {
  const result = new Date(date)
  result.setDate(1)
  result.setMonth(result.getMonth() - months)
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(date.getDate(), lastDay))
  return result
}

/**
 * The window of a range option, evaluated in the local time zone: `from` is the
 * start of its first day, `to` the start of tomorrow, so the current day is
 * always included. "Always" answers `undefined`, which sends no bounds.
 */
export function auditListRange(id: AuditRangeId, now = new Date()): ListRange | undefined {
  const option = AUDIT_RANGES.find((range) => range.id === id)
  if (!option || (option.days === undefined && option.months === undefined)) return undefined
  const today = startOfDay(now)
  const from = option.months ? monthsBefore(today, option.months) : addDays(today, 1 - option.days!)
  return { from: from.toISOString(), to: addDays(today, 1).toISOString() }
}

/** One row of the audit view, independent of the trail it was read from. */
export type AuditTrailRecord = {
  key: string
  type: AuditTrailType
  action: AuditAction
  actor: string
  recordedAt: string
  summary: string
  changes: AuditChange[]
}

function parseValue<T>(value: string | null): T | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as T) : null
  } catch {
    return null
  }
}

/** The fields that differ between the recorded old and the new value. */
function fieldChanges<T>(
  oldValue: T | null,
  newValue: T | null,
  fields: { field: string; value: (snapshot: T) => string }[],
): AuditChange[] {
  if (!oldValue || !newValue) return []
  return fields
    .map(({ field, value }) => ({ field, from: value(oldValue), to: value(newValue) }))
    .filter((change) => change.from !== change.to)
}

type AbsenceSnapshot = { type: AbsenceType; date: string }

function absenceSummary(snapshot: AbsenceSnapshot | null): string {
  if (!snapshot) return ''
  return `${ABSENCE_TYPE_LABELS[snapshot.type] ?? snapshot.type} on ${formatDay(
    fromDateKey(snapshot.date),
  )}`
}

type OvertimeSnapshot = {
  effectiveDate: string
  minutes: number
  kind: OvertimeKind
  origin: OvertimeOrigin
  note: string | null
}

function overtimeSummary(snapshot: OvertimeSnapshot | null): string {
  if (!snapshot) return ''
  return `${OVERTIME_KIND_LABELS[snapshot.kind] ?? snapshot.kind} ${formatSignedDuration(
    snapshot.minutes,
  )} on ${formatDay(fromDateKey(snapshot.effectiveDate))}`
}

export function timeEntryAuditRecords(
  audits: TimeEntryAudit[],
  projectName: (projectId: number | null) => string,
): AuditTrailRecord[] {
  return audits.map((audit) => {
    const oldValue = parseSnapshot(audit.oldValue)
    const newValue = parseSnapshot(audit.newValue)
    return {
      key: `timeEntry-${audit.id}`,
      type: 'timeEntry',
      action: audit.action,
      actor: audit.actor,
      recordedAt: audit.recordedAt,
      summary: auditSummary(newValue ?? oldValue, projectName),
      changes: auditChanges(oldValue, newValue, projectName),
    }
  })
}

export function absenceAuditRecords(audits: AbsenceAudit[]): AuditTrailRecord[] {
  return audits.map((audit) => {
    const oldValue = parseValue<AbsenceSnapshot>(audit.oldValue)
    const newValue = parseValue<AbsenceSnapshot>(audit.newValue)
    return {
      key: `absence-${audit.id}`,
      type: 'absence',
      action: audit.action,
      actor: audit.actor,
      recordedAt: audit.recordedAt,
      summary: absenceSummary(newValue ?? oldValue),
      changes: fieldChanges(oldValue, newValue, [
        { field: 'Type', value: (snapshot) => ABSENCE_TYPE_LABELS[snapshot.type] ?? snapshot.type },
        { field: 'Date', value: (snapshot) => formatDay(fromDateKey(snapshot.date)) },
      ]),
    }
  })
}

export function overtimeAuditRecords(audits: OvertimeAudit[]): AuditTrailRecord[] {
  return audits.map((audit) => {
    const oldValue = parseValue<OvertimeSnapshot>(audit.oldValue)
    const newValue = parseValue<OvertimeSnapshot>(audit.newValue)
    return {
      key: `overtime-${audit.id}`,
      type: 'overtime',
      action: audit.action,
      actor: audit.actor,
      recordedAt: audit.recordedAt,
      summary: overtimeSummary(newValue ?? oldValue),
      changes: fieldChanges(oldValue, newValue, [
        { field: 'Kind', value: (snapshot) => OVERTIME_KIND_LABELS[snapshot.kind] ?? snapshot.kind },
        { field: 'Overtime', value: (snapshot) => formatSignedDuration(snapshot.minutes) },
        { field: 'Date', value: (snapshot) => formatDay(fromDateKey(snapshot.effectiveDate)) },
        {
          field: 'Origin',
          value: (snapshot) => OVERTIME_ORIGIN_LABELS[snapshot.origin] ?? snapshot.origin,
        },
        { field: 'Note', value: (snapshot) => snapshot.note ?? 'no note' },
      ]),
    }
  })
}

/** The records of every trail as one list, newest first. */
export function mergeAuditRecords(records: AuditTrailRecord[][]): AuditTrailRecord[] {
  return records
    .flat()
    .sort(
      (left, right) =>
        right.recordedAt.localeCompare(left.recordedAt) || right.key.localeCompare(left.key),
    )
}
