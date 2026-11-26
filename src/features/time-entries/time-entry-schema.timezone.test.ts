import { describe, expect, it } from 'vitest'
import { formToSaveTimeEntry, type TimeEntry, type TimeEntryForm } from './time-entry-schema'

const original: TimeEntry = {
  id: 1,
  projectId: 1,
  startTime: '2026-10-25T01:10:42.000Z',
  endTime: '2026-10-25T01:40:42.000Z',
  entryType: 'work',
  note: null,
  createdAt: '2026-10-25T01:10:42.000Z',
  updatedAt: '2026-10-25T01:40:42.000Z',
}

const form: TimeEntryForm = {
  projectId: 1,
  date: '2026-10-25',
  startTime: '02:10',
  endTime: '02:50',
  entryType: 'work',
}

describe('formToSaveTimeEntry during DST transitions', () => {
  it('keeps the second occurrence when changing an ambiguous end or start', () => {
    expect(formToSaveTimeEntry(form, original)).toMatchObject({
      startTime: '2026-10-25T01:10:42.000Z',
      endTime: '2026-10-25T01:50:00.000Z',
    })
    expect(formToSaveTimeEntry({ ...form, startTime: '02:20', endTime: '02:40' }, original)).toMatchObject({
      startTime: '2026-10-25T01:20:00.000Z',
      endTime: '2026-10-25T01:40:42.000Z',
    })
  })

  it('keeps the first occurrence and uses the actual offset outside the repeated hour', () => {
    const first = { ...original, startTime: '2026-10-25T00:10:42.000Z', endTime: '2026-10-25T00:40:42.000Z' }
    expect(formToSaveTimeEntry(form, first).endTime).toBe('2026-10-25T00:50:00.000Z')
    expect(formToSaveTimeEntry({ ...form, endTime: '03:10' }, first).endTime).toBe('2026-10-25T02:10:00.000Z')
    expect(formToSaveTimeEntry({ ...form, startTime: '01:50' }, original).startTime).toBe('2026-10-24T23:50:00.000Z')
  })

  it('retains the existing behavior for new entries and nonexistent spring-forward times', () => {
    expect(formToSaveTimeEntry(form).endTime).toBe('2026-10-25T00:50:00.000Z')
    expect(formToSaveTimeEntry({ ...form, date: '2026-03-29', endTime: '02:50' }, original).endTime)
      .toBe('2026-03-29T01:50:00.000Z')
  })
})
