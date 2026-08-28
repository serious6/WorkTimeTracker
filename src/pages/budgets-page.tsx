import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toast-store'
import { BudgetDialog } from '@/features/budgets/components/budget-dialog'
import { useDeleteProjectBudget, useProjectBudgets } from '@/features/budgets/budget-queries'
import type { ProjectBudget } from '@/features/budgets/budget-schema'
import { useProjects } from '@/features/projects/project-queries'
import { DELETED_PROJECT_NAME } from '@/features/time-entries/time-entry-schema'
import { formatDay, formatDuration, fromDateKey } from '@/lib/date'

export function BudgetsPage() {
  const { data: budgets = [] } = useProjectBudgets()
  const { data: projects = [] } = useProjects()
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
                <li className="flex items-center gap-3 py-2 text-sm" key={budget.id}>
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
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    aria-label={`Delete budget for ${projectName(budget.projectId)}`}
                    onClick={() => setDeleting(budget)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 className="size-4" />
                  </Button>
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
