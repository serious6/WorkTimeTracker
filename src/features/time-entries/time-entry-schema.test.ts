import { describe, expect, it } from 'vitest'
import { newTimeEntrySchema } from './time-entry-schema'

describe('newTimeEntrySchema', () => {
  it('normalizes a valid form submission', () => {
    expect(
      newTimeEntrySchema.parse({
        project: '  WorkTimeTracker ',
        durationMinutes: '30',
        notes: ' Setup ',
      }),
    ).toEqual({
      project: 'WorkTimeTracker',
      durationMinutes: 30,
      notes: 'Setup',
    })
  })

  it('rejects empty projects and invalid durations', () => {
    expect(newTimeEntrySchema.safeParse({ project: ' ', durationMinutes: 0 }).success).toBe(false)
    expect(newTimeEntrySchema.safeParse({ project: 'Project', durationMinutes: 1441 }).success).toBe(false)
  })
})
