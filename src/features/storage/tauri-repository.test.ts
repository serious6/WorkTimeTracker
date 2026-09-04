import { beforeEach, describe, expect, test, vi } from 'vitest'

// Mock must be declared before importing the module under test
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: unknown) => mockInvoke(command, args),
  isTauri: () => false,
}))

// Import after mock is set up
const { tauriRepository } = await import('./tauri-repository')

const USER = { id: 1, email: 'user@example.com', createdAt: '2024-01-01T00:00:00Z' }
const PROJECT = { id: 1, name: 'Test', description: null, color: '#22c55e', active: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }
const TIME_ENTRY = { id: 1, projectId: 1, startTime: '2024-01-01T09:00:00Z', endTime: '2024-01-01T10:00:00Z', note: null, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }
const AUDIT_RECORD = { id: 1, entity: 'timeEntry', entityId: 1, action: 'update', oldValue: '{"projectId":1,"startTime":"2024-01-01T09:00:00Z","endTime":null,"note":null}', newValue: '{"projectId":1,"startTime":"2024-01-01T09:00:00Z","endTime":"2024-01-01T10:00:00Z","note":null}', createdAt: '2024-01-01T10:00:00Z' }
const BUDGET = { id: 1, projectId: 1, budgetMinutes: 6000, dueDate: '2024-12-31', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }
const ABSENCE = { id: 1, type: 'vacation', date: '2026-09-01', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' }
const ABSENCE_AUDIT = { id: 1, absenceId: 1, action: 'created', actor: 'user@example.com', oldValue: null, newValue: '{}', recordedAt: '2026-08-01T00:00:00Z' }
const OVERTIME = { id: 1, effectiveDate: '2026-09-01', minutes: 150, kind: 'opening', origin: 'manual', note: null, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
const OVERTIME_AUDIT = { id: 1, overtimeEntryId: 1, action: 'created', actor: 'user@example.com', oldValue: null, newValue: '{}', recordedAt: '2026-09-01T00:00:00Z' }
const SETTINGS = { weeklyTargetMinutes: 2400, workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], weekStartsOn: 'monday' }

const SESSION_ID = 'a'.repeat(64)

/** Every command carries the id of the session it acts for. */
function invokedWith(command: string, args: Record<string, unknown> = {}) {
  expect(mockInvoke).toHaveBeenCalledWith(command, { sessionId: expect.any(String), ...args })
}

/** Every key and value a page script could read out of the web storage. */
function storedEntries(): string[] {
  return [globalThis.sessionStorage, globalThis.localStorage].flatMap((storage) =>
    storage
      ? Array.from({ length: storage.length }, (_, index) => storage.key(index) ?? '').flatMap(
          (key) => [key, storage.getItem(key) ?? ''],
        )
      : [],
  )
}

beforeEach(async () => {
  mockInvoke.mockReset()
  globalThis.sessionStorage?.clear()
  // The session lives in a module variable, so a test signs out before it runs.
  await tauriRepository.logout()
  mockInvoke.mockReset()
})

describe('tauriRepository – auth', () => {
  test('currentSession invokes current_session with empty args', async () => {
    mockInvoke.mockResolvedValue(USER)
    const result = await tauriRepository.currentSession()
    invokedWith('current_session', {})
    expect(result?.email).toBe('user@example.com')
  })

  test('currentSession returns null when invoke returns null', async () => {
    mockInvoke.mockResolvedValue(null)
    const result = await tauriRepository.currentSession()
    expect(result).toBeNull()
  })

  test('register invokes register with credentials', async () => {
    mockInvoke.mockResolvedValue({ user: USER, sessionId: SESSION_ID })
    const creds = { email: 'user@example.com', password: 'pw' }
    const user = await tauriRepository.register(creds)
    invokedWith('register', { credentials: creds })
    expect(user.email).toBe('user@example.com')
  })

  test('login invokes login with credentials', async () => {
    mockInvoke.mockResolvedValue({ user: USER, sessionId: SESSION_ID })
    const creds = { email: 'user@example.com', password: 'pw' }
    await tauriRepository.login(creds)
    invokedWith('login', { credentials: creds })
  })

  test('login keeps the session id and sends it with the next command', async () => {
    mockInvoke.mockResolvedValue({ user: USER, sessionId: SESSION_ID })
    await tauriRepository.login({ email: 'user@example.com', password: 'pw' })
    mockInvoke.mockResolvedValue([PROJECT])

    await tauriRepository.listProjects()

    expect(mockInvoke).toHaveBeenLastCalledWith('list_projects', { sessionId: SESSION_ID })
  })

  test('login writes the session id into no storage of the webview', async () => {
    mockInvoke.mockResolvedValue({ user: USER, sessionId: SESSION_ID })

    await tauriRepository.login({ email: 'user@example.com', password: 'pw' })

    expect(storedEntries()).not.toContain(SESSION_ID)
    expect(globalThis.document?.cookie ?? '').not.toContain(SESSION_ID)
  })

  test('a reload of the window starts without a session', async () => {
    mockInvoke.mockResolvedValue({ user: USER, sessionId: SESSION_ID })
    await tauriRepository.login({ email: 'user@example.com', password: 'pw' })

    // A reload evaluates the module again; nothing outside it kept the id.
    vi.resetModules()
    const { tauriRepository: reloaded } = await import('./tauri-repository')
    mockInvoke.mockResolvedValue([])

    await reloaded.listProjects()

    expect(mockInvoke).toHaveBeenLastCalledWith('list_projects', { sessionId: '' })
  })

  test('logout invokes logout and forgets the session id', async () => {
    mockInvoke.mockResolvedValue({ user: USER, sessionId: SESSION_ID })
    await tauriRepository.login({ email: 'user@example.com', password: 'pw' })
    mockInvoke.mockResolvedValue(undefined)

    await tauriRepository.logout()
    invokedWith('logout', {})
    await tauriRepository.deleteProject(1)

    expect(mockInvoke).toHaveBeenLastCalledWith('delete_project', { sessionId: '', id: 1 })
  })

  test('logout forgets the session id even when the command fails', async () => {
    mockInvoke.mockResolvedValue({ user: USER, sessionId: SESSION_ID })
    await tauriRepository.login({ email: 'user@example.com', password: 'pw' })
    mockInvoke.mockRejectedValue(new Error('logout failed'))

    await expect(tauriRepository.logout()).rejects.toThrow('logout failed')

    mockInvoke.mockResolvedValue(undefined)
    await tauriRepository.deleteProject(1)

    expect(mockInvoke).toHaveBeenLastCalledWith('delete_project', { sessionId: '', id: 1 })
  })

  test('deleteAccount invokes delete_account and forgets the session id', async () => {
    mockInvoke.mockResolvedValue({ user: USER, sessionId: SESSION_ID })
    await tauriRepository.login({ email: 'user@example.com', password: 'pw' })
    mockInvoke.mockResolvedValue(undefined)

    await tauriRepository.deleteAccount()
    invokedWith('delete_account', {})
    await tauriRepository.deleteProject(1)

    expect(mockInvoke).toHaveBeenLastCalledWith('delete_project', { sessionId: '', id: 1 })
  })
})

describe('tauriRepository – projects', () => {
  test('listProjects invokes list_projects', async () => {
    mockInvoke.mockResolvedValue([PROJECT])
    const result = await tauriRepository.listProjects()
    invokedWith('list_projects', {})
    expect(result).toHaveLength(1)
  })

  test('createProject invokes create_project with input', async () => {
    mockInvoke.mockResolvedValue(PROJECT)
    const input = { name: 'Test', description: null, color: '#22c55e', active: true }
    await tauriRepository.createProject(input)
    invokedWith('create_project', { input })
  })

  test('updateProject invokes update_project with id and input', async () => {
    mockInvoke.mockResolvedValue(PROJECT)
    const input = { name: 'Updated', description: null, color: '#22c55e', active: true }
    await tauriRepository.updateProject(1, input)
    invokedWith('update_project', { id: 1, input })
  })

  test('deleteProject invokes delete_project', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await tauriRepository.deleteProject(1)
    invokedWith('delete_project', { id: 1 })
  })
})

