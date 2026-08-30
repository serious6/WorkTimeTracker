import { beforeEach, describe, expect, it } from 'vitest'
import {
  DUPLICATE_EMAIL_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  PASSWORD_POLICY_MESSAGE,
} from '@/features/auth/auth-schema'
import { LOCKED_OUT_MESSAGE, MAX_LOGIN_ATTEMPTS } from '@/features/auth/security-policy'
import { DUPLICATE_BUDGET_MESSAGE } from '@/features/budgets/budget-schema'
import {
  DEFAULT_WORK_SETTINGS,
  NO_WORKING_DAY_MESSAGE,
} from '@/features/settings/work-settings-schema'
import { auditFieldChanges } from '@/features/audit/audit-schema'
import {
  BREAK_PROJECT_MESSAGE,
  ORDER_MESSAGE,
  OVERLAP_MESSAGE,
} from '@/features/time-entries/time-entry-schema'
import { createLocalRepository, NOT_SIGNED_IN_MESSAGE } from './local-repository'

const PASSWORD = 'Str0ng-Passphrase!!x'
const OTHER_PASSWORD = 'An0ther-Passphrase!!x'

async function register(email: string, password = PASSWORD) {
  return createLocalRepository().register({ email, password })
}

function projectInput(name = 'Website Redesign') {
  return { name, description: null, color: '#22c55e', active: true }
}

async function createProject(name: string) {
  return createLocalRepository().createProject(projectInput(name))
}

beforeEach(async () => {
  await createLocalRepository().logout()
  globalThis.localStorage?.clear()
  globalThis.sessionStorage?.clear()
})

