import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigationStore } from '@/app/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { dayRange, entriesInRange, totalMinutes } from '@/features/dashboard/metrics'
import { useProjects } from '@/features/projects/project-queries'
import { TimeEntryDialog } from '@/features/time-entries/components/time-entry-dialog'
import { TimeEntryList } from '@/features/time-entries/components/time-entry-list'
import { useTimeEntries } from '@/features/time-entries/time-entry-queries'
import { useTicker } from '@/features/timer/use-ticker'
import { useTimer } from '@/features/timer/use-timer'
import { formatDay, formatDuration } from '@/lib/date'

export function TimeEntriesPage() {
  const projectFilter = useNavigationStore((state) => state.projectFilter)
  const dateFilter = useNavigationStore((state) => state.dateFilter)
  const { data: entries = [] } = useTimeEntries()
  const { data: projects = [] } = useProjects()
  const now = useTicker(true)
  const timer = useTimer(now)
  const [filterState, setFilterState] = useState({
    projectFilter,
    value: projectFilter ? `${projectFilter}` : '',
  })
  const [dialogOpen, setDialogOpen] = useState(false)

  if (filterState.projectFilter !== projectFilter) {
    setFilterState({ projectFilter, value: projectFilter ? `${projectFilter}` : '' })
  }

  const filter = filterState.value

  const days = useMemo(() => {
    const projectEntries = filter
      ? entries.filter((entry) => entry.projectId === Number(filter))
      : entries
    const filtered = dateFilter ? entriesInRange(projectEntries, dayRange(dateFilter), now) : projectEntries
    const grouped = new Map<string, typeof entries>()
    for (const entry of [...filtered].sort((left, right) =>
      right.startTime.localeCompare(left.startTime),
    )) {
      const day = (dateFilter ?? new Date(entry.startTime)).toDateString()
      grouped.set(day, [...(grouped.get(day) ?? []), entry])
    }
    return [...grouped]
  }, [dateFilter, entries, filter, now])

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Time Entries</h1>
          <p className="text-sm text-muted-foreground">
            {dateFilter ? `Tracked time for ${formatDay(dateFilter)}.` : 'All tracked time, newest day first.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            aria-label="Filter by project"
            className="w-48"
            onChange={(event) =>
              setFilterState({ projectFilter: null, value: event.target.value })
            }
            value={filter}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Add time entry
          </Button>
        </div>
      </header>

      {days.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">No time entries yet.</p>
          </CardContent>
        </Card>
      ) : (
        days.map(([day, dayEntries]) => (
          <Card key={day}>
            <CardHeader>
              <CardTitle>{formatDay(new Date(day))}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Total:{' '}
                {formatDuration(
                  totalMinutes(dayEntries, now, dateFilter ? dayRange(dateFilter) : undefined),
                )}
              </p>
            </CardHeader>
            <CardContent>
              <TimeEntryList
                entries={[...dayEntries].sort((left, right) =>
                  left.startTime.localeCompare(right.startTime),
                )}
                now={now}
                onPause={() => void timer.pause()}
                onPlay={(projectId) => void timer.switchTo(projectId)}
                projects={projects}
              />
            </CardContent>
          </Card>
        ))
      )}

      <TimeEntryDialog onClose={() => setDialogOpen(false)} open={dialogOpen} />
    </div>
  )
}
