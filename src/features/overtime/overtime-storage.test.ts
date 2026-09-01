import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalRepository } from '@/features/storage/local-repository'
import { DUPLICATE_OVERTIME_MESSAGE, SINGLE_OPENING_MESSAGE } from './overtime-schema'

const PASSWORD = 'Str0ng-Passphrase!!x'

beforeEach(async () => {
  await createLocalRepository().logout()
  globalThis.localStorage?.clear()
  globalThis.sessionStorage?.clear()
  await createLocalRepository().register({ email: 'first@example.com', password: PASSWORD })
})

describe('overtime storage', () => {
  it('reads the records back newest date first', async () => {
    await createLocalRepository().createOvertimeEntry({
      effectiveDate: '2026-09-01',
      minutes: 60,
      kind: 'opening',
      origin: 'manual',
      note: null,
    })
    await createLocalRepository().createOvertimeEntry({
      effectiveDate: '2026-09-05',
      minutes: -30,
      kind: 'adjustment',
      origin: 'manual',
      note: null,
    })

    expect(
      (await createLocalRepository().listOvertimeEntries()).map((entry) => entry.effectiveDate),
    ).toEqual(['2026-09-05', '2026-09-01'])
  })

  it('rejects a second record on the same date', async () => {
    await createLocalRepository().createOvertimeEntry({
      effectiveDate: '2026-09-01',
      minutes: 60,
      kind: 'balance',
      origin: 'manual',
      note: null,
    })

    await expect(
      createLocalRepository().createOvertimeEntry({
        effectiveDate: '2026-09-01',
        minutes: 30,
        kind: 'adjustment',
        origin: 'manual',
        note: null,
      }),
    ).rejects.toMatchObject({ kind: 'conflict', message: DUPLICATE_OVERTIME_MESSAGE })
  })

  it('rejects a second opening balance', async () => {
    await createLocalRepository().createOvertimeEntry({
      effectiveDate: '2026-09-01',
      minutes: 60,
      kind: 'opening',
      origin: 'manual',
      note: null,
    })

    await expect(
      createLocalRepository().createOvertimeEntry({
        effectiveDate: '2026-09-02',
        minutes: 30,
        kind: 'opening',
        origin: 'manual',
        note: null,
      }),
    ).rejects.toMatchObject({ kind: 'conflict', message: SINGLE_OPENING_MESSAGE })
  })

  it('rejects an unknown origin and a malformed date', async () => {
    await expect(
      createLocalRepository().createOvertimeEntry({
        effectiveDate: '2026-09-01',
        minutes: 60,
        kind: 'balance',
        origin: 'imported',
        note: null,
      } as never),
    ).rejects.toMatchObject({ kind: 'validation' })
    await expect(
      createLocalRepository().createOvertimeEntry({
        effectiveDate: '2026-02-30',
        minutes: 60,
        kind: 'balance',
        origin: 'manual',
        note: null,
      }),
    ).rejects.toMatchObject({ kind: 'validation' })
  })

  it('turns an automatic record into a manual one when the user edits it', async () => {
    const created = await createLocalRepository().createOvertimeEntry({
      effectiveDate: '2026-09-01',
      minutes: 60,
      kind: 'balance',
      origin: 'automatic',
      note: null,
    })
    expect(created.origin).toBe('automatic')

    const updated = await createLocalRepository().updateOvertimeEntry(created.id, {
      effectiveDate: '2026-09-01',
      minutes: 90,
      kind: 'balance',
      origin: 'automatic',
      note: null,
    })

    expect(updated).toMatchObject({ minutes: 90, origin: 'manual' })
  })

  it('records every change in the audit trail with actor, values and origin', async () => {
    const entry = await createLocalRepository().createOvertimeEntry({
      effectiveDate: '2026-09-01',
      minutes: 60,
      kind: 'balance',
      origin: 'automatic',
      note: null,
    })
    await createLocalRepository().updateOvertimeEntry(entry.id, {
      effectiveDate: '2026-09-01',
      minutes: 120,
      kind: 'balance',
      origin: 'automatic',
      note: 'corrected',
    })
    await createLocalRepository().deleteOvertimeEntry(entry.id)

    const audits = await createLocalRepository().listOvertimeAudits()
    expect(audits.map((audit) => audit.action)).toEqual(['deleted', 'updated', 'created'])
    expect(audits.every((audit) => audit.actor === 'first@example.com')).toBe(true)
    const updated = audits.find((audit) => audit.action === 'updated')
    expect(JSON.parse(updated?.oldValue ?? '{}')).toMatchObject({
      minutes: 60,
      origin: 'automatic',
    })
    expect(JSON.parse(updated?.newValue ?? '{}')).toMatchObject({ minutes: 120, origin: 'manual' })
    expect(audits.find((audit) => audit.action === 'deleted')?.newValue).toBeNull()
    expect(await createLocalRepository().listOvertimeEntries()).toEqual([])
  })

  it('keeps the overtime of another user out of sight', async () => {
    await createLocalRepository().createOvertimeEntry({
      effectiveDate: '2026-09-01',
      minutes: 60,
      kind: 'balance',
      origin: 'manual',
      note: null,
    })
    await createLocalRepository().logout()
    await createLocalRepository().register({ email: 'second@example.com', password: PASSWORD })

    expect(await createLocalRepository().listOvertimeEntries()).toEqual([])
    expect(await createLocalRepository().listOvertimeAudits()).toEqual([])
  })
})
