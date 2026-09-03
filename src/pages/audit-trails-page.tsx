import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Select } from '@/components/ui/input'
import { useAbsenceAudits } from '@/features/absences/absence-queries'
import { formatMoment } from '@/features/audit/audit-changes'
import { useTimeEntryAudits } from '@/features/audit/audit-queries'
import {
  absenceAuditRecords,
  auditListRange,
  AUDIT_RANGES,
  AUDIT_TRAIL_ACTION_LABELS,
  AUDIT_TRAIL_TYPES,
  AUDIT_TRAIL_TYPE_LABELS,
  DEFAULT_AUDIT_RANGE,
  mergeAuditRecords,
  overtimeAuditRecords,
  timeEntryAuditRecords,
  type AuditRangeId,
  type AuditTrailType,
} from '@/features/audit/audit-trails'
import { useOvertimeAudits } from '@/features/overtime/overtime-queries'
import { useProjects } from '@/features/projects/project-queries'
import { DELETED_PROJECT_NAME } from '@/features/time-entries/time-entry-schema'

/**
 * Read-only compliance evidence: every recorded change of the signed-in user,
 * across all audit trails, narrowed by a window and by trail type. The view
 * offers no write action, and the queries stay scoped to the signed-in user.
 */
export function AuditTrailsPage() {
  const [rangeId, setRangeId] = useState<AuditRangeId>(DEFAULT_AUDIT_RANGE)
  const [types, setTypes] = useState<AuditTrailType[]>([])
  const range = useMemo(() => auditListRange(rangeId), [rangeId])
  const timeEntryAudits = useTimeEntryAudits(range)
  const absenceAudits = useAbsenceAudits(range)
  const overtimeAudits = useOvertimeAudits(range)
  const { data: projects = [] } = useProjects()

  const projectName = (id: number | null) =>
    projects.find((project) => project.id === id)?.name ?? DELETED_PROJECT_NAME

  const isError = timeEntryAudits.isError || absenceAudits.isError || overtimeAudits.isError
  const records = mergeAuditRecords([
    timeEntryAuditRecords(timeEntryAudits.data ?? [], projectName),
    absenceAuditRecords(absenceAudits.data ?? []),
    overtimeAuditRecords(overtimeAudits.data ?? []),
  ])
  // No selection reads as "all types", so the list is never silently empty.
  const visible = records.filter(
    (record) => types.length === 0 || types.includes(record.type),
  )

  const toggleType = (type: AuditTrailType) =>
    setTypes((current) =>
      current.includes(type) ? current.filter((value) => value !== type) : [...current, type],
    )

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Audit Trails</h1>
        <p className="text-sm text-muted-foreground">
          Every change you recorded, newest first. The trails are append-only and cannot be edited
          or deleted here.
        </p>
      </header>

      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle>Recorded changes</CardTitle>
            <p className="text-sm text-muted-foreground">
              {visible.length} record{visible.length === 1 ? '' : 's'} in the selected period.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-4">
            <Field className="sm:w-48" label="Period">
              <Select
                onChange={(event) => setRangeId(event.target.value as AuditRangeId)}
                value={rangeId}
              >
                {AUDIT_RANGES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Audit trail types</legend>
              <div className="flex flex-wrap gap-x-4">
                {AUDIT_TRAIL_TYPES.map((type) => (
                  <Checkbox
                    checked={types.includes(type)}
                    key={type}
                    label={AUDIT_TRAIL_TYPE_LABELS[type]}
                    onChange={() => toggleType(type)}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="py-6 text-sm text-destructive">The audit trails could not be loaded.</p>
          ) : visible.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No audit records for the selected filters.
            </p>
          ) : (
            <ul className="divide-y divide-border" data-testid="audit-records">
              {visible.map((record) => (
                <li className="py-3 text-sm" key={record.key}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {AUDIT_TRAIL_TYPE_LABELS[record.type]}
                    </span>
                    <span className="font-medium">{AUDIT_TRAIL_ACTION_LABELS[record.action]}</span>
                    <span className="text-muted-foreground">{record.summary}</span>
                  </div>
                  {record.changes.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {record.changes.map((change) => (
                        <li key={change.field}>
                          {change.field}: {change.from} → {change.to}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {record.actor} · {formatMoment(record.recordedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
