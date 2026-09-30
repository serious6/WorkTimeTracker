import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

describe('generated license notices', () => {
  test('uses LF line endings and ends with a newline', () => {
    const content = readFileSync(new URL('../src/data/licenses.json', import.meta.url))

    expect(content.at(-1)).toBe(0x0a)
    expect(content.includes(Buffer.from('\r\n'))).toBe(false)
  })
})
