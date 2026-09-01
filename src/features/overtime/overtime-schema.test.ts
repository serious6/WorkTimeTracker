import { describe, expect, it } from 'vitest'
import { explicitOvertime } from './overtime-balance'
import {
  formToSaveOvertimeEntry,
  overtimeFormSchema,
  parseOvertimeMinutes,
  saveOvertimeEntrySchema,
  type OvertimeEntry,
  type OvertimeKind,
  type OvertimeOrigin,
} from './overtime-schema'

function record(
  id: number,
  effectiveDate: string,
  minutes: number,
  kind: OvertimeKind = 'balance',
  origin: OvertimeOrigin = 'manual',
): OvertimeEntry {
  return {
    id,
    effectiveDate,
    minutes,
    kind,
    origin,
    note: null,
    createdAt: `${effectiveDate}T08:00:00.000Z`,
    updatedAt: `${effectiveDate}T08:00:00.000Z`,
  }
}

describe('overtime payload', () => {
  it('accepts a negative value, trims the note and defaults the origin to manual', () => {
    const parsed = saveOvertimeEntrySchema.parse({
      effectiveDate: '2026-09-01',
      minutes: -90,
      kind: 'adjustment',
      note: '  corrected by hand  ',
    })

    expect(parsed).toMatchObject({ minutes: -90, origin: 'manual', note: 'corrected by hand' })
  })

  it('keeps an automatic origin that the application writes itself', () => {
    expect(
      saveOvertimeEntrySchema.parse({
        effectiveDate: '2026-09-01',
        minutes: 30,
        kind: 'balance',
        origin: 'automatic',
        note: null,
      }).origin,
    ).toBe('automatic')
  })

  it('rejects an origin outside the enum', () => {
    expect(
      saveOvertimeEntrySchema.safeParse({
        effectiveDate: '2026-09-01',
        minutes: 30,
        kind: 'balance',
        origin: 'imported',
      }).success,
    ).toBe(false)
  })

  it('rejects an unknown kind, a fractional value and an impossible date', () => {
    const payload = { effectiveDate: '2026-09-01', minutes: 30, kind: 'balance' }

    expect(saveOvertimeEntrySchema.safeParse({ ...payload, kind: 'carry' }).success).toBe(false)
    expect(saveOvertimeEntrySchema.safeParse({ ...payload, minutes: 30.5 }).success).toBe(false)
    expect(
      saveOvertimeEntrySchema.safeParse({ ...payload, effectiveDate: '2026-02-30' }).success,
    ).toBe(false)
    expect(
      saveOvertimeEntrySchema.safeParse({ ...payload, minutes: 600_000 }).success,
    ).toBe(false)
  })

  it('rejects a note longer than 500 characters', () => {
    expect(
      saveOvertimeEntrySchema.safeParse({
        effectiveDate: '2026-09-01',
        minutes: 30,
        kind: 'balance',
        note: 'x'.repeat(501),
      }).success,
    ).toBe(false)
  })
})

describe('overtime input', () => {
  it('reads hours and minutes, plain minutes and undertime', () => {
    expect(parseOvertimeMinutes('2h 30m')).toBe(150)
    expect(parseOvertimeMinutes('90m')).toBe(90)
    expect(parseOvertimeMinutes('1.5h')).toBe(90)
    expect(parseOvertimeMinutes('45')).toBe(45)
    expect(parseOvertimeMinutes('-1h 15m')).toBe(-75)
  })

  it('refuses input that is not a duration', () => {
    expect(parseOvertimeMinutes('later')).toBeNull()
    expect(parseOvertimeMinutes('')).toBeNull()
    expect(parseOvertimeMinutes('99999h')).toBeNull()
  })

  it('turns a form into a manual payload', () => {
    const form = overtimeFormSchema.parse({
      effectiveDate: '2026-09-01',
      kind: 'opening',
      value: '-2h',
      note: '  from the old system ',
    })

    expect(formToSaveOvertimeEntry(form)).toEqual({
      effectiveDate: '2026-09-01',
      minutes: -120,
      kind: 'opening',
      origin: 'manual',
      note: 'from the old system',
    })
  })

  it('reports an unparsable value instead of saving it', () => {
    const result = overtimeFormSchema.safeParse({
      effectiveDate: '2026-09-01',
      kind: 'balance',
      value: 'a lot',
      note: '',
    })

    expect(result.success).toBe(false)
  })
})

describe('explicit overtime', () => {
  it('is zero without any record', () => {
    expect(explicitOvertime([], '2026-09-30')).toEqual({ startKey: null, minutes: 0 })
  })

  it('replaces everything before an opening balance', () => {
    const entries = [record(1, '2026-09-01', 600, 'opening')]

    expect(explicitOvertime(entries, '2026-09-30')).toEqual({
      startKey: '2026-09-01',
      minutes: 600,
    })
  })

  it('adds adjustments after the newest absolute record', () => {
    const entries = [
      record(1, '2026-01-01', 600, 'opening'),
      record(2, '2026-05-01', 60, 'adjustment'),
      record(3, '2026-06-01', 120, 'balance'),
      record(4, '2026-07-01', -30, 'adjustment'),
    ]

    expect(explicitOvertime(entries, '2026-09-30')).toEqual({
      startKey: '2026-06-01',
      minutes: 90,
    })
  })

  it('ignores records that take effect later', () => {
    const entries = [record(1, '2026-09-01', 600, 'opening'), record(2, '2026-10-01', 60)]

    expect(explicitOvertime(entries, '2026-09-15').minutes).toBe(600)
  })
})
