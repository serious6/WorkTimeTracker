import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatDuration, toDateKey } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { parseDurationMinutes } from '../quick-add'

export const DURATION_ERROR_MESSAGE = 'Enter a duration such as 2h 45m, 90m or 1.5h'

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
  const [error, setError] = useState<string>()
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
      setError('Project is required')
      return
    }
    const minutes = parseDurationMinutes(values.duration)
    if (minutes === null) {
      setError(DURATION_ERROR_MESSAGE)
      return
    }
    if (!values.date) {
      setError('Date is required')
      return
    }
    try {
      await onAdd({ projectId, dateKey: values.date, minutes, note: values.note })
      onClose()
    } catch (failure) {
      setError(errorMessage(failure, 'The time could not be added.'))
    }
  }

  const preview = parseDurationMinutes(values.duration)

  return (
    <Dialog onClose={onClose} open={open} title="Add custom time">
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1 text-sm font-medium">
          Duration
          <Input
            name="duration"
            onChange={(event) => update('duration', event.target.value)}
            placeholder="2h 45m"
            value={values.duration}
          />
        </label>
        <p className="text-sm text-muted-foreground">
          {preview === null ? 'Accepts formats like 2h 45m, 90m or 1.5h.' : `Adds ${formatDuration(preview)}.`}
        </p>
        <label className="block space-y-1 text-sm font-medium">
          Date
          <Input
            name="date"
            onChange={(event) => update('date', event.target.value)}
            type="date"
            value={values.date}
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Note
          <Input
            name="note"
            onChange={(event) => update('note', event.target.value)}
            placeholder="Optional"
            value={values.note}
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
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
