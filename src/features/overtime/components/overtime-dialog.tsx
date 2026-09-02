import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Select, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toast-store'
import { errorMessage } from '@/lib/errors'
import { formatSignedDuration } from '@/lib/date'
import { useCreateOvertimeEntry, useUpdateOvertimeEntry } from '../overtime-queries'
import {
  OVERTIME_KINDS,
  OVERTIME_KIND_LABELS,
  formToSaveOvertimeEntry,
  overtimeFormSchema,
  parseOvertimeMinutes,
  type OvertimeEntry,
  type OvertimeKind,
} from '../overtime-schema'

const KIND_HINTS: Record<OvertimeKind, string> = {
  opening: 'Balance carried over from before this application was used.',
  balance: 'Sets the balance of that day to this value.',
  adjustment: 'Adds this value on top of the balance.',
}

/**
 * Enters or corrects an explicit overtime record. Validation runs before the
 * write, so an invalid value is reported inline and nothing is saved.
 */
export function OvertimeDialog({
  open,
  entry,
  defaultDate,
  onClose,
}: {
  open: boolean
  entry?: OvertimeEntry
  defaultDate: string
  onClose: () => void
}) {
  const createEntry = useCreateOvertimeEntry()
  const updateEntry = useUpdateOvertimeEntry()
  const [error, setError] = useState<string>()
  const [value, setValue] = useState('')
  const [kind, setKind] = useState<OvertimeKind>('balance')
  const [openedFor, setOpenedFor] = useState<number | null>(null)

  const openedKey = entry?.id ?? 0
  if (open && openedFor !== openedKey) {
    setOpenedFor(openedKey)
    setError(undefined)
    setValue(entry ? formatSignedDuration(entry.minutes) : '')
    setKind(entry?.kind ?? 'balance')
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  const preview = parseOvertimeMinutes(value)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = overtimeFormSchema.safeParse({
      effectiveDate: form.get('effectiveDate'),
      kind: form.get('kind'),
      value: form.get('value'),
      note: form.get('note') ?? '',
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message)
      return
    }

    const input = formToSaveOvertimeEntry(result.data)
    try {
      if (entry) await updateEntry.mutateAsync({ id: entry.id, input })
      else await createEntry.mutateAsync(input)
      toast(
        entry ? 'Overtime updated' : 'Overtime saved',
        `${OVERTIME_KIND_LABELS[input.kind]} of ${formatSignedDuration(input.minutes)} on ${input.effectiveDate}`,
      )
      setError(undefined)
      onClose()
    } catch (failure) {
      setError(errorMessage(failure, 'The overtime record could not be saved.'))
    }
  }

  return (
    <Dialog onClose={onClose} open={open} title={entry ? 'Edit overtime' : 'Set overtime'}>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1 text-sm font-medium">
            Effective date
            <Input
              defaultValue={entry?.effectiveDate ?? defaultDate}
              name="effectiveDate"
              type="date"
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Overtime type
            <Select
              name="kind"
              onChange={(event) => setKind(event.target.value as OvertimeKind)}
              value={kind}
            >
              {OVERTIME_KINDS.map((option) => (
                <option key={option} value={option}>
                  {OVERTIME_KIND_LABELS[option]}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <label className="block space-y-1 text-sm font-medium">
          Overtime
          <Input
            name="value"
            onChange={(event) => setValue(event.target.value)}
            placeholder="e.g. 2h 30m, 90m or -1h 15m"
            value={value}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          {preview === null
            ? 'Hours and minutes, a leading minus records undertime.'
            : `Counts as ${formatSignedDuration(preview)}.`}{' '}
          {KIND_HINTS[kind]}
        </p>
        <label className="block space-y-1 text-sm font-medium">
          Note (optional)
          <Textarea
            defaultValue={entry?.note ?? ''}
            maxLength={500}
            name="note"
            placeholder="Why the balance was corrected"
          />
        </label>
        {entry?.origin === 'automatic' && (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            Saving marks this record as manual, so the automatic calculation keeps it.
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button type="submit">{entry ? 'Save overtime' : 'Set overtime'}</Button>
        </div>
      </form>
    </Dialog>
  )
}