describe('tauriRepository – time entries', () => {
  test('listTimeEntries invokes list_time_entries', async () => {
    mockInvoke.mockResolvedValue([TIME_ENTRY])
    await tauriRepository.listTimeEntries()
    invokedWith('list_time_entries', { range: undefined })
  })

  test('listTimeEntries passes the asked window to the backend', async () => {
    mockInvoke.mockResolvedValue([])
    const range = { from: '2026-08-01', to: '2026-09-01' }

    await tauriRepository.listTimeEntries(range)

    invokedWith('list_time_entries', { range })
  })

  test('createTimeEntry invokes create_time_entry', async () => {
    mockInvoke.mockResolvedValue(TIME_ENTRY)
    const input = { projectId: 1, startTime: '2024-01-01T09:00:00Z', endTime: null, note: null }
    await tauriRepository.createTimeEntry(input)
    invokedWith('create_time_entry', { input })
  })

  test('updateTimeEntry invokes update_time_entry', async () => {
    mockInvoke.mockResolvedValue(TIME_ENTRY)
    const input = { projectId: 1, startTime: '2024-01-01T09:00:00Z', endTime: '2024-01-01T10:00:00Z', note: null }
    await tauriRepository.updateTimeEntry(1, input)
    invokedWith('update_time_entry', { id: 1, input })
  })

  test('listAuditLog invokes list_audit_log', async () => {
    mockInvoke.mockResolvedValue([AUDIT_RECORD])
    const result = await tauriRepository.listAuditLog()
    invokedWith('list_audit_log', { range: undefined })
    expect(result[0].action).toBe('update')
  })

  test('listAuditLog passes the asked window to the backend', async () => {
    mockInvoke.mockResolvedValue([])
    const range = { from: '2026-08-01', to: '2026-09-01' }

    await tauriRepository.listAuditLog(range)

    invokedWith('list_audit_log', { range })
  })

  test('deleteTimeEntry invokes delete_time_entry', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await tauriRepository.deleteTimeEntry(1)
    invokedWith('delete_time_entry', { id: 1 })
  })

  test('updateTimeEntryNote invokes update_time_entry_note', async () => {
    mockInvoke.mockResolvedValue(TIME_ENTRY)
    await tauriRepository.updateTimeEntryNote(1, 'note text')
    invokedWith('update_time_entry_note', { id: 1, note: 'note text' })
  })

  test('switchRunningTimeEntry invokes switch_running_time_entry', async () => {
    mockInvoke.mockResolvedValue(TIME_ENTRY)
    const input = { projectId: 2, startTime: '2024-01-01T10:00:00Z', endTime: null, note: null }
    await tauriRepository.switchRunningTimeEntry(1, input)
    invokedWith('switch_running_time_entry', { id: 1, input })
  })
})

