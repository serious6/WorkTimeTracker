import { describe, expect, it } from 'vitest'
import { toDateKey } from '@/lib/date'
import { budgetFormSchema, formToSaveProjectBudget } from './budget-schema'

const tomorrow = toDateKey(new Date(Date.now() + 86_400_000))

function parse(values: Record<string, unknown>) {
  return budgetFormSchema.safeParse({
    projectId: '1',
    budgetHours: '80',
    dueDate: tomorrow,
    ...values,
  })
}

describe('budgetFormSchema', () => {
  it('converts a valid form into hours-based minutes', () => {
    const result = parse({})
    expect(result.success).toBe(true)
    expect(formToSaveProjectBudget(result.data!)).toEqual({
      projectId: 1,
      budgetMinutes: 4_800,
      dueDate: tomorrow,
    })
  })

  it('rejects a missing project', () => {
    expect(parse({ projectId: '' }).error?.issues[0]?.message).toBe('Project is required')
  })

  it('rejects a budget of zero or less hours', () => {
    expect(parse({ budgetHours: '0' }).error?.issues[0]?.message).toBe(
      'Budget must be greater than zero hours',
    )
    expect(parse({ budgetHours: '-4' }).error?.issues[0]?.message).toBe(
      'Budget must be greater than zero hours',
    )
  })

  it('rejects a missing or past due date', () => {
    expect(parse({ dueDate: '' }).error?.issues[0]?.message).toBe('Due date is required')
    expect(parse({ dueDate: '2020-01-01' }).error?.issues[0]?.message).toBe(
      'Due date must be today or later',
    )
  })

  it('accepts a due date of today', () => {
    expect(parse({ dueDate: toDateKey(new Date()) }).success).toBe(true)
  })
})
