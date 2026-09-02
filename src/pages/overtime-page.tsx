import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select } from '@/components/ui/input'
import { toast } from '@/components/ui/toast-store'
import { useAbsenceIndex } from '@/features/absences/absence-queries'
import { cumulativeBalance } from '@/features/dashboard/balance'
import { OvertimeDialog } from '@/features/overtime/components/overtime-dialog'
import {
  useDeleteOvertimeEntry,
  useOvertimeAudits,
  useOvertimeEntries,
} from '@/features/overtime/overtime-queries'
import {
  OVERTIME_KIND_LABELS,
  OVERTIME_ORIGINS,
  OVERTIME_ORIGIN_LABELS,
  type OvertimeEntry,
  type OvertimeOrigin,
} from '@/features/overtime/overtime-schema'
import { useWorkSettings } from '@/features/settings/work-settings-queries'
import { useTimeEntries } from '@/features/time-entries/time-entry-queries'
import { useTicker } from '@/features/timer/use-ticker'
import { formatDay, formatSignedDuration, fromDateKey, toDateKey } from '@/lib/date'

type OriginFilter = OvertimeOrigin | 'all'

function overtimeValue(value: string | null): string | null {
  if (!value) return null
  try {
    const entry = JSON.parse(value) as {
      effectiveDate: string
      minutes: number
      kind: keyof typeof OVERTIME_KIND_LABELS
      origin: OvertimeOrigin
    }
    return `${OVERTIME_KIND_LABELS[entry.kind]} ${formatSignedDuration(entry.minutes)} on ${
      entry.effectiveDate
    } (${OVERTIME_ORIGIN_LABELS[entry.origin]})`
  } catch {
    return null
  }
}

/**
 * Overtime management: the balance derived from the time entries, the explicit
 * records that correct it and the audit trail of every change.
 */
export function OvertimePage() {
  const settings = useWorkSettings()
  const { data: entries = [] } = useTimeEntries()
  const { data: overtime = [] } = useOvertimeEntries()
  const { data: audits = [] } = useOvertimeAudits()
  const absences = useAbsenceIndex()
  const deleteEntry = useDeleteOvertimeEntry()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<OvertimeEntry>()
  const [deleting, setDeleting] = useState<OvertimeEntry>()
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all')
  const now = useTicker(true)

  const today = new Date(now)
  const balance = cumulativeBalance({
    entries,
    settings,
    throughDate: today,
    absences,
    overtime,
    now,
  })
  const newestFirst = [...overtime].sort((left, right) =>
    right.effectiveDate.localeCompare(left.effectiveDate),
  )
  const visible = newestFirst.filter(
    (entry) => originFilter === 'all' || entry.origin === originFilter,
  )

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overtime</h1>
          <p className="text-sm text-muted-foreground">
            Overtime is kept up to date automatically from your time entries. Set an opening
            balance or correct the balance explicitly when it was managed elsewhere.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(undefined)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" />
          Set overtime
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Overtime balance</CardTitle>
          <p className="text-sm text-muted-foreground">
            {balance.startDate
              ? `Automatic part since ${formatDay(balance.startDate)}`
              : 'No time tracked yet'}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Current balance</p>
            <p
              className={`text-2xl font-semibold tabular-nums ${
                balance.balanceMinutes < 0 ? 'text-warning' : 'text-success'
              }`}
              data-testid="overtime-balance"
            >
              {formatSignedDuration(balance.balanceMinutes)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Automatic</p>
            <p className="text-2xl font-semibold tabular-nums" data-testid="overtime-automatic">
              {formatSignedDuration(balance.automaticMinutes)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Explicit</p>
            <p className="text-2xl font-semibold tabular-nums" data-testid="overtime-explicit">
              {formatSignedDuration(balance.explicitMinutes)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle>Overtime records</CardTitle>
            <p className="text-sm text-muted-foreground">
              {overtime.length} record{overtime.length === 1 ? '' : 's'}, newest first. The
              automatically derived part is not stored.
            </p>
          </div>
          <label className="block space-y-1 text-sm font-medium sm:w-48">
            Filter by origin
            <Select
              onChange={(event) => setOriginFilter(event.target.value as OriginFilter)}
              value={originFilter}
            >
              <option value="all">All origins</option>
              {OVERTIME_ORIGINS.map((origin) => (
                <option key={origin} value={origin}>
                  {OVERTIME_ORIGIN_LABELS[origin]}
                </option>
              ))}
            </Select>
          </label>
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              {overtime.length === 0
                ? 'No explicit overtime yet. Set an opening balance to carry over the overtime from before this application.'
                : 'No record with this origin.'}
            </p>
          ) : (
            <ul className="divide-y divide-border" data-testid="overtime-records">
              {visible.map((entry) => (
                <li className="flex flex-wrap items-center gap-3 py-3 text-sm" key={entry.id}>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {formatDay(fromDateKey(entry.effectiveDate))}
                  </span>
                  <span className="text-muted-foreground">{OVERTIME_KIND_LABELS[entry.kind]}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {OVERTIME_ORIGIN_LABELS[entry.origin]}
                  </span>
                  <span className="tabular-nums">{formatSignedDuration(entry.minutes)}</span>
                  {entry.note && (
                    <span className="w-full truncate text-muted-foreground sm:w-auto">
                      {entry.note}
                    </span>
                  )}
                  <Button
                    aria-label={`Edit overtime on ${entry.effectiveDate}`}
                    onClick={() => {
                      setEditing(entry)
                      setDialogOpen(true)
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <Pencil aria-hidden className="size-4" />
                  </Button>
                  <Button
                    aria-label={`Delete overtime on ${entry.effectiveDate}`}
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleting(entry)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Overtime audit trail</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every creation, change and deletion is kept with actor, timestamp and previous values.
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
                    overtime #{audit.overtimeEntryId} by {audit.actor} on{' '}
                    {new Date(audit.recordedAt).toLocaleString('en-US')}
                  </span>
                  {(overtimeValue(audit.oldValue) || overtimeValue(audit.newValue)) && (
                    <span className="text-muted-foreground">
                      {overtimeValue(audit.oldValue) ?? 'none'} →{' '}
                      {overtimeValue(audit.newValue) ?? 'none'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <OvertimeDialog
        defaultDate={toDateKey(today)}
        entry={editing}
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
      />
      <ConfirmDialog
        confirmLabel="Delete record"
        description="The balance is recalculated without this record and the change is written to the audit trail."
        onClose={() => setDeleting(undefined)}
        onConfirm={() => {
          if (!deleting) return
          deleteEntry.mutate(deleting.id, {
            onSuccess: () =>
              toast(
                'Overtime deleted',
                `${OVERTIME_KIND_LABELS[deleting.kind]} on ${deleting.effectiveDate}`,
              ),
          })
        }}
        open={Boolean(deleting)}
        title="Delete overtime record?"
      />
    </div>
  )
}
