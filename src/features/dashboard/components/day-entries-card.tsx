import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Project } from '@/features/projects/project-schema'
import { TimeEntryList } from '@/features/time-entries/components/time-entry-list'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { formatDuration } from '@/lib/date'
import { totalMinutes } from '../metrics'

export function DayEntriesCard({
  title,
  entries,
  projects,
  now,
  onPlay,
  onPause,
  onAddEntry,
  onStartTimer,
}: {
  title: string
  entries: TimeEntry[]
  projects: Project[]
  now: number
  onPlay: (projectId: number) => void
  onPause: () => void
  onAddEntry: () => void
  onStartTimer: () => void
}) {
  return (
    <Card aria-label={title} role="region">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Total: {formatDuration(totalMinutes(entries, now))}
        </p>
      </CardHeader>
      <CardContent>
        <TimeEntryList
          emptyState={
            <div className="flex flex-col items-start gap-3 py-6">
              <p className="text-sm text-muted-foreground">No time tracked today</p>
              <div className="flex gap-2">
                <Button onClick={onStartTimer}>Start timer</Button>
                <Button onClick={onAddEntry} variant="outline">
                  Add entry
                </Button>
              </div>
            </div>
          }
          entries={entries}
          now={now}
          onPause={onPause}
          onPlay={onPlay}
          projects={projects}
        />
        <div className="pt-3">
          <Button onClick={onAddEntry} variant="ghost">
            <Plus className="size-4" />
            Add time entry
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
