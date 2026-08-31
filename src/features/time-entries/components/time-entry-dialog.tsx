import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { toast } from '@/components/ui/toast-store'
import { useProjects } from '@/features/projects/project-queries'
import { useWorkItems } from '@/features/work-items/work-item-queries'
import { combineDateAndTime, formatDuration, toDateKey, toTimeKey } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { useCreateTimeEntry, useUpdateTimeEntry } from '../time-entry-queries'
import {
  BREAK_LABEL,
  entryToForm,
  formToSaveTimeEntry,
  parseTimeOfDay,
  timeEntryFormSchema,
  type TimeEntry,
} from '../time-entry-schema'

type FieldError = { field: string | null; message: string }

function emptyForm(dateKey: string) {
  const now = new Date()
  return {
    entryType: 'work',
    projectId: '',
    workItemId: '',
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
  const { data: workItems = [] } = useWorkItems()
  const activeWorkItems = workItems.filter((workItem) => workItem.active)
  const createEntry = useCreateTimeEntry()
  const updateEntry = useUpdateTimeEntry()
  const [values, setValues] = useState(() => emptyForm(toDateKey(date ?? new Date())))
  const [error, setError] = useState<FieldError>()

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
            workItemId: `${sourceEntry.workItemId ?? ''}`,
            note: sourceEntry.note ?? '',
          }
        : emptyForm(toDateKey(date ?? new Date())),
    )
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  const parsedStartTime = parseTimeOfDay(values.startTime)
  const parsedEndTime = parseTimeOfDay(values.endTime)
  const durationMinutes =
    values.date && parsedStartTime && parsedEndTime
      ? (combineDateAndTime(values.date, parsedEndTime).getTime() -
          combineDateAndTime(values.date, parsedStartTime).getTime()) /
        60_000
      : 0

  const isBreakEntry = values.entryType === 'break'

  function update(field: keyof ReturnType<typeof emptyForm>, value: string) {
    setValues((current) => {
      if (field === 'entryType' && value === 'break') {
        return { ...current, entryType: value, projectId: '', workItemId: '' }
      }
      if (field === 'projectId' && value) {
        return { ...current, projectId: value, workItemId: '' }
      }
      if (field === 'workItemId' && value) {
        return { ...current, workItemId: value, projectId: '' }
      }
      return { ...current, [field]: value }
    })
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = timeEntryFormSchema.safeParse({
      ...values,
      projectId: values.projectId || undefined,
      workItemId: values.workItemId || undefined,
      note: values.note || undefined,
    })
    if (!result.success) {
      const issue = result.error.issues[0]
      setError({ field: typeof issue?.path[0] === 'string' ? issue.path[0] : null, message: issue?.message ?? '' })
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
      setError({ field: null, message: errorMessage(failure, 'The entry could not be saved.') })
    }
  }

  function fieldError(field: string): string | undefined {
    return error?.field === field ? error.message : undefined
  }

  return (
    <Dialog
      onClose={onClose}
      open={open}
      title={entry ? 'Edit time entry' : initialEntry ? 'Duplicate time entry' : 'Add time entry'}
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field error={fieldError('entryType')} label="Entry type">
          <Select
            name="entryType"
            onChange={(event) => update('entryType', event.target.value)}
            value={values.entryType}
          >
            <option value="work">Work</option>
            <option value="break">{BREAK_LABEL}</option>
          </Select>
        </Field>
        <Field error={fieldError('projectId')} label="Project">
          <Select
            disabled={isBreakEntry}
            name="projectId"
            onChange={(event) => update('projectId', event.target.value)}
            value={values.projectId}
          >
            <option value="">{isBreakEntry ? 'No project' : 'Select a project'}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field error={fieldError('workItemId')} label="Work item">
          <Select
            disabled={isBreakEntry}
            name="workItemId"
            onChange={(event) => update('workItemId', event.target.value)}
            value={values.workItemId}
          >
            <option value="">No work item</option>
            {activeWorkItems.map((workItem) => (
              <option key={workItem.id} value={workItem.id}>
                {workItem.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field error={fieldError('date')} label="Date">
          <Input
            name="date"
            onChange={(event) => update('date', event.target.value)}
            type="date"
            value={values.date}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field error={fieldError('startTime')} label="Start time">
            <Input
              name="startTime"
              onBlur={(event) => {
                const parsed = parseTimeOfDay(event.target.value)
                if (parsed) update('startTime', parsed)
              }}
              onChange={(event) => update('startTime', event.target.value)}
              placeholder="09:00"
              type="text"
              value={values.startTime}
            />
          </Field>
          <Field error={fieldError('endTime')} label="End time">
            <Input
              name="endTime"
              onBlur={(event) => {
                const parsed = parseTimeOfDay(event.target.value)
                if (parsed) update('endTime', parsed)
              }}
              onChange={(event) => update('endTime', event.target.value)}
              placeholder="17:30"
              type="text"
              value={values.endTime}
            />
          </Field>
          <Field label="Duration">
            <Input name="duration" readOnly value={formatDuration(Math.max(0, durationMinutes))} />
          </Field>
        </div>
        <Field error={fieldError('note')} label="Note">
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
          <Button disabled={createEntry.isPending || updateEntry.isPending} type="submit">
            {createEntry.isPending || updateEntry.isPending
              ? 'Saving…'
              : entry
                ? 'Save entry'
                : 'Add entry'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
