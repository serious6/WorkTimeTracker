import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalRepository } from '@/features/storage/local-repository'
import { DUPLICATE_ABSENCE_MESSAGE } from './absence-schema'

const PASSWORD = 'Str0ng-Passphrase!!x'

beforeEach(async () => {
  await createLocalRepository().logout()
  globalThis.localStorage?.clear()
  globalThis.sessionStorage?.clear()
  await createLocalRepository().register({ email: 'first@example.com', password: PASSWORD })
})

describe('absence storage', () => {
  it('stores one record per day and reads them back in order', async () => {
    await createLocalRepository().createAbsence({ type: 'vacation', date: '2026-09-02' })
    await createLocalRepository().createAbsence({ type: 'sick', date: '2026-09-01' })

    expect((await createLocalRepository().listAbsences()).map((absence) => absence.date)).toEqual([
      '2026-09-01',
      '2026-09-02',
    ])
  })

  it('rejects a second absence on the same day', async () => {
    await createLocalRepository().createAbsence({ type: 'vacation', date: '2026-09-01' })

    await expect(
      createLocalRepository().createAbsence({ type: 'sick', date: '2026-09-01' }),
    ).rejects.toMatchObject({ kind: 'conflict', message: DUPLICATE_ABSENCE_MESSAGE })
  })

  it('rejects an unknown absence type and a malformed date', async () => {
    await expect(
      createLocalRepository().createAbsence({ type: 'holiday', date: '2026-09-01' } as never),
    ).rejects.toMatchObject({ kind: 'validation' })
    await expect(
      createLocalRepository().createAbsence({ type: 'vacation', date: '2026-02-30' }),
    ).rejects.toMatchObject({ kind: 'validation' })
  })

  it('records every change in the audit trail with actor and values', async () => {
    const absence = await createLocalRepository().createAbsence({ type: 'vacation', date: '2026-09-01' })
    await createLocalRepository().updateAbsence(absence.id, { type: 'sick', date: '2026-09-01' })
    await createLocalRepository().deleteAbsence(absence.id)

    const audits = await createLocalRepository().listAbsenceAudits()
    expect(audits.map((audit) => audit.action)).toEqual(['deleted', 'updated', 'created'])
    expect(audits.every((audit) => audit.actor === 'first@example.com')).toBe(true)
    const updated = audits.find((audit) => audit.action === 'updated')
    expect(JSON.parse(updated?.oldValue ?? '{}')).toMatchObject({ type: 'vacation' })
    expect(JSON.parse(updated?.newValue ?? '{}')).toMatchObject({ type: 'sick' })
    expect(audits.find((audit) => audit.action === 'deleted')?.newValue).toBeNull()
  })

  it('keeps the absences of another user out of sight', async () => {
    await createLocalRepository().createAbsence({ type: 'vacation', date: '2026-09-01' })
    await createLocalRepository().logout()
    await createLocalRepository().register({ email: 'second@example.com', password: PASSWORD })

    expect(await createLocalRepository().listAbsences()).toEqual([])
    expect(await createLocalRepository().listAbsenceAudits()).toEqual([])
  })

  it('saves replacements and ranges together', async () => {
    const occupied = await createLocalRepository().createAbsence({ type: 'sick', date: '2026-09-02' })
    await createLocalRepository().saveAbsences(
      [
        { type: 'vacation', date: '2026-09-01' },
        { type: 'vacation', date: '2026-09-02' },
      ],
      [occupied.id],
    )

    expect(await createLocalRepository().listAbsences()).toMatchObject([
      { type: 'vacation', date: '2026-09-01' },
      { type: 'vacation', date: '2026-09-02' },
    ])
  })
})
