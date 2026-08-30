import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/input'
import { toast } from '@/components/ui/toast-store'
import { errorMessage } from '@/lib/errors'
import {
  useAbsences,
  useCreateAbsence,
  useDeleteAbsence,
  useUpdateAbsence,
} from '../absence-queries'
import {
  ABSENCE_TYPES,
  ABSENCE_TYPE_LABELS,
  absenceDaysOfForm,
  absenceFormSchema,
  type Absence,
} from '../absence-schema'

/**
 * Marks a single day or a range as an absence. Days that already carry an
 * absence are only replaced after an explicit confirmation, so a day never ends
 * up with two of them.
 */
export function AbsenceDialog({
  open,
  absence,
  defaultDate,
  onClose,
}: {
  open: boolean
  absence?: Absence
  defaultDate?: string
  onClose: () => void
}) {
  const { data: absences = [] } = useAbsences()
  const createAbsence = useCreateAbsence()
  const updateAbsence = useUpdateAbsence()
  const deleteAbsence = useDeleteAbsence()
  const [error, setError] = useState<string>()
  const [replacing, setReplacing] = useState<Absence[]>()
  const [confirmed, setConfirmed] = useState(false)
  const [openedFor, setOpenedFor] = useState<number | null>(null)

  const openedKey = absence?.id ?? 0
  if (open && openedFor !== openedKey) {
    setOpenedFor(openedKey)
    setError(undefined)
    setReplacing(undefined)
    setConfirmed(false)
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const startDate = form.get('startDate')
    const result = absenceFormSchema.safeParse({
      type: form.get('type'),
      startDate,
      endDate: absence ? startDate : form.get('endDate') || startDate,
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message)
      return
    }

    const days = absenceDaysOfForm(result.data)
    const dates = new Set(days.map((day) => day.date))
    const occupied = absences.filter(
      (recorded) => dates.has(recorded.date) && recorded.id !== absence?.id,
    )
    if (occupied.length > 0 && !confirmed) {
      setError(undefined)
      setReplacing(occupied)
      return
    }

    const occupiedByDate = new Map(occupied.map((recorded) => [recorded.date, recorded] as const))
    try {
      if (absence) {
        // A single day is edited in place; a day taken by another absence is
        // freed first, so the replacement never creates a second record.
        for (const taken of occupied) await deleteAbsence.mutateAsync(taken.id)
        await updateAbsence.mutateAsync({ id: absence.id, input: days[0] })
      } else {
        for (const day of days) {
          const taken = occupiedByDate.get(day.date)
          if (taken) await updateAbsence.mutateAsync({ id: taken.id, input: day })
          else await createAbsence.mutateAsync(day)
        }
      }
      toast(
        absence ? 'Absence updated' : 'Absence saved',
        `${ABSENCE_TYPE_LABELS[result.data.type]}, ${days.length} day${days.length === 1 ? '' : 's'}`,
      )
      setError(undefined)
      setReplacing(undefined)
      setConfirmed(false)
      onClose()
    } catch (failure) {
      setReplacing(undefined)
      setConfirmed(false)
      setError(errorMessage(failure, 'The absence could not be saved.'))
    }
  }

  return (
    <Dialog onClose={onClose} open={open} title={absence ? 'Edit absence' : 'Mark absence'}>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1 text-sm font-medium">
          Absence type
          <Select defaultValue={absence?.type ?? ''} name="type">
            <option disabled value="">
              Select an absence type
            </option>
            {ABSENCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {ABSENCE_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1 text-sm font-medium">
            {absence ? 'Day' : 'First day'}
            <Input defaultValue={absence?.date ?? defaultDate ?? ''} name="startDate" type="date" />
          </label>
          {!absence && (
            <label className="block space-y-1 text-sm font-medium">
              Last day
              <Input defaultValue={defaultDate ?? ''} name="endDate" type="date" />
            </label>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Only configured working days lose their target. A half day keeps half of it.
        </p>
        {replacing && !confirmed && (
          <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <p>
              {replacing.length} day{replacing.length === 1 ? '' : 's'} already{' '}
              {replacing.length === 1 ? 'carries' : 'carry'} an absence. Saving replaces{' '}
              {replacing.length === 1 ? 'it' : 'them'}.
            </p>
            <Button onClick={() => setConfirmed(true)} size="sm" type="button" variant="outline">
              Replace existing absences
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button type="submit">{absence ? 'Save absence' : 'Mark absence'}</Button>
        </div>
      </form>
    </Dialog>
  )
}
