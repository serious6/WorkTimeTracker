import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { combineDateAndTime, formatStopwatch, toDateKey, toTimeKey } from '@/lib/date'

/**
 * Corrects the start of the running timer for people who began working before
 * they started tracking.
 */
export function StartCorrectionDialog({
  open,
  running,
  now,
  onCorrect,
  onClose,
}: {
  open: boolean
  running: TimeEntry
  now: number
  onCorrect: (startTime: Date) => Promise<boolean>
  onClose: () => void
}) {
  const started = new Date(running.startTime)
  const [dateKey, setDateKey] = useState(() => toDateKey(started))
  const [timeKey, setTimeKey] = useState(() => toTimeKey(started))

  const [openedFor, setOpenedFor] = useState<string | null>(null)
  if (open && openedFor !== running.startTime) {
    setOpenedFor(running.startTime)
    setDateKey(toDateKey(started))
    setTimeKey(toTimeKey(started))
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  const corrected = dateKey && timeKey ? combineDateAndTime(dateKey, timeKey) : null

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!corrected) return
    if (await onCorrect(corrected)) onClose()
  }

  return (
    <Dialog
      description="Move the start of the running timer to the time you actually began working."
      onClose={onClose}
      open={open}
      title="Correct start time"
    >
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1 text-sm font-medium">
          Start date
          <Input
            name="startDate"
            onChange={(event) => setDateKey(event.target.value)}
            type="date"
            value={dateKey}
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Start time
          <Input
            name="startTime"
            onChange={(event) => setTimeKey(event.target.value)}
            type="time"
            value={timeKey}
          />
        </label>
        <p className="text-sm text-muted-foreground">
          Tracked time becomes{' '}
          <span className="tabular-nums">
            {formatStopwatch(corrected ? Math.max(now - corrected.getTime(), 0) : 0)}
          </span>
          .
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={!dateKey || !timeKey} type="submit">
            Save start time
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
