import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mockInvoke = vi.fn()
const mockIsTauri = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: unknown) => mockInvoke(command, args),
  isTauri: () => mockIsTauri(),
}))

const { logError } = await import('./logger')

beforeEach(() => {
  mockInvoke.mockReset().mockResolvedValue(undefined)
  mockIsTauri.mockReset().mockReturnValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logError', () => {
  test('sends the failure to the log file of the backend', async () => {
    await logError('data', new Error('This project already has a budget'))

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    const [command, args] = mockInvoke.mock.calls[0]!
    expect(command).toBe('log_client_error')
    expect((args as { source: string }).source).toBe('data')
    expect((args as { message: string }).message).toContain(
      'Error: This project already has a budget',
    )
  })

  test('removes sensitive values before they reach the log', async () => {
    await logError('data', new Error('login failed for jane@example.com token=abc'))

    const { message } = mockInvoke.mock.calls[0]![1] as { message: string }
    expect(message).not.toContain('jane@example.com')
    expect(message).not.toContain('abc')
    expect(message).toContain('[redacted]')
  })

  test('shortens long stack traces', async () => {
    const error = new Error('boom')
    error.stack = 'x'.repeat(5_000)

    await logError('render', error)

    const { message } = mockInvoke.mock.calls[0]![1] as { message: string }
    expect(message.length).toBeLessThanOrEqual(2_000)
  })

  test('falls back to the console when the command fails', async () => {
    mockInvoke.mockRejectedValue(new Error('no backend'))

    await logError('data', 'plain failure')

    expect(console.error).toHaveBeenCalledWith('[data] plain failure')
  })

  test('logs to the console in the browser fallback', async () => {
    mockIsTauri.mockReturnValue(false)

    await logError('data', { kind: 'validation', message: 'invalid note' })

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      '[data] {"kind":"validation","message":"invalid note"}',
    )
  })

  test('falls back for values that stringify to undefined', async () => {
    await logError('data', undefined)

    const { message } = mockInvoke.mock.calls[0]![1] as { message: string }
    expect(message).toBe('undefined')
  })

  test('never throws when the value cannot be serialized', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    await expect(logError('data', circular)).resolves.toBeUndefined()
  })

  test('never throws when the final fallback cannot be serialized', async () => {
    const unsafe = {
      toJSON() {
        throw new Error('json failed')
      },
      toString() {
        throw new Error('string failed')
      },
    }

    await expect(logError('data', unsafe)).resolves.toBeUndefined()

    const { message } = mockInvoke.mock.calls[0]![1] as { message: string }
    expect(message).toBe('Unknown error')
  })
})
