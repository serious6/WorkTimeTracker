import { describe, expect, test, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  invoke: vi.fn(),
}))

describe('storage/index – repository selection', () => {
  test('uses localRepository when isTauri() is false (jsdom)', async () => {
    const { repository } = await import('./index')
    const { localRepository } = await import('./local-repository')
    expect(repository).toBe(localRepository)
  })
})
