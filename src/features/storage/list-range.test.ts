import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { listAllPages, MAX_LIST_LIMIT, validateListRange } from './list-range'

describe('validateListRange', () => {
  it('keeps a window of whole dates and timestamps', () => {
    expect(validateListRange(undefined)).toBeUndefined()
    expect(validateListRange({ from: ' 2026-08-27 ', to: '2026-08-28T00:00:00.000Z' })).toEqual({
      from: '2026-08-27',
      to: '2026-08-28T00:00:00.000Z',
      limit: undefined,
    })
    expect(validateListRange({ from: '' })).toEqual({
      from: undefined,
      to: undefined,
      limit: undefined,
    })
  })

  it('rejects a bound that is not a whole date or timestamp', () => {
    for (const from of ['2026-08-27garbage', '2026-13-01', '2026-02-30', '27.08.2026']) {
      expect(() => validateListRange({ from })).toThrow(AppError)
    }
  })

  it('rejects a reversed window and a limit that is not a positive whole number', () => {
    expect(() => validateListRange({ from: '2026-08-28', to: '2026-08-27' })).toThrow(AppError)
    for (const limit of [0, -1, 1.5, Number.NaN]) {
      expect(() => validateListRange({ limit })).toThrow(AppError)
    }
  })
})

describe('listAllPages', () => {
  it('reads the history in bounded pages until a page is short', async () => {
    const rows = Array.from({ length: MAX_LIST_LIMIT + 2 }, (_, index) => ({
      at: `2026-08-27T${String(index).padStart(6, '0')}.000Z`,
    }))
    const asked: (string | undefined)[] = []

    const all = await listAllPages(async (range) => {
      asked.push(range.to)
      const before = range.to ? rows.filter((row) => row.at < (range.to as string)) : rows
      return before.slice(Math.max(before.length - MAX_LIST_LIMIT, 0))
    }, (row) => row.at)

    expect(all).toEqual(rows)
    expect(asked).toEqual([undefined, rows[2].at])
  })

  it('stops on an empty answer', async () => {
    expect(await listAllPages(async () => [], (row: { at: string }) => row.at)).toEqual([])
  })
})
