import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { budgetReport } from '@/features/budgets/budget-metrics'
import type { ProjectBudget } from '@/features/budgets/budget-schema'
import type { Project } from '@/features/projects/project-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { formatDay, formatDuration, fromDateKey } from '@/lib/date'
import { cn } from '@/lib/utils'

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums font-medium', tone)}>{value}</span>
    </div>
  )
}

export function BudgetReportCard({
  projects,
  budgets,
  entries,
  selectedProjectId,
  onSelectProject,
  now,
}: {
  projects: Project[]
  budgets: ProjectBudget[]
  entries: TimeEntry[]
  selectedProjectId: number | null
  onSelectProject: (projectId: number | null) => void
  now?: number
}) {
  const budget = budgets.find((candidate) => candidate.projectId === selectedProjectId)
  const report = budget ? budgetReport(budget, entries, now) : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project budget</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Select
          aria-label="Budget project"
          onChange={(event) => onSelectProject(Number(event.target.value) || null)}
          value={selectedProjectId ?? ''}
        >
          <option value="">Select a project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
        {selectedProjectId === null && (
          <p className="text-muted-foreground">Select a project to see its budget.</p>
        )}
        {selectedProjectId !== null && !report && (
          <p className="text-muted-foreground">
            No budget is defined for this project. Create one in the Budgets section.
          </p>
        )}
        {budget && report && (
          <>
            <Row label="Budget" value={formatDuration(report.budgetMinutes)} />
            <Row label="Due date" value={formatDay(fromDateKey(budget.dueDate))} />
            <Row label="Tracked" value={formatDuration(report.trackedMinutes)} />
            <Row
              label="Remaining"
              tone={report.exceeded ? 'text-destructive' : undefined}
              value={
                report.exceeded
                  ? `-${formatDuration(-report.remainingMinutes)}`
                  : formatDuration(report.remainingMinutes)
              }
            />
            <Row
              label="Consumed"
              tone={report.exceeded ? 'text-destructive' : undefined}
              value={`${report.consumptionPercentage}%`}
            />
            <Progress
              indicatorClassName={report.exceeded ? 'bg-destructive' : undefined}
              label="Budget consumption"
              value={report.consumptionPercentage}
            />
            {report.exceeded && (
              <p className="font-medium text-destructive">
                Budget exceeded by {formatDuration(-report.remainingMinutes)}.
              </p>
            )}
            <div className="space-y-1 border-t border-border pt-3">
              <p className="font-medium">Forecast</p>
              <Row
                label="Pace"
                value={`${formatDuration(report.paceMinutesPerDay)} per day`}
              />
              <Row label="Days left" value={`${report.daysRemaining}`} />
              <Row
                label="Projected at due date"
                tone={report.willExceed ? 'text-destructive' : 'text-success'}
                value={formatDuration(report.projectedMinutes)}
              />
              <p className={cn('pt-1', report.willExceed ? 'text-destructive' : 'text-success')}>
                {report.willExceed
                  ? `Budget will be exceeded by ${formatDuration(report.differenceMinutes)} at the current pace.`
                  : `Budget will hold with ${formatDuration(-report.differenceMinutes)} to spare at the current pace.`}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
