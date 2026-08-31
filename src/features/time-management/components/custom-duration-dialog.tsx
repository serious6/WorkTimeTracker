import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { formatDuration, toDateKey } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { parseDurationMinutes } from '../quick-add'

export const DURATION_ERROR_MESSAGE = 'Enter a duration such as 2h 45m, 90m or 1.5h'

type FieldError = { field: 'duration' | 'date' | null; message: string }

export function CustomDurationDialog({
  open,
  projectId,
  date,
  onClose,
  onAdd,
}: {
  open: boolean
  projectId: number | undefined
  date: string
  onClose: () => void
  onAdd: (input: { projectId: number; dateKey: string; minutes: number; note?: string }) => Promise<void>
}) {
  const [values, setValues] = useState({ duration: '', date, note: '' })
  const [error, setError] = useState<FieldError>()
  const [wasOpen, setWasOpen] = useState(false)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValues({ duration: '', date: date || toDateKey(new Date()), note: '' })
      setError(undefined)
    }
  }

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectId) {
      setError({ field: null, message: 'Project is required' })
      return
    }
    const minutes = parseDurationMinutes(values.duration)
    if (minutes === null) {
      setError({ field: 'duration', message: DURATION_ERROR_MESSAGE })
      return
    }
    if (!values.date) {
      setError({ field: 'date', message: 'Date is required' })
      return
    }
    try {
      await onAdd({ projectId, dateKey: values.date, minutes, note: values.note })
      onClose()
    } catch (failure) {
      setError({ field: null, message: errorMessage(failure, 'The time could not be added.') })
    }
  }

  const preview = parseDurationMinutes(values.duration)

  return (
    <Dialog onClose={onClose} open={open} title="Add custom time">
      <form className="space-y-4" onSubmit={submit}>
        <Field error={error?.field === 'duration' ? error.message : undefined} label="Duration">
          <Input
            name="duration"
            onChange={(event) => update('duration', event.target.value)}
            placeholder="2h 45m"
            value={values.duration}
          />
        </Field>
        <p className="text-sm text-muted-foreground">
          {preview === null ? 'Accepts formats like 2h 45m, 90m or 1.5h.' : `Adds ${formatDuration(preview)}.`}
        </p>
        <Field error={error?.field === 'date' ? error.message : undefined} label="Date">
          <Input
            name="date"
            onChange={(event) => update('date', event.target.value)}
            type="date"
            value={values.date}
          />
        </Field>
        <Field label="Note">
          <Input
            name="note"
            onChange={(event) => update('note', event.target.value)}
            placeholder="Optional"
            value={values.note}
          />
        </Field>
        {error?.field === null && (
          <p className="text-sm text-destructive" role="alert">
            {error.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button type="submit">Add time</Button>
        </div>
      </form>
    </Dialog>
  )
}
