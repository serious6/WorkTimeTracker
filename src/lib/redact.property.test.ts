import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { clamp, redact } from './redact'

/** Tokens the redactor works on, so a generated secret stands on its own. */
const noWhitespace = fc.string().map((text) => text.replace(/\s/g, ''))

const segment = noWhitespace.filter((text) => text.length > 0)

// The redactor detects e-mail addresses by a documented heuristic rather than
// by RFC 5322: the local part has to hold a word character and the domain an
// alphanumeric one behind its first dot. `fc.emailAddress` also generates
// addresses such as `!@a.aa`, which no user of this app has.
const email = fc
  .emailAddress()
  .filter((address) => /^[^@]*\w[^@]*@[^@]*\.[^@]*[a-z0-9]/i.test(address))

const hash = fc
  .constantFrom('$argon2id$v=19$m=19456,t=2,p=1$', '$2b$12$', '$scrypt$ln=16,r=8,p=1$')
  .chain((prefix) => noWhitespace.map((rest) => `${prefix}${rest}`))

const path = fc.oneof(
  fc.array(segment, { minLength: 1, maxLength: 4 }).map((parts) => `/${parts.join('/')}`),
  fc.array(segment, { minLength: 1, maxLength: 4 }).map((parts) => `C:\\${parts.join('\\')}`),
)

// The same invariants the Rust fuzz target `src-tauri/fuzz/fuzz_targets/redact.rs`
// asserts, because both implementations have to redact a message the same way.
describe('redact properties', () => {
  it('never leaves a secret in the message', () => {
    fc.assert(
      fc.property(
        fc.oneof(email, hash, path),
        noWhitespace,
        noWhitespace,
        (secret, before, after) => {
          const redacted = redact(`${before} ${secret} ${after}`)
          expect(redacted).not.toContain(secret)
        },
      ),
    )
  })

  it('never leaves the value of a sensitive key in the message', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('password', 'token', 'secret', 'apikey', 'authorization', 'cookie'),
        fc.constantFrom(':', '='),
        // Values without a quote or a `,}]` delimiter, which end a value and
        // whose tail therefore belongs to the surrounding text again.
        fc.stringMatching(/^[A-Za-z0-9._~-]{8,32}$/),
        (key, separator, value) => {
          expect(redact(`connect ${key}${separator}${value} done`)).toBe(
            `connect ${key}${separator}[redacted] done`,
          )
        },
      ),
    )
  })

  it('settles after one pass', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (message) => {
        const redacted = redact(message)
        expect(redact(redacted)).toBe(redacted)
      }),
    )
  })

  it('keeps a message without a secret unchanged apart from its spacing', () => {
    fc.assert(
      fc.property(fc.array(fc.stringMatching(/^[a-z]{1,12}$/), { maxLength: 8 }), (words) => {
        expect(redact(words.join(' '))).toBe(words.join(' '))
      }),
    )
  })
})

describe('clamp properties', () => {
  it('never returns more than the maximum length and keeps the beginning', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (message) => {
        const clamped = clamp(message)
        expect(clamped.length).toBeLessThanOrEqual(2_000)
        expect(message.startsWith(clamped)).toBe(true)
      }),
    )
  })
})
