import { describe, expect, it, vi } from 'vitest'
import { filterPointRange, listLimit, MAX_LIST_LIMIT, type ListRange } from '@/features/storage/list-range'
import { AUDIT_PAGE_SIZE } from './audit-trails'
import { readAuditPage } from './use-audit-pages'

const NOW = Date.parse('2026-03-15T12:00:00.000Z')

function trail(count: number, groupSize = 1) {
  const rows = Array.from({ length: count }, (_, id) => ({
    id,
    recordedAt: new Date(NOW - Math.floor(id / groupSize) * 1000).toISOString(),
  }))
  const list = vi.fn(async (range: ListRange) =>
    filterPointRange(rows, range, (row) => row.recordedAt).slice(0, listLimit(range)),
  )
  return { rows, list }
}

describe('readAuditPage', () => {
  it('reads one look-ahead row while preserving the period bounds', async () => {
    const { list } = trail(120)
    const range = { from: '2026-03-01', to: '2026-03-16' }
    const page = await readAuditPage(list, range)

    expect(list).toHaveBeenCalledWith({ ...range, limit: AUDIT_PAGE_SIZE + 1 })
    expect(page.rows).toHaveLength(AUDIT_PAGE_SIZE)
    expect(page.nextTo).toBe(new Date(NOW - AUDIT_PAGE_SIZE * 1000 + 1).toISOString())
  })

  it('accumulates all records beyond the repository query cap', async () => {
    const { rows, list } = trail(MAX_LIST_LIMIT + 120)
    const loaded = []
    let to: string | undefined
    do {
      const page = await readAuditPage(list, { from: '2026-03-01', to })
      loaded.push(...page.rows)
      to = page.nextTo
    } while (to !== undefined)

    expect(loaded).toEqual(rows)
    expect(list.mock.calls.every(([range]) => range.limit === AUDIT_PAGE_SIZE + 1)).toBe(true)
    expect(list.mock.calls.every(([range]) => range.from === '2026-03-01')).toBe(true)
  })

  it.each([20, 60, 102])('never drops or duplicates timestamp groups of %i rows', async (groupSize) => {
    const { rows, list } = trail(250, groupSize)
    const loaded = []
    let to: string | undefined
    do {
      const page = await readAuditPage(list, { to })
      loaded.push(...page.rows)
      to = page.nextTo
    } while (to !== undefined)

    expect(loaded).toEqual(rows)
  })

  it.each([0, AUDIT_PAGE_SIZE])('exhausts a short response of %i rows', async (count) => {
    const { rows, list } = trail(count)
    expect(await readAuditPage(list, {})).toEqual({ rows, nextTo: undefined })
  })

  it('reports an unpageable timestamp group instead of silently truncating it', async () => {
    const { list } = trail(MAX_LIST_LIMIT + 1, MAX_LIST_LIMIT + 1)
    await expect(readAuditPage(list, {})).rejects.toMatchObject({ kind: 'validation' })
    expect(list.mock.calls.at(-1)?.[0].limit).toBe(MAX_LIST_LIMIT)
  })
})
