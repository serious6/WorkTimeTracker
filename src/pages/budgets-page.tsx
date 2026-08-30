import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Progress } from '@/components/ui/progress'
import { toast } from '@/components/ui/toast-store'
import { BudgetDialog } from '@/features/budgets/components/budget-dialog'
import { budgetReport } from '@/features/budgets/budget-metrics'
import { useDeleteProjectBudget, useProjectBudgets } from '@/features/budgets/budget-queries'
import type { ProjectBudget } from '@/features/budgets/budget-schema'
import { useProjects } from '@/features/projects/project-queries'
import { useTimeEntries } from '@/features/time-entries/time-entry-queries'
import { DELETED_PROJECT_NAME, type TimeEntry } from '@/features/time-entries/time-entry-schema'
import { formatDay, formatDuration, fromDateKey } from '@/lib/date'

/** Goal-Gradient Effect: a budget is easier to judge as progress than as a total. */
function BudgetProgress({
  budget,
  entries,
  projectName,
}: {
  budget: ProjectBudget
  entries: TimeEntry[]
  projectName: string
}) {
  const report = budgetReport(budget, entries)
  return (
    <div className="flex items-center gap-3">
      <Progress
        indicatorClassName={report.exceeded ? 'bg-destructive' : undefined}
        label={`Budget consumption for ${projectName}`}
        value={report.consumptionPercentage}
      />
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatDuration(report.trackedMinutes)} tracked ({report.consumptionPercentage}%
        {report.exceeded ? ', exceeded' : ''})
      </span>
    </div>
  )
}

export function BudgetsPage() {
  const { data: budgets = [] } = useProjectBudgets()
  const { data: projects = [] } = useProjects()
  const { data: entries = [] } = useTimeEntries()
  const deleteBudget = useDeleteProjectBudget()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectBudget>()
  const [deleting, setDeleting] = useState<ProjectBudget>()

  const projectName = (projectId: number) =>
    projects.find((project) => project.id === projectId)?.name ?? DELETED_PROJECT_NAME

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Budgets</h1>
          <p className="text-sm text-muted-foreground">
            Hour budgets per project. Consumption and forecast are shown in Reports.
          </p>
        </div>
        <Button
          disabled={projects.length === 0}
          onClick={() => {
            setEditing(undefined)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" />
          Create budget
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>All budgets</CardTitle>
        </CardHeader>
        <CardContent>
          {budgets.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              {projects.length === 0
                ? 'Create a project first to define a budget for it.'
                : 'No budgets yet. Create a budget to track hours against a due date.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {budgets.map((budget) => (
                <li className="space-y-2 py-3 text-sm" key={budget.id}>
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {projectName(budget.projectId)}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatDuration(budget.budgetMinutes)} until{' '}
                      {formatDay(fromDateKey(budget.dueDate))}
                    </span>
                    <Button
                      aria-label={`Edit budget for ${projectName(budget.projectId)}`}
                      onClick={() => {
                        setEditing(budget)
                        setDialogOpen(true)
                      }}
                      size="icon"
                      variant="ghost"
                    >
                      <Pencil aria-hidden className="size-4" />
                    </Button>
                    <Button
                      aria-label={`Delete budget for ${projectName(budget.projectId)}`}
                      className="ml-2 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleting(budget)}
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </div>
                  <BudgetProgress
                    budget={budget}
                    entries={entries}
                    projectName={projectName(budget.projectId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <BudgetDialog budget={editing} onClose={() => setDialogOpen(false)} open={dialogOpen} />
      <ConfirmDialog
        confirmLabel="Delete budget"
        description="Time entries of the project are kept."
        onClose={() => setDeleting(undefined)}
        onConfirm={() => {
          if (!deleting) return
          deleteBudget.mutate(deleting.id, {
            onSuccess: () => toast('Budget deleted', projectName(deleting.projectId)),
          })
        }}
        open={Boolean(deleting)}
        title="Delete budget?"
      />
    </div>
  )
}
