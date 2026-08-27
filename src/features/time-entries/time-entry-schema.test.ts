import { describe, expect, it } from 'vitest'
import { saveTimeEntrySchema } from './time-entry-schema'

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
})
