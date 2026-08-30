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
const SETTINGS = { weeklyTargetMinutes: 2400, workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], weekStartsOn: 'monday' }

beforeEach(() => {
  mockInvoke.mockReset()
})

describe('tauriRepository – auth', () => {
  test('currentSession invokes current_session with empty args', async () => {
    mockInvoke.mockResolvedValue(USER)
    const result = await tauriRepository.currentSession()
    expect(mockInvoke).toHaveBeenCalledWith('current_session', {})
    expect(result?.email).toBe('user@example.com')
  })

  test('currentSession returns null when invoke returns null', async () => {
    mockInvoke.mockResolvedValue(null)
    const result = await tauriRepository.currentSession()
    expect(result).toBeNull()
  })

  test('register invokes register with credentials', async () => {
    mockInvoke.mockResolvedValue(USER)
    const creds = { email: 'user@example.com', password: 'pw' }
    await tauriRepository.register(creds)
    expect(mockInvoke).toHaveBeenCalledWith('register', { credentials: creds })
  })

  test('login invokes login with credentials', async () => {
    mockInvoke.mockResolvedValue(USER)
    const creds = { email: 'user@example.com', password: 'pw' }
    await tauriRepository.login(creds)
    expect(mockInvoke).toHaveBeenCalledWith('login', { credentials: creds })
  })

  test('logout invokes logout', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await tauriRepository.logout()
    expect(mockInvoke).toHaveBeenCalledWith('logout', {})
  })
})

describe('tauriRepository – projects', () => {
  test('listProjects invokes list_projects', async () => {
    mockInvoke.mockResolvedValue([PROJECT])
    const result = await tauriRepository.listProjects()
    expect(mockInvoke).toHaveBeenCalledWith('list_projects', {})
    expect(result).toHaveLength(1)
  })

  test('createProject invokes create_project with input', async () => {
    mockInvoke.mockResolvedValue(PROJECT)
    const input = { name: 'Test', description: null, color: '#22c55e', active: true }
    await tauriRepository.createProject(input)
    expect(mockInvoke).toHaveBeenCalledWith('create_project', { input })
  })

  test('updateProject invokes update_project with id and input', async () => {
    mockInvoke.mockResolvedValue(PROJECT)
    const input = { name: 'Updated', description: null, color: '#22c55e', active: true }
    await tauriRepository.updateProject(1, input)
    expect(mockInvoke).toHaveBeenCalledWith('update_project', { id: 1, input })
  })

  test('deleteProject invokes delete_project', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await tauriRepository.deleteProject(1)
    expect(mockInvoke).toHaveBeenCalledWith('delete_project', { id: 1 })
  })
})

describe('tauriRepository – time entries', () => {
  test('listTimeEntries invokes list_time_entries', async () => {
    mockInvoke.mockResolvedValue([TIME_ENTRY])
    await tauriRepository.listTimeEntries()
    expect(mockInvoke).toHaveBeenCalledWith('list_time_entries', {})
  })

  test('createTimeEntry invokes create_time_entry', async () => {
    mockInvoke.mockResolvedValue(TIME_ENTRY)
    const input = { projectId: 1, startTime: '2024-01-01T09:00:00Z', endTime: null, note: null }
    await tauriRepository.createTimeEntry(input)
    expect(mockInvoke).toHaveBeenCalledWith('create_time_entry', { input })
  })

  test('updateTimeEntry invokes update_time_entry', async () => {
    mockInvoke.mockResolvedValue(TIME_ENTRY)
    const input = { projectId: 1, startTime: '2024-01-01T09:00:00Z', endTime: '2024-01-01T10:00:00Z', note: null }
    await tauriRepository.updateTimeEntry(1, input)
    expect(mockInvoke).toHaveBeenCalledWith('update_time_entry', { id: 1, input })
  })

  test('listAuditLog invokes list_audit_log', async () => {
    mockInvoke.mockResolvedValue([AUDIT_RECORD])
    const result = await tauriRepository.listAuditLog()
    expect(mockInvoke).toHaveBeenCalledWith('list_audit_log', {})
    expect(result[0].action).toBe('update')
  })

  test('deleteTimeEntry invokes delete_time_entry', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await tauriRepository.deleteTimeEntry(1)
    expect(mockInvoke).toHaveBeenCalledWith('delete_time_entry', { id: 1 })
  })

  test('updateTimeEntryNote invokes update_time_entry_note', async () => {
    mockInvoke.mockResolvedValue(TIME_ENTRY)
    await tauriRepository.updateTimeEntryNote(1, 'note text')
    expect(mockInvoke).toHaveBeenCalledWith('update_time_entry_note', { id: 1, note: 'note text' })
  })

  test('switchRunningTimeEntry invokes switch_running_time_entry', async () => {
    mockInvoke.mockResolvedValue(TIME_ENTRY)
    const input = { projectId: 2, startTime: '2024-01-01T10:00:00Z', endTime: null, note: null }
    await tauriRepository.switchRunningTimeEntry(1, input)
    expect(mockInvoke).toHaveBeenCalledWith('switch_running_time_entry', { id: 1, input })
  })
})

describe('tauriRepository – budgets', () => {
  test('listProjectBudgets invokes list_project_budgets', async () => {
    mockInvoke.mockResolvedValue([BUDGET])
    await tauriRepository.listProjectBudgets()
    expect(mockInvoke).toHaveBeenCalledWith('list_project_budgets', {})
  })

  test('createProjectBudget invokes create_project_budget', async () => {
    mockInvoke.mockResolvedValue(BUDGET)
    const input = { projectId: 1, budgetMinutes: 6000, dueDate: '2024-12-31' }
    await tauriRepository.createProjectBudget(input)
    expect(mockInvoke).toHaveBeenCalledWith('create_project_budget', { input })
  })

  test('updateProjectBudget invokes update_project_budget', async () => {
    mockInvoke.mockResolvedValue(BUDGET)
    await tauriRepository.updateProjectBudget(1, { projectId: 1, budgetMinutes: 8000, dueDate: '2024-12-31' })
    expect(mockInvoke).toHaveBeenCalledWith('update_project_budget', { id: 1, input: { projectId: 1, budgetMinutes: 8000, dueDate: '2024-12-31' } })
  })

  test('deleteProjectBudget invokes delete_project_budget', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await tauriRepository.deleteProjectBudget(1)
    expect(mockInvoke).toHaveBeenCalledWith('delete_project_budget', { id: 1 })
  })
})

describe('tauriRepository – work settings', () => {
  test('getWorkSettings invokes get_work_settings', async () => {
    mockInvoke.mockResolvedValue(SETTINGS)
    const result = await tauriRepository.getWorkSettings()
    expect(mockInvoke).toHaveBeenCalledWith('get_work_settings', {})
    expect(result.weeklyTargetMinutes).toBe(2400)
  })

  test('updateWorkSettings invokes update_work_settings', async () => {
    mockInvoke.mockResolvedValue(SETTINGS)
    await tauriRepository.updateWorkSettings(SETTINGS as Parameters<typeof tauriRepository.updateWorkSettings>[0])
    expect(mockInvoke).toHaveBeenCalledWith('update_work_settings', { settings: SETTINGS })
  })

  test('getAppVersion invokes get_app_version', async () => {
    mockInvoke.mockResolvedValue('1.0.0')
    const version = await tauriRepository.getAppVersion()
    expect(mockInvoke).toHaveBeenCalledWith('get_app_version', {})
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
