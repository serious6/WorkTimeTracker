import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { listAllAuditPages, listAllPages, MAX_LIST_LIMIT, validateListRange } from './list-range'

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

describe('listAllAuditPages', () => {
  /** Descending trail, `shared` rows carry one and the same timestamp. */
  function trail(length: number, shared = 0) {
    return Array.from({ length }, (_, index) => ({
      id: length - index,
      recordedAt:
        index < shared
          ? '2026-08-27T12:00:00.000Z'
          : new Date(Date.UTC(2026, 7, 27, 0, 0, 0) - index * 60_000).toISOString(),
    }))
  }

  /** A backend page: the newest rows recorded before the asked bound. */
  function pageOf<T extends { recordedAt: string }>(rows: T[]) {
    return async (range: { to?: string; limit?: number }) => {
      const before = range.to ? rows.filter((row) => row.recordedAt < range.to!) : rows
      return before.slice(0, range.limit ?? MAX_LIST_LIMIT)
    }
  }

  it('reads the pages beyond the first one', async () => {
    const rows = trail(MAX_LIST_LIMIT + 3)
    const asked: (string | undefined)[] = []
    const page = pageOf(rows)

    const all = await listAllAuditPages((range) => {
      asked.push(range.to)
      return page(range)
    })

    expect(all).toEqual(rows)
    expect(asked.length).toBe(2)
    expect(asked[0]).toBeUndefined()
  })

  it('keeps the rows that share the timestamp of a page bound', async () => {
    // The first page ends inside a block of records of the same instant, so a
    // bound at that instant would drop the rest of the block.
    const shared = '2020-01-01T00:00:00.000Z'
    const rows = [
      ...trail(MAX_LIST_LIMIT - 2),
      ...Array.from({ length: 4 }, () => ({ id: 0, recordedAt: shared })),
    ].map((row, index, all) => ({ ...row, id: all.length - index }))

    const all = await listAllAuditPages(pageOf(rows))

    expect(all.map((row) => row.id)).toEqual(rows.map((row) => row.id))
  })

  it('stops on a full page that shares a single timestamp', async () => {
    const rows = trail(MAX_LIST_LIMIT, MAX_LIST_LIMIT)
    let calls = 0

    const all = await listAllAuditPages((range) => {
      calls += 1
      return pageOf(rows)(range)
    })

    expect(all.length).toBe(MAX_LIST_LIMIT)
    expect(calls).toBe(2)
  })

  it('stops on an empty answer', async () => {
    expect(await listAllAuditPages(async () => [])).toEqual([])
  })
})
