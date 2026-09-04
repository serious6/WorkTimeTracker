import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/input'
import { toast } from '@/components/ui/toast-store'
import { useProjects } from '@/features/projects/project-queries'
import { selectableProjects } from '@/features/projects/project-schema'
import { errorMessage } from '@/lib/errors'
import { useCreateProjectBudget, useUpdateProjectBudget } from '../budget-queries'
import {
  budgetFormSchema,
  formToSaveProjectBudget,
  type ProjectBudget,
} from '../budget-schema'

export function BudgetDialog({
  open,
  budget,
  onClose,
}: {
  open: boolean
  budget?: ProjectBudget
  onClose: () => void
}) {
  const { data: projects = [] } = useProjects()
  const createBudget = useCreateProjectBudget()
  const updateBudget = useUpdateProjectBudget()
  const [error, setError] = useState<string>()
  const [openedFor, setOpenedFor] = useState<number | null>(null)

  const openedKey = budget?.id ?? 0
  if (open && openedFor !== openedKey) {
    setOpenedFor(openedKey)
    setError(undefined)
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = budgetFormSchema.safeParse({
      projectId: form.get('projectId'),
      budgetHours: form.get('budgetHours'),
      dueDate: form.get('dueDate'),
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message)
      return
    }

    const input = formToSaveProjectBudget(result.data)
    try {
      if (budget) {
        await updateBudget.mutateAsync({ id: budget.id, input })
        toast('Budget updated', `${result.data.budgetHours}h until ${input.dueDate}`)
      } else {
        await createBudget.mutateAsync(input)
        toast('Budget created', `${result.data.budgetHours}h until ${input.dueDate}`)
      }
      setError(undefined)
      onClose()
    } catch (failure) {
      setError(errorMessage(failure, 'The budget could not be saved.'))
    }
  }

  return (
    <Dialog onClose={onClose} open={open} title={budget ? 'Edit budget' : 'Create budget'}>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1 text-sm font-medium">
          Project
          <Select defaultValue={budget?.projectId ?? ''} name="projectId">
            <option disabled value="">
              Select a project
            </option>
            {selectableProjects(projects, budget?.projectId ?? null).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Budget (hours)
          <Input
            defaultValue={budget ? budget.budgetMinutes / 60 : ''}
            name="budgetHours"
            placeholder="80"
            step="0.25"
            type="number"
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Due date
          <Input
            defaultValue={budget?.dueDate ?? ''}
            name="dueDate"
            type="date"
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button type="submit">{budget ? 'Save budget' : 'Create budget'}</Button>
        </div>
      </form>
    </Dialog>
  )
}
