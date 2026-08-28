import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/input'
import { toast } from '@/components/ui/toast-store'
import { useProjects } from '@/features/projects/project-queries'
import { combineDateAndTime, formatDuration, toDateKey, toTimeKey } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { useCreateTimeEntry, useUpdateTimeEntry } from '../time-entry-queries'
import {
  entryToForm,
  formToSaveTimeEntry,
  timeEntryFormSchema,
  type TimeEntry,
} from '../time-entry-schema'

function emptyForm(dateKey: string) {
  const now = new Date()
  return {
    projectId: '',
    date: dateKey,
    startTime: toTimeKey(new Date(now.getTime() - 60 * 60_000)),
    endTime: toTimeKey(now),
    note: '',
  }
}

export function TimeEntryDialog({
  open,
  entry,
  initialEntry,
  date,
  onClose,
}: {
  open: boolean
  entry?: TimeEntry
  initialEntry?: TimeEntry
  date?: Date
  onClose: () => void
}) {
  const { data: projects = [] } = useProjects()
  const createEntry = useCreateTimeEntry()
  const updateEntry = useUpdateTimeEntry()
  const [values, setValues] = useState(() => emptyForm(toDateKey(date ?? new Date())))
  const [error, setError] = useState<string>()

  const [openedFor, setOpenedFor] = useState<number | null>(null)
  const sourceEntry = entry ?? initialEntry
  const openedKey = entry?.id ?? (initialEntry ? -initialEntry.id : 0)
  if (open && openedFor !== openedKey) {
    setOpenedFor(openedKey)
    setError(undefined)
    setValues(
      sourceEntry
        ? {
            ...entryToForm(sourceEntry),
            projectId: `${sourceEntry.projectId ?? ''}`,
            note: sourceEntry.note ?? '',
          }
        : emptyForm(toDateKey(date ?? new Date())),
    )
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  const durationMinutes =
    values.date && values.startTime && values.endTime
      ? (combineDateAndTime(values.date, values.endTime).getTime() -
          combineDateAndTime(values.date, values.startTime).getTime()) /
        60_000
      : 0

  function update(field: keyof ReturnType<typeof emptyForm>, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = timeEntryFormSchema.safeParse({
      ...values,
      projectId: values.projectId || undefined,
      note: values.note || undefined,
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message)
      return
    }

    const input = formToSaveTimeEntry(result.data)
    try {
      if (entry) {
        await updateEntry.mutateAsync({ id: entry.id, input })
        toast('Entry updated', 'Time entry successfully updated')
      } else {
        await createEntry.mutateAsync(input)
        toast('Entry added', `${formatDuration(durationMinutes)} added`)
      }
      onClose()
    } catch (failure) {
      setError(errorMessage(failure, 'The entry could not be saved.'))
    }
  }

  return (
    <Dialog
      onClose={onClose}
      open={open}
      title={entry ? 'Edit time entry' : initialEntry ? 'Duplicate time entry' : 'Add time entry'}
    >
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1 text-sm font-medium">
          Project
          <Select
            name="projectId"
            onChange={(event) => update('projectId', event.target.value)}
            value={values.projectId}
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Date
          <Input
            name="date"
            onChange={(event) => update('date', event.target.value)}
            type="date"
            value={values.date}
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block space-y-1 text-sm font-medium">
            Start time
            <Input
              name="startTime"
              onChange={(event) => update('startTime', event.target.value)}
              type="time"
              value={values.startTime}
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            End time
            <Input
              name="endTime"
              onChange={(event) => update('endTime', event.target.value)}
              type="time"
              value={values.endTime}
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Duration
            <Input name="duration" readOnly value={formatDuration(Math.max(0, durationMinutes))} />
          </label>
        </div>
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
          <Button type="submit">{entry ? 'Save entry' : 'Add entry'}</Button>
        </div>
      </form>
    </Dialog>
  )
}
