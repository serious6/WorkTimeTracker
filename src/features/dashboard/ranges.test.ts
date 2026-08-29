import { describe, expect, it } from 'vitest'
import { toDateKey } from '@/lib/date'
import { resolveRange } from './ranges'

const ref = new Date(2026, 7, 27) // Wednesday, August 27 2026

describe('resolveRange', () => {
  it('today returns a day range for the reference date', () => {
    const { start, end } = resolveRange('today', ref)
    expect(toDateKey(start)).toBe('2026-08-27')
    expect(end.getTime() - start.getTime()).toBe(86_400_000)
  })

  it('yesterday returns the previous day', () => {
    const { start } = resolveRange('yesterday', ref)
    expect(toDateKey(start)).toBe('2026-08-26')
  })

  it('this-week starts on Monday by default', () => {
    const { start } = resolveRange('this-week', ref)
    expect(start.getDay()).toBe(1) // Monday
    expect(toDateKey(start)).toBe('2026-08-24')
  })

  it('this-week starts on Sunday when configured', () => {
    const { start } = resolveRange('this-week', ref, 'sunday')
    expect(start.getDay()).toBe(0)
  })

  it('last-week is 7 days before this-week', () => {
    const thisWeek = resolveRange('this-week', ref)
    const lastWeek = resolveRange('last-week', ref)
    expect(thisWeek.start.getTime() - lastWeek.start.getTime()).toBe(7 * 86_400_000)
  })

  it('this-month spans the full calendar month', () => {
    const { start, end } = resolveRange('this-month', ref)
    expect(toDateKey(start)).toBe('2026-08-01')
    expect(toDateKey(end)).toBe('2026-09-01')
  })

  it('custom range uses provided from/to dates', () => {
    const { start, end } = resolveRange('custom', ref, 'monday', {
      from: '2026-08-10',
      to: '2026-08-12',
    })
    expect(toDateKey(start)).toBe('2026-08-10')
    expect(toDateKey(end)).toBe('2026-08-13') // exclusive end = to + 1
  })

  it('custom range falls back to today when from/to are missing', () => {
    const { start } = resolveRange('custom', ref, 'monday', undefined)
    expect(toDateKey(start)).toBe('2026-08-27')
  })

  it('custom range falls back to today when from is empty string', () => {
    const { start } = resolveRange('custom', ref, 'monday', { from: '', to: '2026-08-12' })
    expect(toDateKey(start)).toBe('2026-08-27')
  })
})
