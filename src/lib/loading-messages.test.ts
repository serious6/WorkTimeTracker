import { describe, expect, test } from 'vitest'
import { LOADING_MESSAGES, loadingMessageAt } from './loading-messages'

describe('loadingMessageAt', () => {
  test('starts with the message of the step that is waited for', () => {
    expect(loadingMessageAt('Loading…', 0)).toBe('Loading…')
  })

  test('walks through the loading texts', () => {
    expect(loadingMessageAt('Loading…', 1)).toBe(LOADING_MESSAGES[0])
    expect(loadingMessageAt('Loading…', LOADING_MESSAGES.length)).toBe(
      LOADING_MESSAGES[LOADING_MESSAGES.length - 1],
    )
  })

  test('starts over after the last loading text', () => {
    expect(loadingMessageAt('Loading…', LOADING_MESSAGES.length + 1)).toBe('Loading…')
  })
})
