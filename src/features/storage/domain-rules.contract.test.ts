import { beforeEach, describe, expect, it } from 'vitest'
import domainRules from '../../../contract/domain-rules.json'
import {
  saveAbsenceSchema,
  type AbsenceType,
} from '@/features/absences/absence-schema'
import { credentialsSchema, registrationSchema } from '@/features/auth/auth-schema'
import {
  LOGIN_LOCKOUT_MINUTES,
  MAX_LOGIN_ATTEMPTS,
  SESSION_TIMEOUT_MINUTES,
} from '@/features/auth/security-policy'
import { saveProjectBudgetSchema } from '@/features/budgets/budget-schema'
import { saveProjectSchema } from '@/features/projects/project-schema'
import { adjustedDailyTarget } from '@/features/settings/work-schedule'
import { workSettingsSchema } from '@/features/settings/work-settings-schema'
import { findOverlap } from '@/features/time-entries/overlap'
import { saveTimeEntrySchema, type TimeEntry } from '@/features/time-entries/time-entry-schema'
import { createLocalRepository } from './local-repository'

type Case = {
  name: string
  input: unknown
  accepted: boolean
  registration?: boolean
  normalizedEmail?: string
  normalizedName?: string
  normalizedWorkingDays?: string[]
  normalizedDate?: string
}

/** A daily target before and after an absence neutralises it. */
type AbsenceTargetCase = {
  name: string
  dailyTargetMinutes: number
  workingDay: boolean
  absenceType: AbsenceType | null
  targetMinutes: number
}

type OverlapCase = {
  name: string
  existing: { startTime: string; endTime: string | null }[]
  candidate: { startTime: string; endTime: string | null }
  excludeIndex: number | null
  overlaps: boolean
}

type UniquenessCase = {
  name: string
  kind: 'email' | 'projectBudget' | 'absenceDay'
  input: unknown
}

/**
 * The same cases run against the Rust models in `src-tauri/src/contract.rs`.
 * A rule that changes on one side only makes one of the two suites fail.
 */
const rules = domainRules as unknown as {
  securityLimits: {
    sessionTimeoutMinutes: number
    maxLoginAttempts: number
    loginLockoutMinutes: number
  }
  credentials: Case[]
  projects: Case[]
  timeEntries: Case[]
  projectBudgets: Case[]
  workSettings: Case[]
  absences: Case[]
  absenceTargets: AbsenceTargetCase[]
  uniqueness: UniquenessCase[]
  overlaps: OverlapCase[]
}

function entries(records: OverlapCase['existing']): TimeEntry[] {
  return records.map((record, index) => ({
    id: index + 1,
    projectId: 1,
    startTime: record.startTime,
    endTime: record.endTime,
    entryType: 'work',
    note: null,
    createdAt: record.startTime,
    updatedAt: record.startTime,
  }))
}

describe('domain rule contract', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear()
    globalThis.sessionStorage?.clear()
  })

  it('shares the security limits with the Rust backend', () => {
    expect(rules.securityLimits).toEqual({
      sessionTimeoutMinutes: SESSION_TIMEOUT_MINUTES,
      maxLoginAttempts: MAX_LOGIN_ATTEMPTS,
      loginLockoutMinutes: LOGIN_LOCKOUT_MINUTES,
    })
  })

  it.each(rules.credentials)('credentials: $name', (testCase) => {
    const schema = testCase.registration ? registrationSchema : credentialsSchema
    const parsed = schema.safeParse(testCase.input)

    expect(parsed.success).toBe(testCase.accepted)
    if (parsed.success && testCase.normalizedEmail) {
      expect(parsed.data.email).toBe(testCase.normalizedEmail)
    }
  })

  it.each(rules.projects)('project: $name', (testCase) => {
    const parsed = saveProjectSchema.safeParse(testCase.input)

    expect(parsed.success).toBe(testCase.accepted)
    if (parsed.success && testCase.normalizedName) {
      expect(parsed.data.name).toBe(testCase.normalizedName)
    }
  })

  it.each(rules.timeEntries)('time entry: $name', (testCase) => {
    expect(saveTimeEntrySchema.safeParse(testCase.input).success).toBe(testCase.accepted)
  })

  it.each(rules.projectBudgets)('project budget: $name', (testCase) => {
    expect(saveProjectBudgetSchema.safeParse(testCase.input).success).toBe(testCase.accepted)
  })

  it.each(rules.workSettings)('work settings: $name', (testCase) => {
    const parsed = workSettingsSchema.safeParse(testCase.input)

    expect(parsed.success).toBe(testCase.accepted)
    if (parsed.success && testCase.normalizedWorkingDays) {
      expect(parsed.data.workingDays).toEqual(testCase.normalizedWorkingDays)
    }
  })

  it.each(rules.absences)('absence: $name', (testCase) => {
    const parsed = saveAbsenceSchema.safeParse(testCase.input)

    expect(parsed.success).toBe(testCase.accepted)
    if (parsed.success && testCase.normalizedDate) {
      expect(parsed.data.date).toBe(testCase.normalizedDate)
    }
  })

  it.each(rules.absenceTargets)('absence target: $name', (testCase) => {
    expect(
      adjustedDailyTarget(
        testCase.dailyTargetMinutes,
        testCase.workingDay,
        testCase.absenceType,
      ),
    ).toBe(testCase.targetMinutes)
  })

  it.each(rules.uniqueness)('uniqueness: $name', async (testCase) => {
    if (testCase.kind === 'email') {
      const credentials = registrationSchema.parse(testCase.input)
      await createLocalRepository().register(credentials)

      await expect(createLocalRepository().register(credentials)).rejects.toMatchObject({ kind: 'conflict' })
      return
    }

    if (testCase.kind === 'absenceDay') {
      await createLocalRepository().register({
        email: 'absence@example.com',
        password: 'Str0ng-Passphrase!!x',
      })
      const absence = saveAbsenceSchema.parse(testCase.input)
      await createLocalRepository().createAbsence(absence)

      await expect(createLocalRepository().createAbsence(absence)).rejects.toMatchObject({
        kind: 'conflict',
      })
      return
    }

    await createLocalRepository().register({
      email: 'budget@example.com',
      password: 'Str0ng-Passphrase!!x',
    })
    await createLocalRepository().createProject({
      name: 'Website Redesign',
      description: null,
      color: '#22c55e',
      active: true,
    })
    const budget = saveProjectBudgetSchema.parse(testCase.input)
    await createLocalRepository().createProjectBudget(budget)

    await expect(createLocalRepository().createProjectBudget(budget)).rejects.toMatchObject({
      kind: 'conflict',
    })
  })

  it.each(rules.overlaps)('overlap: $name', (testCase) => {
    const excludeId = testCase.excludeIndex ?? undefined

    expect(Boolean(findOverlap(entries(testCase.existing), testCase.candidate, excludeId))).toBe(
      testCase.overlaps,
    )
  })
})
