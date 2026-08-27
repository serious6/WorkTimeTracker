import { useState } from 'react'
import { MoreVertical, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Menu } from '@/components/ui/menu'
import { toast } from '@/components/ui/toast-store'
import { entryMinutes, isRunning } from '@/features/dashboard/metrics'
import type { Project } from '@/features/projects/project-schema'
import { formatStopwatch, formatTimeOfDay } from '@/lib/date'
import { cn } from '@/lib/utils'
import { useDeleteTimeEntry, useUpdateTimeEntryNote } from '../time-entry-queries'
import { DELETED_PROJECT_NAME, type TimeEntry } from '../time-entry-schema'
import { TimeEntryDialog } from './time-entry-dialog'

export function TimeEntryList({
  entries,
  projects,
  now,
  onPlay,
  onPause,
  emptyState,
}: {
  entries: TimeEntry[]
  projects: Project[]
  now: number
  onPlay: (projectId: number) => void
  onPause: () => void
  emptyState?: React.ReactNode
}) {
  const updateNote = useUpdateTimeEntryNote()
  const deleteEntry = useDeleteTimeEntry()
  const [editing, setEditing] = useState<TimeEntry>()
  const [duplicating, setDuplicating] = useState<TimeEntry>()
  const [noting, setNoting] = useState<TimeEntry>()
  const [deleting, setDeleting] = useState<TimeEntry>()

  function projectOf(entry: TimeEntry) {
    return projects.find((project) => project.id === entry.projectId)
  }

  async function saveNote(entry: TimeEntry, note: string) {
    await updateNote.mutateAsync({ id: entry.id, note: note.trim() || null })
    toast('Entry updated', 'Time entry successfully updated')
  }

  if (entries.length === 0 && emptyState) return <>{emptyState}</>

  return (
    <>
      <ul className="divide-y divide-border">
        {entries.map((entry) => {
          const project = projectOf(entry)
          const running = isRunning(entry)
          return (
            <li
              className={cn(
                'flex items-center gap-3 py-2 text-sm',
                running && 'rounded-md bg-primary/10 px-2',
              )}
              key={entry.id}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: project?.color ?? '#64748b' }}
              />
              <span className="min-w-0 flex-1 truncate font-medium">
                {project?.name ?? DELETED_PROJECT_NAME}
                {entry.note && <span className="ml-2 text-xs text-muted-foreground">{entry.note}</span>}
              </span>
              <span className="hidden w-44 shrink-0 text-right text-muted-foreground sm:block">
                {formatTimeOfDay(new Date(entry.startTime))} –{' '}
                {entry.endTime ? formatTimeOfDay(new Date(entry.endTime)) : 'now'}
              </span>
              <span
                className={cn('w-20 shrink-0 text-right tabular-nums', running && 'text-success')}
              >
                {formatStopwatch(entryMinutes(entry, now) * 60_000)}
              </span>
              {running ? (
                <Button aria-label="Pause timer" onClick={onPause} size="icon" variant="subtle">
                  <Pause className="size-4" />
                </Button>
              ) : (
                <Button
                  aria-label={`Start timer for ${project?.name ?? DELETED_PROJECT_NAME}`}
                  disabled={!project}
                  onClick={() => project && onPlay(project.id)}
                  size="icon"
                  variant="subtle"
                >
                  <Play className="size-4" />
                </Button>
              )}
              <Menu
                items={[
                  { label: 'Edit', onSelect: () => setEditing(entry) },
                  ...(running
                    ? []
                    : [{ label: 'Duplicate', onSelect: () => setDuplicating(entry) }]),
                  { label: entry.note ? 'Edit note' : 'Add note', onSelect: () => setNoting(entry) },
                  { label: 'Delete', destructive: true, onSelect: () => setDeleting(entry) },
                ]}
                label={`Actions for ${project?.name ?? DELETED_PROJECT_NAME}`}
                trigger={<MoreVertical className="size-4" />}
              />
            </li>
          )
        })}
      </ul>

      <TimeEntryDialog entry={editing} onClose={() => setEditing(undefined)} open={Boolean(editing)} />
      <TimeEntryDialog
        initialEntry={duplicating}
        onClose={() => setDuplicating(undefined)}
        open={Boolean(duplicating)}
      />

      <Dialog onClose={() => setNoting(undefined)} open={Boolean(noting)} title="Entry note">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const note = new FormData(event.currentTarget).get('note')
            if (noting) void saveNote(noting, typeof note === 'string' ? note : '')
            setNoting(undefined)
          }}
        >
          <label className="block space-y-1 text-sm font-medium">
            Note
            <Input defaultValue={noting?.note ?? ''} name="note" placeholder="What did you work on?" />
          </label>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setNoting(undefined)} variant="outline">
              Cancel
            </Button>
            <Button type="submit">Save note</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        confirmLabel="Delete entry"
        description="This time entry is removed permanently."
        onClose={() => setDeleting(undefined)}
        onConfirm={() => {
          if (!deleting) return
          deleteEntry.mutate(deleting.id, {
            onSuccess: () => toast('Entry deleted', 'Time entry deleted'),
          })
        }}
        open={Boolean(deleting)}
        title="Delete time entry?"
      />
    </>
  )
}
