import { describe, expect, it } from 'vitest'
import {
  saveTimeEntrySchema,
  formToSaveTimeEntry,
  entryToForm,
  timeEntryFormSchema,
  ORDER_MESSAGE,
  type TimeEntry,
} from './time-entry-schema'

const BASE_ENTRY: TimeEntry = {
  id: 1,
  projectId: 42,
  workItemId: null,
  startTime: '2026-08-27T08:00:00.000Z',
  endTime: '2026-08-27T10:00:00.000Z',
  entryType: 'work',
  note: 'work',
  createdAt: '2026-08-27T08:00:00.000Z',
  updatedAt: '2026-08-27T08:00:00.000Z',
}

describe('saveTimeEntrySchema', () => {
  it('rejects malformed timestamps and reversed intervals', () => {
    expect(() =>
      saveTimeEntrySchema.parse({
        projectId: 1,
        startTime: 'xxxxxxxxxxxxTxxxxxxxxxxZ',
        endTime: null,
        note: null,
      }),
    ).toThrow()

    expect(() =>
      saveTimeEntrySchema.parse({
        projectId: 1,
        startTime: '2026-08-27T10:00:00.000Z',
        endTime: '2026-08-27T09:00:00.000Z',
        note: null,
      }),
    ).toThrow()
  })

  it('rejects an entry booked on both a project and a work item', () => {
    expect(() =>
      saveTimeEntrySchema.parse({
        projectId: 1,
        workItemId: 2,
        startTime: '2026-08-27T08:00:00.000Z',
        endTime: null,
        note: null,
      }),
    ).toThrow()
  })

  it('accepts a work entry booked on a work item instead of a project', () => {
    const parsed = saveTimeEntrySchema.parse({
      projectId: null,
      workItemId: 2,
      startTime: '2026-08-27T08:00:00.000Z',
      endTime: null,
      note: null,
    })
    expect(parsed.workItemId).toBe(2)
    expect(parsed.projectId).toBeNull()
  })
})

describe('timeEntryFormSchema', () => {
  it('accepts valid values', () => {
    const result = timeEntryFormSchema.safeParse({
      projectId: 1,
      date: '2026-08-27',
      startTime: '08:00',
      endTime: '10:00',
    })
    expect(result.success).toBe(true)
  })

  it.each([
    ['9', '09:00'],
    ['0900', '09:00'],
    ['9.5h', '09:30'],
  ])('normalises lenient time input %s', (input, expected) => {
    const result = timeEntryFormSchema.parse({
      projectId: 1,
      date: '2026-08-27',
      startTime: input,
      endTime: '18',
    })
    expect(result.startTime).toBe(expected)
  })

  it('rejects invalid time input', () => {
    const result = timeEntryFormSchema.safeParse({
      projectId: 1,
      date: '2026-08-27',
      startTime: '25',
      endTime: '18',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing project', () => {
    const result = timeEntryFormSchema.safeParse({
      projectId: undefined,
      date: '2026-08-27',
      startTime: '08:00',
      endTime: '10:00',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/project/i)
  })

  it('accepts a work item instead of a project', () => {
    const result = timeEntryFormSchema.safeParse({
      workItemId: 3,
      date: '2026-08-27',
      startTime: '08:00',
      endTime: '10:00',
    })
    expect(result.success).toBe(true)
  })

  it('rejects both a project and a work item', () => {
    const result = timeEntryFormSchema.safeParse({
      projectId: 1,
      workItemId: 3,
      date: '2026-08-27',
      startTime: '08:00',
      endTime: '10:00',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/either a project or a work item/i)
  })

  it('rejects end time before start time', () => {
    const result = timeEntryFormSchema.safeParse({
      projectId: 1,
      date: '2026-08-27',
      startTime: '10:00',
      endTime: '08:00',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(ORDER_MESSAGE)
  })

  it('rejects missing date', () => {
    const result = timeEntryFormSchema.safeParse({
      projectId: 1,
      date: '',
      startTime: '08:00',
      endTime: '10:00',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a note longer than 500 chars', () => {
    const result = timeEntryFormSchema.safeParse({
      projectId: 1,
      date: '2026-08-27',
      startTime: '08:00',
      endTime: '10:00',
      note: 'x'.repeat(501),
    })
    expect(result.success).toBe(false)
  })
})

describe('formToSaveTimeEntry', () => {
  it('converts valid form to save payload', () => {
    const form = timeEntryFormSchema.parse({
      projectId: 5,
      date: '2026-08-27',
      startTime: '09:00',
      endTime: '11:00',
      note: '  coding  ',
    })
    const save = formToSaveTimeEntry(form)
    expect(save.projectId).toBe(5)
    expect(save.note).toBe('coding')
    expect(save.startTime).toBe(new Date(2026, 7, 27, 9).toISOString())
    expect(save.endTime).toBe(new Date(2026, 7, 27, 11).toISOString())
    expect(new Date(save.endTime!).getTime()).toBeGreaterThan(new Date(save.startTime).getTime())
  })

  it('sets note to null when omitted', () => {
    const form = timeEntryFormSchema.parse({
      projectId: 5,
      date: '2026-08-27',
      startTime: '09:00',
      endTime: '11:00',
    })
    const save = formToSaveTimeEntry(form)
    expect(save.note).toBeNull()
  })
})

describe('entryToForm', () => {
  it('converts a complete entry to form values', () => {
    const form = entryToForm(BASE_ENTRY)
    expect(form.projectId).toBe(42)
    expect(form.note).toBe('work')
    expect(form.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(form.startTime).toMatch(/^\d{2}:\d{2}$/)
    expect(form.endTime).toMatch(/^\d{2}:\d{2}$/)
  })

  it('sets projectId to undefined when entry has no project', () => {
    const form = entryToForm({ ...BASE_ENTRY, projectId: null })
    expect(form.projectId).toBeUndefined()
  })

  it('falls back to current time for endTime when entry is running', () => {
    const form = entryToForm({ ...BASE_ENTRY, endTime: null })
    expect(form.endTime).toMatch(/^\d{2}:\d{2}$/)
  })

  it('sets note to undefined when entry note is null', () => {
    const form = entryToForm({ ...BASE_ENTRY, note: null })
    expect(form.note).toBeUndefined()
  })
})