describe('local repository authentication', () => {
  it('signs the new account in right away', async () => {
    const user = await register('First@Example.com')

    expect(user.email).toBe('first@example.com')
    expect(await createLocalRepository().currentSession()).toEqual(user)
  })

  it('rejects a password that breaks the policy', async () => {
    await expect(register('first@example.com', 'secret')).rejects.toThrow(PASSWORD_POLICY_MESSAGE)
  })

  it('rejects a malformed email', async () => {
    await expect(register('', PASSWORD)).rejects.toThrow('Email is required')
    await expect(register('invalid', PASSWORD)).rejects.toThrow('Enter a valid email address')
    await expect(register('@example.com', PASSWORD)).rejects.toThrow('Enter a valid email address')
    await expect(register('a'.repeat(255) + '@example.com', PASSWORD)).rejects.toThrow()
  })

  it('rejects a known email', async () => {
    await register('first@example.com')

    await expect(register('First@example.com')).rejects.toThrow(DUPLICATE_EMAIL_MESSAGE)
  })

  it('never stores the password in plaintext', async () => {
    await register('first@example.com')

    expect(globalThis.localStorage?.getItem('work-time-tracker.users')).not.toContain(PASSWORD)
  })

  it('rejects unknown accounts and wrong passwords', async () => {
    await register('first@example.com')
    await createLocalRepository().logout()

    await expect(
      createLocalRepository().login({ email: 'first@example.com', password: OTHER_PASSWORD }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MESSAGE)
    await expect(
      createLocalRepository().login({ email: 'unknown@example.com', password: PASSWORD }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MESSAGE)
  })

  it('signs a known user back in', async () => {
    const user = await register('first@example.com')
    await createLocalRepository().logout()

    expect(await createLocalRepository().currentSession()).toBeNull()
    expect(await createLocalRepository().login({ email: 'First@example.com', password: PASSWORD })).toEqual(
      user,
    )
  })

  it('refuses to read or write data without a session', async () => {
    await expect(createLocalRepository().listProjects()).rejects.toThrow(NOT_SIGNED_IN_MESSAGE)
    await expect(createLocalRepository().listTimeEntries()).rejects.toThrow(NOT_SIGNED_IN_MESSAGE)
    await expect(createLocalRepository().getWorkSettings()).rejects.toThrow(NOT_SIGNED_IN_MESSAGE)
  })

  it('keeps the data of every user separate', async () => {
    await register('first@example.com')
    const project = await createProject('Website Redesign')
    await createLocalRepository().createTimeEntry({
      projectId: project.id,
      startTime: '2026-08-27T08:00:00.000Z',
      endTime: '2026-08-27T09:00:00.000Z',
      note: null,
    })
    await createLocalRepository().updateWorkSettings({
      weeklyTargetMinutes: 2_100,
      workingDays: ['monday'],
      weekStartsOn: 'monday',
    })

    await register('second@example.com', OTHER_PASSWORD)

    expect(await createLocalRepository().listProjects()).toEqual([])
    expect(await createLocalRepository().listTimeEntries()).toEqual([])
    expect((await createLocalRepository().getWorkSettings()).weeklyTargetMinutes).toBe(2_400)

    await createLocalRepository().login({ email: 'first@example.com', password: PASSWORD })

    expect(await createLocalRepository().listProjects()).toHaveLength(1)
    expect(await createLocalRepository().listTimeEntries()).toHaveLength(1)
    expect((await createLocalRepository().getWorkSettings()).weeklyTargetMinutes).toBe(2_100)
  })

  it('hands data of the former single-user storage to the first user', async () => {
    globalThis.localStorage?.setItem(
      'work-time-tracker.projects',
      JSON.stringify([
        {
          id: 1,
          name: 'Website Redesign',
          description: null,
          color: '#22c55e',
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    )

    await register('first@example.com')

    expect(await createLocalRepository().listProjects()).toHaveLength(1)
    expect(globalThis.localStorage?.getItem('work-time-tracker.projects')).toBeNull()

    await register('second@example.com', OTHER_PASSWORD)

    expect(await createLocalRepository().listProjects()).toEqual([])
  })
})

describe('local repository projects', () => {
  beforeEach(async () => {
    await register('first@example.com')
  })

  it('lists projects in alphabetical order', async () => {
    await createProject('Website Redesign')
    await createProject('API Migration')

    expect((await createLocalRepository().listProjects()).map(({ name }) => name)).toEqual([
      'API Migration',
      'Website Redesign',
    ])
  })

  it('assigns increasing ids and timestamps on creation', async () => {
    const first = await createProject('Website Redesign')
    const second = await createProject('API Migration')

    expect(second.id).toBe(first.id + 1)
    expect(first.createdAt).toBe(first.updatedAt)
  })

  it('rejects a project without a name', async () => {
    await expect(
      createLocalRepository().createProject({ name: '  ', description: null, color: '#22c55e', active: true }),
    ).rejects.toThrow('Project name is required')
  })

  it('rejects a color that is no hex value', async () => {
    await expect(
      createLocalRepository().createProject({ name: 'Website', description: null, color: 'green', active: true }),
    ).rejects.toThrow('Choose a project color')
  })

  it('updates a project and keeps its creation time', async () => {
    const project = await createProject('Website Redesign')

    const updated = await createLocalRepository().updateProject(project.id, {
      name: 'Website Relaunch',
      description: 'Second iteration',
      color: '#3b82f6',
      active: false,
    })

    expect(updated).toMatchObject({
      id: project.id,
      name: 'Website Relaunch',
      description: 'Second iteration',
      color: '#3b82f6',
      active: false,
      createdAt: project.createdAt,
    })
  })

  it('rejects an update of an unknown project', async () => {
    await expect(
      createLocalRepository().updateProject(404, {
        name: 'Ghost',
        description: null,
        color: '#22c55e',
        active: true,
      }),
    ).rejects.toThrow('Project not found')
  })

  it('keeps the time entries of a deleted project without their project', async () => {
    const project = await createProject('Website Redesign')
    await createLocalRepository().createTimeEntry({
      projectId: project.id,
      startTime: '2026-08-27T08:00:00.000Z',
      endTime: '2026-08-27T09:00:00.000Z',
      note: null,
    })
    await createLocalRepository().createProjectBudget({
      projectId: project.id,
      budgetMinutes: 600,
      dueDate: '2026-12-31',
    })

    await createLocalRepository().deleteProject(project.id)

    expect(await createLocalRepository().listProjects()).toEqual([])
    expect(await createLocalRepository().listProjectBudgets()).toEqual([])
    expect((await createLocalRepository().listTimeEntries())[0].projectId).toBeNull()
    expect((await createLocalRepository().listTimeEntryAudits()).at(0)).toMatchObject({
      action: 'updated',
      oldValue: expect.stringContaining(`"projectId":${project.id}`),
      newValue: expect.stringContaining('"projectId":null'),
    })
  })
})

describe('local repository time entries', () => {
  let projectId: number

  beforeEach(async () => {
    await register('first@example.com')
    projectId = (await createProject('Website Redesign')).id
  })

  async function createEntry(startTime: string, endTime: string | null, note: string | null = null) {
    return createLocalRepository().createTimeEntry({ projectId, startTime, endTime, note })
  }

  it('lists entries ordered by their start time', async () => {
    await createEntry('2026-08-27T12:00:00.000Z', '2026-08-27T13:00:00.000Z')
    await createEntry('2026-08-27T08:00:00.000Z', '2026-08-27T09:00:00.000Z')

    expect((await createLocalRepository().listTimeEntries()).map(({ startTime }) => startTime)).toEqual([
      '2026-08-27T08:00:00.000Z',
      '2026-08-27T12:00:00.000Z',
    ])
  })

  it('requires a project', async () => {
    await expect(
      createLocalRepository().createTimeEntry({
        projectId: null,
        startTime: '2026-08-27T08:00:00.000Z',
        endTime: '2026-08-27T09:00:00.000Z',
        note: null,
      }),
    ).rejects.toThrow('Project is required')
  })

  it('rejects an end time before the start time', async () => {
    await expect(createEntry('2026-08-27T09:00:00.000Z', '2026-08-27T08:00:00.000Z')).rejects.toThrow(
      ORDER_MESSAGE,
    )
  })

  it('rejects overlapping entries but allows adjacent ones', async () => {
    await createEntry('2026-08-27T08:00:00.000Z', '2026-08-27T09:00:00.000Z')

    await expect(createEntry('2026-08-27T08:30:00.000Z', '2026-08-27T09:30:00.000Z')).rejects.toThrow(
      OVERLAP_MESSAGE,
    )
    await expect(createEntry('2026-08-27T09:00:00.000Z', '2026-08-27T10:00:00.000Z')).resolves.toBeTruthy()
  })

  it('treats a running entry as open ended', async () => {
    await createEntry('2026-08-27T08:00:00.000Z', null)

    await expect(createEntry('2026-08-27T18:00:00.000Z', '2026-08-27T19:00:00.000Z')).rejects.toThrow(
      OVERLAP_MESSAGE,
    )
  })

  it('updates an entry without counting it as its own overlap', async () => {
    const entry = await createEntry('2026-08-27T08:00:00.000Z', '2026-08-27T09:00:00.000Z')

    const updated = await createLocalRepository().updateTimeEntry(entry.id, {
      projectId,
      startTime: '2026-08-27T08:00:00.000Z',
      endTime: '2026-08-27T10:00:00.000Z',
      note: 'Longer than planned',
    })

    expect(updated).toMatchObject({ endTime: '2026-08-27T10:00:00.000Z', note: 'Longer than planned' })
  })

  it('rejects an update that overlaps another entry', async () => {
    await createEntry('2026-08-27T08:00:00.000Z', '2026-08-27T09:00:00.000Z')
    const second = await createEntry('2026-08-27T10:00:00.000Z', '2026-08-27T11:00:00.000Z')

    await expect(
      createLocalRepository().updateTimeEntry(second.id, {
        projectId,
        startTime: '2026-08-27T08:30:00.000Z',
        endTime: '2026-08-27T11:00:00.000Z',
        note: null,
      }),
    ).rejects.toThrow(OVERLAP_MESSAGE)
  })

  it('does not let an existing break be booked to a project', async () => {
    const breakEntry = await createLocalRepository().createTimeEntry({
      projectId: null,
      startTime: '2026-08-27T08:00:00.000Z',
      endTime: '2026-08-27T08:15:00.000Z',
      entryType: 'break',
      note: null,
    })

    await expect(
      createLocalRepository().updateTimeEntry(breakEntry.id, {
        projectId,
        startTime: breakEntry.startTime,
        endTime: breakEntry.endTime,
        note: null,
      }),
    ).rejects.toThrow(BREAK_PROJECT_MESSAGE)
  })

  it('rejects an update of an unknown entry', async () => {
    await expect(
      createLocalRepository().updateTimeEntry(404, {
        projectId,
        startTime: '2026-08-27T08:00:00.000Z',
        endTime: '2026-08-27T09:00:00.000Z',
        note: null,
      }),
    ).rejects.toThrow('Time entry not found')
  })

  it('trims a note and clears an empty one', async () => {
    const entry = await createEntry('2026-08-27T08:00:00.000Z', '2026-08-27T09:00:00.000Z', 'Draft')

    expect((await createLocalRepository().updateTimeEntryNote(entry.id, '  Reviewed  ')).note).toBe('Reviewed')
    expect((await createLocalRepository().updateTimeEntryNote(entry.id, '   ')).note).toBeNull()
    await expect(createLocalRepository().updateTimeEntryNote(404, 'Ghost')).rejects.toThrow(
      'Time entry not found',
    )
  })

  it('closes the running entry and starts the next one at the same timestamp', async () => {
    const running = await createEntry('2026-08-27T08:00:00.000Z', null)
    const other = await createProject('API Migration')

    const created = await createLocalRepository().switchRunningTimeEntry(running.id, {
      projectId: other.id,
      startTime: '2026-08-27T09:00:00.000Z',
      endTime: null,
      note: null,
    })

    const entries = await createLocalRepository().listTimeEntries()

    expect(entries).toHaveLength(2)
    expect(entries[0].endTime).toBe('2026-08-27T09:00:00.000Z')
    expect(created).toMatchObject({ projectId: other.id, endTime: null })
  })

  it('refuses to switch a timer that is not running or moves backwards', async () => {
    const closed = await createEntry('2026-08-27T08:00:00.000Z', '2026-08-27T09:00:00.000Z')
    const running = await createEntry('2026-08-27T10:00:00.000Z', null)
    const input = { projectId, startTime: '2026-08-27T11:00:00.000Z', endTime: null, note: null }

    await expect(createLocalRepository().switchRunningTimeEntry(404, input)).rejects.toThrow(
      'Time entry not found',
    )
    await expect(createLocalRepository().switchRunningTimeEntry(closed.id, input)).rejects.toThrow(
      'Timer is not running',
    )
    await expect(
      createLocalRepository().switchRunningTimeEntry(running.id, {
        ...input,
        startTime: '2026-08-27T09:30:00.000Z',
      }),
    ).rejects.toThrow(ORDER_MESSAGE)
    await expect(
      createLocalRepository().switchRunningTimeEntry(running.id, { ...input, projectId: null }),
    ).rejects.toThrow('Invalid timer switch')
    await expect(
      createLocalRepository().switchRunningTimeEntry(running.id, {
        ...input,
        endTime: '2026-08-27T12:00:00.000Z',
      }),
    ).rejects.toThrow('Invalid timer switch')
  })

  it('deletes an entry and ignores an unknown id', async () => {
    const entry = await createEntry('2026-08-27T08:00:00.000Z', '2026-08-27T09:00:00.000Z')

    await createLocalRepository().deleteTimeEntry(entry.id)
    await createLocalRepository().deleteTimeEntry(404)

    expect(await createLocalRepository().listTimeEntries()).toEqual([])
  })

  it('records a break without a project and rejects a break on a project', async () => {
    const entry = await createLocalRepository().createTimeEntry({
      projectId: null,
      startTime: '2026-08-27T12:00:00.000Z',
      endTime: '2026-08-27T12:30:00.000Z',
      entryType: 'break',
      note: null,
    })

    expect(entry.entryType).toBe('break')
    await expect(
      createLocalRepository().createTimeEntry({
        projectId,
        startTime: '2026-08-27T13:00:00.000Z',
        endTime: '2026-08-27T13:30:00.000Z',
        entryType: 'break',
        note: null,
      }),
    ).rejects.toThrow(BREAK_PROJECT_MESSAGE)
  })

  it('keeps an audit trail with actor and old and new values', async () => {
    const entry = await createEntry('2026-08-27T08:00:00.000Z', '2026-08-27T09:00:00.000Z')
    await createLocalRepository().updateTimeEntry(entry.id, {
      projectId,
      startTime: '2026-08-27T08:00:00.000Z',
      endTime: '2026-08-27T10:00:00.000Z',
      note: null,
    })
    await createLocalRepository().deleteTimeEntry(entry.id)

    const audits = await createLocalRepository().listTimeEntryAudits()

    expect(audits.map(({ action }) => action)).toEqual(['deleted', 'updated', 'created'])
    expect(audits.every(({ actor }) => actor === 'first@example.com')).toBe(true)
    expect(audits.every(({ timeEntryId }) => timeEntryId === entry.id)).toBe(true)
    expect(audits[0].newValue).toBeNull()
    expect(auditFieldChanges(audits[1])).toEqual([
      { field: 'endTime', from: '2026-08-27T09:00:00.000Z', to: '2026-08-27T10:00:00.000Z' },
    ])
    expect(audits[2].oldValue).toBeNull()
  })

  it('keeps the audit trail after the entry is gone', async () => {
    const entry = await createEntry('2026-08-27T08:00:00.000Z', '2026-08-27T09:00:00.000Z')
    await createLocalRepository().deleteTimeEntry(entry.id)

    expect(await createLocalRepository().listTimeEntries()).toEqual([])
    expect(await createLocalRepository().listTimeEntryAudits()).toHaveLength(2)
  })

  it('does not reuse deleted entry IDs that remain in the audit trail', async () => {
    const entry = await createEntry('2026-08-27T08:00:00.000Z', '2026-08-27T09:00:00.000Z')
    await createLocalRepository().deleteTimeEntry(entry.id)
    const replacement = await createEntry('2026-08-27T10:00:00.000Z', '2026-08-27T11:00:00.000Z')

    expect(replacement.id).toBeGreaterThan(entry.id)
  })

  it('keeps the trail that was recorded under the released audit key', async () => {
    const user = await createLocalRepository().currentSession()
    globalThis.localStorage?.setItem(
      `work-time-tracker.${user?.id}.audit-log`,
      JSON.stringify([
        {
          id: 1,
          entity: 'timeEntry',
          entityId: 42,
          action: 'update',
          oldValue: '{"note":"before"}',
          newValue: '{"note":"after"}',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    )

    expect(await createLocalRepository().listTimeEntryAudits()).toEqual([
      {
        id: 1,
        timeEntryId: 42,
        action: 'updated',
        actor: 'first@example.com',
        oldValue: '{"note":"before"}',
        newValue: '{"note":"after"}',
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
  })
})

describe('local repository budgets and settings', () => {
  let projectId: number

  beforeEach(async () => {
    await register('first@example.com')
    projectId = (await createProject('Website Redesign')).id
  })

  it('lists budgets ordered by their due date', async () => {
    const other = await createProject('API Migration')
    await createLocalRepository().createProjectBudget({ projectId, budgetMinutes: 600, dueDate: '2026-12-31' })
    await createLocalRepository().createProjectBudget({
      projectId: other.id,
      budgetMinutes: 1_200,
      dueDate: '2026-06-30',
    })

    expect((await createLocalRepository().listProjectBudgets()).map(({ dueDate }) => dueDate)).toEqual([
      '2026-06-30',
      '2026-12-31',
    ])
  })

  it('allows one budget per project only', async () => {
    await createLocalRepository().createProjectBudget({ projectId, budgetMinutes: 600, dueDate: '2026-12-31' })

    await expect(
      createLocalRepository().createProjectBudget({ projectId, budgetMinutes: 900, dueDate: '2027-01-31' }),
    ).rejects.toThrow(DUPLICATE_BUDGET_MESSAGE)
  })

  it('rejects a budget without hours or with an invalid due date', async () => {
    await expect(
      createLocalRepository().createProjectBudget({ projectId, budgetMinutes: 0, dueDate: '2026-12-31' }),
    ).rejects.toThrow('Budget must be greater than zero hours')
    await expect(
      createLocalRepository().createProjectBudget({ projectId, budgetMinutes: 600, dueDate: '2026-02-31' }),
    ).rejects.toThrow('Due date must be a valid calendar date')
  })

  it('updates a budget and keeps it unique per project', async () => {
    const other = await createProject('API Migration')
    const budget = await createLocalRepository().createProjectBudget({
      projectId,
      budgetMinutes: 600,
      dueDate: '2026-12-31',
    })
    const second = await createLocalRepository().createProjectBudget({
      projectId: other.id,
      budgetMinutes: 900,
      dueDate: '2026-11-30',
    })

    const updated = await createLocalRepository().updateProjectBudget(budget.id, {
      projectId,
      budgetMinutes: 1_500,
      dueDate: '2027-01-31',
    })

    expect(updated).toMatchObject({ budgetMinutes: 1_500, dueDate: '2027-01-31' })
    await expect(
      createLocalRepository().updateProjectBudget(second.id, {
        projectId,
        budgetMinutes: 900,
        dueDate: '2026-11-30',
      }),
    ).rejects.toThrow(DUPLICATE_BUDGET_MESSAGE)
    await expect(
      createLocalRepository().updateProjectBudget(404, { projectId, budgetMinutes: 60, dueDate: '2027-01-31' }),
    ).rejects.toThrow('Budget not found')
  })

  it('deletes a budget', async () => {
    const budget = await createLocalRepository().createProjectBudget({
      projectId,
      budgetMinutes: 600,
      dueDate: '2026-12-31',
    })

    await createLocalRepository().deleteProjectBudget(budget.id)

    expect(await createLocalRepository().listProjectBudgets()).toEqual([])
  })

  it('returns the defaults until settings are saved', async () => {
    expect(await createLocalRepository().getWorkSettings()).toEqual(DEFAULT_WORK_SETTINGS)

    const saved = await createLocalRepository().updateWorkSettings({
      weeklyTargetMinutes: 1_800,
      workingDays: ['friday', 'monday'],
      weekStartsOn: 'sunday',
    })

    expect(saved.workingDays).toEqual(['monday', 'friday'])
    expect(await createLocalRepository().getWorkSettings()).toEqual(saved)
  })

  it('rejects settings without a working day', async () => {
    await expect(
      createLocalRepository().updateWorkSettings({
        weeklyTargetMinutes: 1_800,
        workingDays: [],
        weekStartsOn: 'monday',
      }),
    ).rejects.toThrow(NO_WORKING_DAY_MESSAGE)
  })

  it('falls back to the defaults when the stored settings are corrupt', async () => {
    const key = `work-time-tracker.${(await createLocalRepository().currentSession())?.id}.work-settings`
    globalThis.localStorage?.setItem(key, '{ not json')

    expect(await createLocalRepository().getWorkSettings()).toEqual(DEFAULT_WORK_SETTINGS)
  })

  it('reports no application version in the browser', async () => {
    expect(await createLocalRepository().getAppVersion()).toBeNull()
  })
})

describe('local repository session handling', () => {
  function sessions(): Record<string, { userId: number; expiresAt: number }> {
    return JSON.parse(globalThis.localStorage?.getItem('work-time-tracker.sessions') ?? '{}')
  }

  it('keeps an opaque token instead of the user id', async () => {
    const user = await register('first@example.com')
    const token = globalThis.sessionStorage?.getItem('work-time-tracker.session') ?? ''

    expect(token).toHaveLength(64)
    expect(token).not.toBe(String(user.id))
    expect(sessions()[token]?.userId).toBe(user.id)
  })

  it('refuses a token that was not handed out', async () => {
    await register('first@example.com')
    globalThis.sessionStorage?.setItem('work-time-tracker.session', '1')

    expect(await createLocalRepository().currentSession()).toBeNull()
    await expect(createLocalRepository().listProjects()).rejects.toThrow(NOT_SIGNED_IN_MESSAGE)
  })

  it('ends an idle session', async () => {
    await register('first@example.com')
    const token = globalThis.sessionStorage?.getItem('work-time-tracker.session') ?? ''
    const session = sessions()[token]
    globalThis.localStorage?.setItem(
      'work-time-tracker.sessions',
      JSON.stringify({ [token]: { ...session, expiresAt: Date.now() - 1 } }),
    )

    expect(await createLocalRepository().currentSession()).toBeNull()
    expect(sessions()).toEqual({})
  })

  it('extends the session while it is used', async () => {
    await register('first@example.com')
    const token = globalThis.sessionStorage?.getItem('work-time-tracker.session') ?? ''
    const expiresAt = sessions()[token]?.expiresAt ?? 0
    globalThis.localStorage?.setItem(
      'work-time-tracker.sessions',
      JSON.stringify({ [token]: { userId: 1, expiresAt: Date.now() + 1_000 } }),
    )

    await createLocalRepository().currentSession()

    expect(sessions()[token]?.expiresAt).toBeGreaterThanOrEqual(expiresAt - 1_000)
  })

  it('forgets the session of the former user on logout', async () => {
    await register('first@example.com')
    await createLocalRepository().logout()

    expect(sessions()).toEqual({})
    expect(await createLocalRepository().currentSession()).toBeNull()
  })
})

describe('local repository error kinds', () => {
  it('reports the kind of a rejected call', async () => {
    await expect(createLocalRepository().listProjects()).rejects.toMatchObject({ kind: 'notSignedIn' })

    await register('first@example.com')

    await expect(register('first@example.com')).rejects.toMatchObject({ kind: 'conflict' })
    await expect(register('invalid', PASSWORD)).rejects.toMatchObject({ kind: 'validation' })
    await expect(createLocalRepository().updateProject(404, projectInput())).rejects.toMatchObject({
      kind: 'notFound',
    })
    const project = await createProject('Website Redesign')
    await createLocalRepository().createTimeEntry({
      projectId: project.id,
      startTime: '2026-08-27T08:00:00.000Z',
      endTime: '2026-08-27T09:00:00.000Z',
      note: null,
    })
    await expect(
      createLocalRepository().createTimeEntry({
        projectId: project.id,
        startTime: '2026-08-27T08:30:00.000Z',
        endTime: '2026-08-27T10:00:00.000Z',
        note: null,
      }),
    ).rejects.toMatchObject({ kind: 'conflict', message: OVERLAP_MESSAGE })
  })

  it('locks an account out after too many failed logins', async () => {
    await register('locked@example.com')
    await createLocalRepository().logout()

    for (let attempt = 0; attempt < MAX_LOGIN_ATTEMPTS; attempt += 1) {
      await expect(
        createLocalRepository().login({ email: 'locked@example.com', password: OTHER_PASSWORD }),
      ).rejects.toMatchObject({ kind: 'validation', message: INVALID_CREDENTIALS_MESSAGE })
    }

    await expect(
      createLocalRepository().login({ email: 'locked@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({ kind: 'rateLimited', message: LOCKED_OUT_MESSAGE })
  })

  it('does not count invalid credentials toward lockout', async () => {
    await register('validation@example.com')
    await createLocalRepository().logout()

    await expect(
      createLocalRepository().login({ email: 'validation@example.com', password: '' }),
    ).rejects.toMatchObject({ kind: 'validation', message: 'Password is required' })

    for (let attempt = 0; attempt < MAX_LOGIN_ATTEMPTS; attempt += 1) {
      await expect(
        createLocalRepository().login({ email: 'validation@example.com', password: OTHER_PASSWORD }),
      ).rejects.toMatchObject({ kind: 'validation', message: INVALID_CREDENTIALS_MESSAGE })
    }

    await expect(
      createLocalRepository().login({ email: 'validation@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({ kind: 'rateLimited', message: LOCKED_OUT_MESSAGE })
  })
})
