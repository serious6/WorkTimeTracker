import { useState } from 'react'
import { Clock, Pause, Play, Square, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { OverdueBudgetWarning } from '@/features/budgets/components/overdue-budget-warning'
import { ProjectPicker } from '@/features/projects/components/project-picker'
import type { ProjectBudget } from '@/features/budgets/budget-schema'
import type { Project } from '@/features/projects/project-schema'
import { DELETED_PROJECT_NAME, type TimeEntry } from '@/features/time-entries/time-entry-schema'
import { StartCorrectionDialog } from '@/features/timer/components/start-correction-dialog'
import type { useTimer } from '@/features/timer/use-timer'
import { formatStopwatch } from '@/lib/date'
import { cn } from '@/lib/utils'

export function CurrentlyTrackingCard({
  timer,
  projects,
  budgets = [],
  entries = [],
  now,
  pickerOpen,
  onPickerOpenChange,
  onCreateProject,
}: {
  timer: ReturnType<typeof useTimer>
  projects: Project[]
  /** Budgets and entries only feed the overdue warning; both may be empty. */
  budgets?: ProjectBudget[]
  entries?: TimeEntry[]
  now: number
  pickerOpen: boolean
  onPickerOpenChange: (open: boolean) => void
  onCreateProject: () => void
}) {
  const { status, isPending, start, stop, pause, resume, switchTo, correctStart, setNote } = timer
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [note, setNoteValue] = useState('')
  const active = Boolean(status.running) || status.paused
  const project = projects.find((candidate) => candidate.id === status.projectId)
  /** The running state is named, not only coloured, so it does not rely on colour alone. */
  const state = status.paused ? 'Paused' : 'Running'

  const [noteSource, setNoteSource] = useState(status.running?.note ?? null)
  if (noteSource !== (status.running?.note ?? null)) {
    setNoteSource(status.running?.note ?? null)
    setNoteValue(status.running?.note ?? '')
  }

  if (!active) {
    return (
      <Card aria-label="Currently Tracking" className="p-5" role="region">
        <h2 className="text-sm font-medium text-primary">Currently Tracking</h2>
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
              disabled={selectedProjectId === null || isPending}
              onClick={() => selectedProjectId !== null && void start(selectedProjectId)}
              size="lg"
            >
              <Play className="size-4" />
              {isPending ? 'Starting…' : 'Start timer'}
            </Button>
          </div>
        )}
        <OverdueBudgetWarning
          budgets={budgets}
          entries={entries}
          now={now}
          projectId={selectedProjectId}
        />
      </Card>
    )
  }

  return (
    <Card
      aria-label="Currently Tracking"
      className={cn('p-5', status.running && 'border-success/60')}
      role="region"
    >
      <h2 className="text-sm font-medium text-primary">Currently Tracking</h2>
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
              <span className="font-medium">{state}</span>
              {project?.description ? <span> · {project.description}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isPending && (
            <span className="text-sm text-muted-foreground" role="status">
              Updating timer…
            </span>
          )}
          <output
            aria-label="Elapsed time"
            className="text-2xl font-semibold tabular-nums text-success"
          >
            {formatStopwatch(status.elapsedMs)}
          </output>
          {status.running && (
            <Button
              aria-label="Correct start time"
              disabled={isPending}
              onClick={() => setCorrectionOpen(true)}
              variant="subtle"
            >
              <Clock className="size-4" />
            </Button>
          )}
          <Button
            aria-label="Stop timer"
            disabled={isPending}
            onClick={() => void stop()}
            size="lg"
            variant="destructive"
          >
            <Square className="size-4" />
          </Button>
          {status.paused ? (
            <Button
              aria-label="Resume timer"
              disabled={isPending}
              onClick={() => void resume()}
              variant="subtle"
            >
              <Play className="size-4" />
            </Button>
          ) : (
            <Button
              aria-label="Pause timer"
              disabled={isPending}
              onClick={() => void pause()}
              variant="subtle"
            >
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
            disabled={isPending}
            onBlur={() => void setNote(note)}
            onChange={(event) => setNoteValue(event.target.value)}
            placeholder="Add a note..."
            value={note}
          />
        </div>
        <ProjectPicker
          onCreate={onCreateProject}
          onOpenChange={(open) => !isPending && onPickerOpenChange(open)}
          onSelect={(projectId) => {
            if (projectId !== status.projectId) void switchTo(projectId)
          }}
          open={pickerOpen}
          value={status.projectId}
        />
      </div>
      <OverdueBudgetWarning
        budgets={budgets}
        entries={entries}
        now={now}
        projectId={status.projectId}
      />

      {status.running && (
        <StartCorrectionDialog
          now={now}
          onClose={() => setCorrectionOpen(false)}
          onCorrect={correctStart}
          open={correctionOpen}
          running={status.running}
        />
      )}
    </Card>
  )
}
