import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toast-store'
import { AbsenceDialog } from '@/features/absences/components/absence-dialog'
import { absenceIndex } from '@/features/absences/absence-index'
import { useAbsenceAudits, useAbsences, useDeleteAbsence } from '@/features/absences/absence-queries'
import { ABSENCE_TYPE_LABELS, type Absence } from '@/features/absences/absence-schema'
import { targetMinutesForDay } from '@/features/settings/work-schedule'
import { useWorkSettings } from '@/features/settings/work-settings-queries'
import { formatDay, formatDuration, fromDateKey, toDateKey } from '@/lib/date'

function absenceValue(value: string | null): string | null {
  if (!value) return null
  try {
    const absence = JSON.parse(value) as { date: string; type: keyof typeof ABSENCE_TYPE_LABELS }
    return `${ABSENCE_TYPE_LABELS[absence.type]} on ${absence.date}`
  } catch {
    return null
  }
}

export function AbsencesPage() {
  const settings = useWorkSettings()
  const { data: absences = [] } = useAbsences()
  const { data: audits = [] } = useAbsenceAudits()
  const deleteAbsence = useDeleteAbsence()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Absence>()
  const [deleting, setDeleting] = useState<Absence>()

  const index = absenceIndex(absences)
  const newestFirst = [...absences].sort((left, right) => right.date.localeCompare(left.date))
  const neutralisedMinutes = absences.reduce(
    (total, absence) =>
      total +
      (targetMinutesForDay(settings, fromDateKey(absence.date)) -
        targetMinutesForDay(settings, fromDateKey(absence.date), index)),
    0,
  )

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Absences</h1>
          <p className="text-sm text-muted-foreground">
            Vacation, sick leave, unpaid leave and half days. A marked working day loses its target,
            so the overtime balance stays correct.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(undefined)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" />
          Mark absence
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>All absences</CardTitle>
          <p className="text-sm text-muted-foreground">
            {absences.length} day{absences.length === 1 ? '' : 's'} recorded,{' '}
            {formatDuration(neutralisedMinutes)} of target neutralised.
          </p>
        </CardHeader>
        <CardContent>
          {absences.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No absences yet. Mark a day or a range so it stops counting as missing time.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {newestFirst.map((absence) => {
                const date = fromDateKey(absence.date)
                const target = targetMinutesForDay(settings, date, index)
                const full = targetMinutesForDay(settings, date)
                return (
                  <li className="flex items-center gap-3 py-3 text-sm" key={absence.id}>
                    <span className="min-w-0 flex-1 truncate font-medium">{formatDay(date)}</span>
                    <span className="text-muted-foreground">
                      {ABSENCE_TYPE_LABELS[absence.type]}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {full === 0
                        ? 'no working day'
                        : `target ${formatDuration(full)} → ${formatDuration(target)}`}
                    </span>
                    <Button
                      aria-label={`Edit absence on ${absence.date}`}
                      onClick={() => {
                        setEditing(absence)
                        setDialogOpen(true)
                      }}
                      size="icon"
                      variant="ghost"
                    >
                      <Pencil aria-hidden className="size-4" />
                    </Button>
                    <Button
                      aria-label={`Delete absence on ${absence.date}`}
                      className="ml-2 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleting(absence)}
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Absence audit trail</CardTitle>
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
                    absence #{audit.absenceId} by {audit.actor} on{' '}
                    {new Date(audit.recordedAt).toLocaleString('en-US')}
                  </span>
                  {(absenceValue(audit.oldValue) || absenceValue(audit.newValue)) && (
                    <span className="text-muted-foreground">
                      {absenceValue(audit.oldValue) ?? 'none'} → {absenceValue(audit.newValue) ?? 'none'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AbsenceDialog
        absence={editing}
        defaultDate={toDateKey(new Date())}
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
      />
      <ConfirmDialog
        confirmLabel="Delete absence"
        description="The target of the day is charged again and the change is written to the audit trail."
        onClose={() => setDeleting(undefined)}
        onConfirm={() => {
          if (!deleting) return
          deleteAbsence.mutate(deleting.id, {
            onSuccess: () =>
              toast('Absence deleted', `${ABSENCE_TYPE_LABELS[deleting.type]} on ${deleting.date}`),
          })
        }}
        open={Boolean(deleting)}
        title="Delete absence?"
      />
    </div>
  )
}
