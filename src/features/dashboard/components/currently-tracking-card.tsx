import { useState } from 'react'
import { Pause, Play, Square, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ProjectPicker } from '@/features/projects/components/project-picker'
import type { Project } from '@/features/projects/project-schema'
import { DELETED_PROJECT_NAME } from '@/features/time-entries/time-entry-schema'
import type { useTimer } from '@/features/timer/use-timer'
import { formatStopwatch } from '@/lib/date'

export function CurrentlyTrackingCard({
  timer,
  projects,
  pickerOpen,
  onPickerOpenChange,
  onCreateProject,
}: {
  timer: ReturnType<typeof useTimer>
  projects: Project[]
  pickerOpen: boolean
  onPickerOpenChange: (open: boolean) => void
  onCreateProject: () => void
}) {
  const { status, start, stop, pause, resume, switchTo, setNote } = timer
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [note, setNoteValue] = useState('')
  const active = Boolean(status.running) || status.paused
  const project = projects.find((candidate) => candidate.id === status.projectId)

  const [noteSource, setNoteSource] = useState(status.running?.note ?? null)
  if (noteSource !== (status.running?.note ?? null)) {
    setNoteSource(status.running?.note ?? null)
    setNoteValue(status.running?.note ?? '')
  }

  if (!active) {
    return (
      <Card aria-label="Currently Tracking" className="p-5" role="region">
        <p className="text-sm font-medium text-primary">Currently Tracking</p>
        {projects.length === 0 ? (
          <div className="flex flex-col items-start gap-3 pt-3">
            <p className="text-sm text-muted-foreground">Create your first project to start tracking.</p>
            <Button onClick={onCreateProject}>Create project</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center">
            <ProjectPicker
              onCreate={onCreateProject}
              onOpenChange={onPickerOpenChange}
              onSelect={setSelectedProjectId}
              open={pickerOpen}
              value={selectedProjectId}
            />
            <Button
              disabled={selectedProjectId === null}
              onClick={() => selectedProjectId !== null && void start(selectedProjectId)}
            >
              <Play className="size-4" />
              Start timer
            </Button>
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card aria-label="Currently Tracking" className="p-5" role="region">
      <p className="text-sm font-medium text-primary">Currently Tracking</p>
      <div className="flex flex-col gap-4 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: project?.color ?? '#64748b' }}
          />
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold">{project?.name ?? DELETED_PROJECT_NAME}</p>
            <p className="text-sm text-muted-foreground">
              {status.paused ? 'Paused' : (project?.description ?? 'Tracking')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <output
            aria-label="Elapsed time"
            className="text-2xl font-semibold tabular-nums text-success"
          >
            {formatStopwatch(status.elapsedMs)}
          </output>
          <Button aria-label="Stop timer" onClick={() => void stop()} variant="destructive">
            <Square className="size-4" />
          </Button>
          {status.paused ? (
            <Button aria-label="Resume timer" onClick={() => void resume()} variant="subtle">
              <Play className="size-4" />
            </Button>
          ) : (
            <Button aria-label="Pause timer" onClick={() => void pause()} variant="subtle">
              <Pause className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <Tag className="size-4 shrink-0 text-muted-foreground" />
          <Input
            aria-label="Add a note"
            className="border-0 px-0 focus-visible:ring-0"
            onBlur={() => void setNote(note)}
            onChange={(event) => setNoteValue(event.target.value)}
            placeholder="Add a note..."
            value={note}
          />
        </div>
        <ProjectPicker
          onCreate={onCreateProject}
          onOpenChange={onPickerOpenChange}
          onSelect={(projectId) => {
            if (projectId !== status.projectId) void switchTo(projectId)
          }}
          open={pickerOpen}
          value={status.projectId}
        />
      </div>
    </Card>
  )
}
