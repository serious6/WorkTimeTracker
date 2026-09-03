import { describe, expect, it } from 'vitest'

import { resolveDevServerHost } from '../../vite.config'

/** Vitest only collects tests under `src/`, so the config of the repository root is covered here. */
describe('resolveDevServerHost', () => {
  it('binds the dev server to the loopback interface by default', () => {
    expect(resolveDevServerHost({})).toBe('127.0.0.1')
  })

  it('ignores an empty opt-in', () => {
    expect(resolveDevServerHost({ TAURI_DEV_HOST: '  ' })).toBe('127.0.0.1')
  })

  it('binds the address the Tauri CLI asks for when testing on a device', () => {
    expect(resolveDevServerHost({ TAURI_DEV_HOST: '192.168.1.24' })).toBe('192.168.1.24')
  })
})
