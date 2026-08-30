import { afterEach, describe, expect, test, vi } from 'vitest'
import { getRepository, setRepository } from './index'
import { createLocalRepository, FALLBACK_NOT_ALLOWED_MESSAGE } from './local-repository'
import type { Repository } from './repository'

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  invoke: vi.fn(),
}))

describe('storage/index – repository selection', () => {
  afterEach(() => {
    setRepository(null)
  })

  test('resolves the browser fallback when isTauri() is false (jsdom)', () => {
    expect(getRepository()).toBe(createLocalRepository())
  })

  test('returns an injected repository instead of the resolved one', () => {
    const injected = { listProjects: async () => [] } as unknown as Repository

    setRepository(injected)

    expect(getRepository()).toBe(injected)
  })

  test('restores the resolved repository when the override is cleared', () => {
    setRepository({} as Repository)
    setRepository(null)

    expect(getRepository()).toBe(createLocalRepository())
  })

  test('names the fallback in the message that guards production builds', () => {
    expect(FALLBACK_NOT_ALLOWED_MESSAGE).toMatch(/development and test/)
  })
})