describe('tauriRepository – budgets', () => {
  test('listProjectBudgets invokes list_project_budgets', async () => {
    mockInvoke.mockResolvedValue([BUDGET])
    await tauriRepository.listProjectBudgets()
    invokedWith('list_project_budgets', {})
  })

  test('createProjectBudget invokes create_project_budget', async () => {
    mockInvoke.mockResolvedValue(BUDGET)
    const input = { projectId: 1, budgetMinutes: 6000, dueDate: '2024-12-31' }
    await tauriRepository.createProjectBudget(input)
    invokedWith('create_project_budget', { input })
  })

  test('updateProjectBudget invokes update_project_budget', async () => {
    mockInvoke.mockResolvedValue(BUDGET)
    await tauriRepository.updateProjectBudget(1, { projectId: 1, budgetMinutes: 8000, dueDate: '2024-12-31' })
    invokedWith('update_project_budget', { id: 1, input: { projectId: 1, budgetMinutes: 8000, dueDate: '2024-12-31' } })
  })

  test('deleteProjectBudget invokes delete_project_budget', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await tauriRepository.deleteProjectBudget(1)
    invokedWith('delete_project_budget', { id: 1 })
  })
})

describe('tauriRepository – absences', () => {
  test('listAbsences invokes list_absences', async () => {
    mockInvoke.mockResolvedValue([ABSENCE])
    const result = await tauriRepository.listAbsences()
    invokedWith('list_absences', { range: undefined })
    expect(result[0].type).toBe('vacation')
  })

  test('listAbsences passes the asked window to the backend', async () => {
    mockInvoke.mockResolvedValue([])
    const range = { from: '2026-08-01', to: '2026-09-01' }

    await tauriRepository.listAbsences(range)

    invokedWith('list_absences', { range })
  })

  test('createAbsence invokes create_absence', async () => {
    mockInvoke.mockResolvedValue(ABSENCE)
    const input = { type: 'vacation', date: '2026-09-01' } as const
    await tauriRepository.createAbsence(input)
    invokedWith('create_absence', { input })
  })

  test('updateAbsence invokes update_absence', async () => {
    mockInvoke.mockResolvedValue({ ...ABSENCE, type: 'sick' })
    const input = { type: 'sick', date: '2026-09-01' } as const
    await tauriRepository.updateAbsence(1, input)
    invokedWith('update_absence', { id: 1, input })
  })

  test('saveAbsences invokes one bulk command', async () => {
    mockInvoke.mockResolvedValue([ABSENCE])
    const inputs = [{ type: 'vacation', date: '2026-09-01' }] as const
    await tauriRepository.saveAbsences([...inputs], [2], 1)
    invokedWith('save_absences', {
      inputs,
      replacementIds: [2],
      updateId: 1,
    })
  })

  test('deleteAbsence invokes delete_absence', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await tauriRepository.deleteAbsence(1)
    invokedWith('delete_absence', { id: 1 })
  })

  test('listAbsenceAudits invokes list_absence_audits', async () => {
    mockInvoke.mockResolvedValue([ABSENCE_AUDIT])
    const result = await tauriRepository.listAbsenceAudits()
    invokedWith('list_absence_audits', {})
    expect(result[0].action).toBe('created')
  })

  test('listAbsenceAudits passes the asked window to the backend', async () => {
    mockInvoke.mockResolvedValue([])
    const range = { from: '2026-08-01', to: '2026-09-01', limit: 5000 }

    await tauriRepository.listAbsenceAudits(range)

    invokedWith('list_absence_audits', { range })
  })
})

