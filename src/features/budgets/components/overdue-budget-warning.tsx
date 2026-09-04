import { AlertTriangle } from 'lucide-react'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { overdueBudget } from '../budget-metrics'
import type { ProjectBudget } from '../budget-schema'

/**
 * Names an overdue or exceeded budget of the project that is about to be or is
 * being tracked. The warning informs only: it never blocks the timer.
 */
export function OverdueBudgetWarning({
  budgets,
  entries,
  projectId,
  now,
}: {
  budgets: ProjectBudget[]
  entries: TimeEntry[]
  projectId: number | null
  now?: number
}) {
  const overdue = overdueBudget(budgets, entries, projectId, now)
  if (!overdue) return null

  return (
    <p className="flex items-start gap-2 pt-3 text-sm" role="status">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      <span>
        <span className="font-medium">Budget overdue</span>{' '}
        <span className="text-muted-foreground">{overdue.message}</span>
      </span>
    </p>
  )
}
