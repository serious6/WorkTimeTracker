import { beforeEach, describe, expect, it } from 'vitest'
import {
  DUPLICATE_EMAIL_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  PASSWORD_POLICY_MESSAGE,
} from '@/features/auth/auth-schema'
import { localRepository, NOT_SIGNED_IN_MESSAGE } from './local-repository'

const PASSWORD = 'Str0ng-Passphrase!!x'
const OTHER_PASSWORD = 'An0ther-Passphrase!!x'

async function register(email: string, password = PASSWORD) {
  return localRepository.register({ email, password })
}

async function createProject(name: string) {
  return localRepository.createProject({ name, description: null, color: '#22c55e', active: true })
}

beforeEach(async () => {
  await localRepository.logout()
  globalThis.localStorage?.clear()
  globalThis.sessionStorage?.clear()
})

describe('local repository authentication', () => {
  it('signs the new account in right away', async () => {
    const user = await register('First@Example.com')

    expect(user.email).toBe('first@example.com')
    expect(await localRepository.currentSession()).toEqual(user)
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
    await localRepository.logout()

    await expect(
      localRepository.login({ email: 'first@example.com', password: OTHER_PASSWORD }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MESSAGE)
    await expect(
      localRepository.login({ email: 'unknown@example.com', password: PASSWORD }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MESSAGE)
  })

  it('signs a known user back in', async () => {
    const user = await register('first@example.com')
    await localRepository.logout()

    expect(await localRepository.currentSession()).toBeNull()
    expect(await localRepository.login({ email: 'First@example.com', password: PASSWORD })).toEqual(
      user,
    )
  })

  it('refuses to read or write data without a session', async () => {
    await expect(localRepository.listProjects()).rejects.toThrow(NOT_SIGNED_IN_MESSAGE)
    await expect(localRepository.listTimeEntries()).rejects.toThrow(NOT_SIGNED_IN_MESSAGE)
    await expect(localRepository.getWorkSettings()).rejects.toThrow(NOT_SIGNED_IN_MESSAGE)
  })

  it('keeps the data of every user separate', async () => {
    await register('first@example.com')
    const project = await createProject('Website Redesign')
    await localRepository.createTimeEntry({
      projectId: project.id,
      startTime: '2026-08-27T08:00:00.000Z',
      endTime: '2026-08-27T09:00:00.000Z',
      note: null,
    })
    await localRepository.updateWorkSettings({
      weeklyTargetMinutes: 2_100,
      workingDays: ['monday'],
      weekStartsOn: 'monday',
    })

    await register('second@example.com', OTHER_PASSWORD)

    expect(await localRepository.listProjects()).toEqual([])
    expect(await localRepository.listTimeEntries()).toEqual([])
    expect((await localRepository.getWorkSettings()).weeklyTargetMinutes).toBe(2_400)

    await localRepository.login({ email: 'first@example.com', password: PASSWORD })

    expect(await localRepository.listProjects()).toHaveLength(1)
    expect(await localRepository.listTimeEntries()).toHaveLength(1)
    expect((await localRepository.getWorkSettings()).weeklyTargetMinutes).toBe(2_100)
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

    expect(await localRepository.listProjects()).toHaveLength(1)
    expect(globalThis.localStorage?.getItem('work-time-tracker.projects')).toBeNull()

    await register('second@example.com', OTHER_PASSWORD)

    expect(await localRepository.listProjects()).toEqual([])
  })
})
