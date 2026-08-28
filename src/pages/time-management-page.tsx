import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { errorToast, toast } from '@/components/ui/toast-store'
import { dayRange, entriesInRange, totalMinutes } from '@/features/dashboard/metrics'
import { useProjects } from '@/features/projects/project-queries'
import { useWorkSettings } from '@/features/settings/work-settings-queries'
import { TimeEntryList } from '@/features/time-entries/components/time-entry-list'
import { useTimeEntries } from '@/features/time-entries/time-entry-queries'
import { CustomDurationDialog } from '@/features/time-management/components/custom-duration-dialog'
import { QUICK_ADD_MINUTES } from '@/features/time-management/quick-add'
import { useQuickAdd, type QuickAddInput } from '@/features/time-management/use-quick-add'
import { useTicker } from '@/features/timer/use-ticker'
import { useTimer } from '@/features/timer/use-timer'
import { formatDay, formatDuration, fromDateKey, toDateKey } from '@/lib/date'
import { errorMessage } from '@/lib/errors'

function quickAddLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  return minutes === 60 ? '1 hour' : formatDuration(minutes)
}

export function TimeManagementPage() {
  const { data: projects = [] } = useProjects()
  const { data: entries = [] } = useTimeEntries()
  const settings = useWorkSettings()
  const now = useTicker(true)
  const timer = useTimer(now)
  const quickAdd = useQuickAdd()
  const [projectValue, setProjectValue] = useState('')
  const [dateKey, setDateKey] = useState(() => toDateKey(new Date()))
  const [dialogOpen, setDialogOpen] = useState(false)

  const projectId = projectValue ? Number(projectValue) : undefined
  const date = useMemo(() => (dateKey ? fromDateKey(dateKey) : new Date()), [dateKey])
  const dayEntries = useMemo(() => entriesInRange(entries, dayRange(date), now), [date, entries, now])

  async function add(input: QuickAddInput) {
    const project = projects.find((candidate) => candidate.id === input.projectId)
    await quickAdd(input)
    setDateKey(input.dateKey)
    toast('Time added', `${formatDuration(input.minutes)} added to ${project?.name ?? 'project'}`)
  }

  function quickAddTime(minutes: number) {
    if (!projectId) return
    add({ projectId, dateKey: dateKey || toDateKey(new Date()), minutes }).catch((failure) =>
      errorToast('Time not added', errorMessage(failure, 'The time could not be added.')),
    )
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Time Management</h1>
        <p className="text-sm text-muted-foreground">
          Add already worked time to a project without starting the timer.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Quick add</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select a project and add time for {formatDay(date)}.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="block flex-1 space-y-1 text-sm font-medium">
              Project
              <Select
                name="projectId"
                onChange={(event) => setProjectValue(event.target.value)}
                value={projectValue}
              >
                <option value="">Select a project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block space-y-1 text-sm font-medium sm:w-48">
              Date
              <Input
                name="date"
                onChange={(event) => setDateKey(event.target.value)}
                type="date"
                value={dateKey}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_ADD_MINUTES.map((minutes) => (
              <Button
                disabled={!projectId}
                key={minutes}
                onClick={() => quickAddTime(minutes)}
                variant="subtle"
              >
                <Plus className="size-4" />
                {quickAddLabel(minutes)}
              </Button>
            ))}
            <Button
              disabled={!projectId}
              onClick={() => quickAddTime(settings.dailyTargetMinutes)}
              variant="subtle"
            >
              <Plus className="size-4" />
              1 day
            </Button>
            <Button disabled={!projectId} onClick={() => setDialogOpen(true)} variant="outline">
              Custom
            </Button>
          </div>
          {!projectId && (
            <p className="text-sm text-muted-foreground">Select a project to add time.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{formatDay(date)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Total: {formatDuration(totalMinutes(dayEntries, now, dayRange(date)))}
          </p>
        </CardHeader>
        <CardContent>
          <TimeEntryList
            emptyState={<p className="text-sm text-muted-foreground">No time tracked on this day.</p>}
            entries={dayEntries}
            now={now}
            onPause={() => void timer.pause()}
            onPlay={(id) => void timer.switchTo(id)}
            projects={projects}
          />
        </CardContent>
      </Card>

      <CustomDurationDialog
        date={dateKey}
        onAdd={add}
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        projectId={projectId}
      />
    </div>
  )
}
