import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Project } from '@/features/projects/project-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { formatDuration } from '@/lib/date'
import { recentProjects } from '../metrics'

export function RecentProjectsCard({
  entries,
  projects,
  now,
  onSelectProject,
  onViewAll,
}: {
  entries: TimeEntry[]
  projects: Project[]
  now: number
  onSelectProject: (projectId: number) => void
  onViewAll: () => void
}) {
  const recent = recentProjects(entries, projects, 5, now)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Projects</CardTitle>
        <Button onClick={onViewAll} size="inline" variant="link">
          View all
          <ArrowRight aria-hidden className="size-3" />
        </Button>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No projects tracked yet</p>
        ) : (
          <ul className="space-y-1">
            {recent.map((item) => (
              <li key={item.projectId}>
                <Button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => item.projectId !== null && onSelectProject(item.projectId)}
                  variant="ghost"
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatDuration(item.minutes)}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