describe('tauriRepository – overtime', () => {
  test('listOvertimeEntries invokes list_overtime_entries', async () => {
    mockInvoke.mockResolvedValue([OVERTIME])
    const result = await tauriRepository.listOvertimeEntries()
    invokedWith('list_overtime_entries', {})
    expect(result[0].kind).toBe('opening')
    expect(result[0].minutes).toBe(150)
  })

  test('listOvertimeEntries rejects a malformed response', async () => {
    mockInvoke.mockResolvedValue([{ ...OVERTIME, kind: 'unknown' }])
    await expect(tauriRepository.listOvertimeEntries()).rejects.toThrow()
  })

  test('createOvertimeEntry invokes create_overtime_entry', async () => {
    mockInvoke.mockResolvedValue(OVERTIME)
    const input = {
      effectiveDate: '2026-09-01',
      minutes: 150,
      kind: 'opening',
      origin: 'manual',
      note: null,
    } as const
    const result = await tauriRepository.createOvertimeEntry(input)
    invokedWith('create_overtime_entry', { input })
    expect(result.origin).toBe('manual')
  })

  test('updateOvertimeEntry invokes update_overtime_entry', async () => {
    mockInvoke.mockResolvedValue({ ...OVERTIME, minutes: -60, kind: 'adjustment' })
    const input = {
      effectiveDate: '2026-09-02',
      minutes: -60,
      kind: 'adjustment',
      origin: 'manual',
      note: 'corrected',
    } as const
    const result = await tauriRepository.updateOvertimeEntry(1, input)
    invokedWith('update_overtime_entry', { id: 1, input })
    expect(result.minutes).toBe(-60)
  })

  test('deleteOvertimeEntry invokes delete_overtime_entry', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await tauriRepository.deleteOvertimeEntry(1)
    invokedWith('delete_overtime_entry', { id: 1 })
  })

  test('listOvertimeAudits invokes list_overtime_audits', async () => {
    mockInvoke.mockResolvedValue([OVERTIME_AUDIT])
    const result = await tauriRepository.listOvertimeAudits()
    invokedWith('list_overtime_audits', {})
    expect(result[0].overtimeEntryId).toBe(1)
  })

  test('listOvertimeAudits passes the asked window to the backend', async () => {
    mockInvoke.mockResolvedValue([])
    const range = { from: '2026-08-01', to: '2026-09-01', limit: 5000 }

    await tauriRepository.listOvertimeAudits(range)

    invokedWith('list_overtime_audits', { range })
  })
})

describe('tauriRepository – work settings', () => {
  test('getWorkSettings invokes get_work_settings', async () => {
    mockInvoke.mockResolvedValue(SETTINGS)
    const result = await tauriRepository.getWorkSettings()
    invokedWith('get_work_settings', {})
    expect(result.weeklyTargetMinutes).toBe(2400)
  })

  test('updateWorkSettings invokes update_work_settings', async () => {
    mockInvoke.mockResolvedValue(SETTINGS)
    await tauriRepository.updateWorkSettings(SETTINGS as Parameters<typeof tauriRepository.updateWorkSettings>[0])
    invokedWith('update_work_settings', { settings: SETTINGS })
  })

  test('getAppVersion invokes get_app_version', async () => {
    mockInvoke.mockResolvedValue('1.0.0')
    const version = await tauriRepository.getAppVersion()
    invokedWith('get_app_version', {})
    expect(version).toBe('1.0.0')
  })
})

describe('tauriRepository – error handling', () => {
  test('wraps non-Error invoke rejections as Error', async () => {
    mockInvoke.mockRejectedValue('string error')
    await expect(tauriRepository.listProjects()).rejects.toThrow('string error')
  })

  test('passes through Error instances', async () => {
    mockInvoke.mockRejectedValue(new Error('original error'))
    await expect(tauriRepository.listProjects()).rejects.toThrow('original error')
  })

  test('throws when schema parse fails', async () => {
    mockInvoke.mockResolvedValue({ invalid: 'data' })
    await expect(tauriRepository.getWorkSettings()).rejects.toThrow()
  })
})
