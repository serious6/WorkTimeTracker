import { describe, expect, test } from 'vitest'

import { releaseBotConfigErrors } from './check-release-bot-config.mjs'

describe('release bot configuration', () => {
  test.each([
    [
      { clientId: '  ', privateKey: 'private-key' },
      ['RELEASE_BOT_CLIENT_ID'],
    ],
    [
      { clientId: 'client-id', privateKey: '\n\t' },
      ['RELEASE_BOT_PRIVATE_KEY'],
    ],
    [
      { clientId: ' ', privateKey: '' },
      ['RELEASE_BOT_CLIENT_ID', 'RELEASE_BOT_PRIVATE_KEY'],
    ],
  ])('reports missing or blank settings without exposing values', (configuration, settings) => {
    const errors = releaseBotConfigErrors(configuration)

    expect(errors.map((error) => error.match(/RELEASE_BOT_[A-Z_]+/)?.[0])).toEqual(settings)
    expect(errors.every((error) => error.includes('production environment'))).toBe(true)
    expect(errors.join('\n')).not.toContain('private-key')
  })

  test('accepts a complete configuration', () => {
    expect(
      releaseBotConfigErrors({
        clientId: 'client-id',
        privateKey: 'private-key',
      }),
    ).toEqual([])
  })
})
