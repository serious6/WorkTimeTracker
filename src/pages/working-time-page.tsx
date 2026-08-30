import { useState } from 'react'
import { AlertTriangle, Download, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAbsenceIndex } from '@/features/absences/absence-queries'
import { ABSENCE_TYPE_LABELS } from '@/features/absences/absence-schema'
import { absenceWorkWarnings } from '@/features/absences/absence-warnings'
import { useSession } from '@/features/auth/session-queries'
import { useTimeEntryAudits } from '@/features/compliance/audit-queries'
import { complianceWarningsForEntries, RETENTION_YEARS } from '@/features/compliance/compliance-rules'
import { downloadFile } from '@/features/compliance/download-file'
import {
  exportFileName,
  monthKey,
  monthlyExport,
  toCsv,
  toPdf,
} from '@/features/compliance/monthly-export'
import { useWorkSettings } from '@/features/settings/work-settings-queries'
import { auditChanges, type TimeEntryAudit } from '@/features/time-entries/audit-schema'
import { useTimeEntries } from '@/features/time-entries/time-entry-queries'
import { useTicker } from '@/features/timer/use-ticker'
import { formatDay, formatDuration, fromDateKey } from '@/lib/date'

function auditSummary(audit: TimeEntryAudit): string {
  const changes = auditChanges(audit)
  if (changes.length === 0) return audit.action
  return changes.map((change) => `${change.field}: ${change.from} → ${change.to}`).join(', ')
}

export function WorkingTimePage() {
  const { data: user } = useSession()
  const settings = useWorkSettings()
  const { data: entries = [] } = useTimeEntries()
  const { data: audits = [] } = useTimeEntryAudits()
  const absences = useAbsenceIndex()
  const now = useTicker(true)
  const [month, setMonth] = useState(() => monthKey(new Date()))

  const selectedMonth = fromDateKey(`${month}-01`)
  const report = monthlyExport(entries, settings, selectedMonth, user?.email ?? '', now, absences)
  const warnings = complianceWarningsForEntries(entries, settings.complianceLimits, now).filter((warning) =>
    warning.dateKey.startsWith(month),
  )
  // Recording time on an absence day never blocks, it only warns.
  const absenceWarnings = absenceWorkWarnings(
    entries,
    absences,
    settings.complianceLimits,
    now,
  ).filter((warning) => warning.dateKey.startsWith(month))

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Working Time</h1>
          <p className="text-sm text-muted-foreground">
            Break and rest checks plus the monthly record. Warnings are informative and never block
            recording.
          </p>
        </div>
        <label className="space-y-1 text-sm font-medium">
          Month
          <Input
            aria-label="Month"
            name="month"
            onChange={(event) => event.target.value && setMonth(event.target.value)}
            type="month"
            value={month}
          />
        </label>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Compliance warnings</CardTitle>
        </CardHeader>
        <CardContent>
          {warnings.length === 0 && absenceWarnings.length === 0 ? (
            <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 text-success" />
              No break, daily maximum or rest period issues in this month.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {warnings.map((warning) => (
                <li
                  className="flex items-start gap-3 py-2 text-sm"
                  key={`${warning.dateKey}-${warning.rule}`}
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>
                    <span className="font-medium">{formatDay(fromDateKey(warning.dateKey))}</span>{' '}
                    <span className="text-muted-foreground">{warning.message}</span>
                  </span>
                </li>
              ))}
              {absenceWarnings.map((warning) => (
                <li
                  className="flex items-start gap-3 py-2 text-sm"
                  key={`${warning.dateKey}-absence`}
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>
                    <span className="font-medium">{formatDay(fromDateKey(warning.dateKey))}</span>{' '}
                    <span className="text-muted-foreground">{warning.message}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Monthly record</CardTitle>
          <div className="flex gap-2">
            <Button
              disabled={report.rows.length === 0}
              onClick={() =>
                downloadFile(exportFileName(report, 'csv'), toCsv(report), 'text/csv;charset=utf-8')
              }
              variant="outline"
            >
              <Download className="size-4" />
              Export CSV
            </Button>
            <Button
              disabled={report.rows.length === 0}
              onClick={() =>
                downloadFile(exportFileName(report, 'pdf'), toPdf(report), 'application/pdf')
              }
              variant="outline"
            >
              <Download className="size-4" />
              Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No time recorded and no absence in this month.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Start</th>
                  <th className="py-2 font-medium">End</th>
                  <th className="py-2 font-medium">Break</th>
                  <th className="py-2 font-medium">Daily total</th>
                  <th className="py-2 font-medium">Absence</th>
                  <th className="py-2 font-medium">Overtime balance</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr className="border-b border-border last:border-0" key={row.dateKey}>
                    <td className="py-2">{formatDay(fromDateKey(row.dateKey))}</td>
                    <td className="py-2 tabular-nums">{row.start ?? '—'}</td>
                    <td className="py-2 tabular-nums">{row.end ?? '—'}</td>
                    <td className="py-2 tabular-nums">{formatDuration(row.breakMinutes)}</td>
                    <td className="py-2 tabular-nums">{formatDuration(row.workMinutes)}</td>
                    <td className="py-2">
                      {row.absenceType ? ABSENCE_TYPE_LABELS[row.absenceType] : '—'}
                    </td>
                    <td className="py-2 tabular-nums">
                      {row.balanceMinutes < 0 ? '-' : '+'}
                      {formatDuration(Math.abs(row.balanceMinutes))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every change to a time entry is kept with actor, timestamp and previous values. Records
            are retained for at least {RETENTION_YEARS} years.
          </p>
        </CardHeader>
        <CardContent>
          {audits.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {audits.map((audit) => (
                <li className="flex flex-wrap gap-x-3 py-2 text-sm" key={audit.id}>
                  <span className="font-medium capitalize">{audit.action}</span>
                  <span className="text-muted-foreground">
                    entry #{audit.timeEntryId} by {audit.actor} on{' '}
                    {new Date(audit.recordedAt).toLocaleString('en-US')}
                  </span>
                  <span className="w-full text-muted-foreground">{auditSummary(audit)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
