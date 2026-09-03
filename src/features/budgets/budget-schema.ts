import { z } from '@/lib/zod'
import { fromDateKey, toDateKey } from '@/lib/date'

export const DUPLICATE_BUDGET_MESSAGE = 'This project already has a budget'

const dueDateSchema = z
  .string()
  .min(1, 'Due date is required')
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && toDateKey(fromDateKey(value)) === value,
    'Due date must be a valid calendar date',
  )

export const projectBudgetSchema = z.object({
  id: z.number().int().positive(),
  projectId: z.number().int().positive(),
  budgetMinutes: z.number().int().positive(),
  dueDate: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const saveProjectBudgetSchema = z.object({
  projectId: z.number().int().positive('Project is required'),
  budgetMinutes: z.number().int().positive('Budget must be greater than zero hours'),
  dueDate: dueDateSchema,
})

export type ProjectBudget = z.infer<typeof projectBudgetSchema>
export type SaveProjectBudget = z.infer<typeof saveProjectBudgetSchema>

/** Values of the budget dialog; the budget is entered in hours. */
export const budgetFormSchema = z
  .object({
    projectId: z.coerce
      .number({ error: 'Project is required' })
      .int()
      .positive('Project is required'),
    budgetHours: z.coerce
      .number({ error: 'Budget in hours is required' })
      .positive('Budget must be greater than zero hours')
      .max(100_000),
    dueDate: dueDateSchema,
  })
  .refine((values) => values.dueDate >= toDateKey(new Date()), {
    message: 'Due date must be today or later',
    path: ['dueDate'],
  })

export type BudgetForm = z.infer<typeof budgetFormSchema>

export function formToSaveProjectBudget(form: BudgetForm): SaveProjectBudget {
  return {
    projectId: form.projectId,
    budgetMinutes: Math.round(form.budgetHours * 60),
    dueDate: form.dueDate,
  }
}
