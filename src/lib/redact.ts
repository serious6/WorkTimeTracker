const REDACTED = '[redacted]'
const REDACTED_PATH = '[redacted path]'
const MAX_MESSAGE_LENGTH = 2_000

/** Words whose value is never written to a log. Mirrors `src-tauri/src/logging.rs`. */
const SENSITIVE_KEYS = [
  'password',
  'passwort',
  'secret',
  'token',
  'hash',
  'credential',
  'credentials',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
]

/** Prefixes of the password hash formats that may appear in a message. */
const HASH_PREFIXES = ['$argon2', '$pbkdf2', '$scrypt', '$2a$', '$2b$', '$2y$']

function containsEmail(token: string): boolean {
  // Redaction intentionally uses token-oriented PII detection, not the stricter
  // login/register plausibility check in `src/lib/email.ts`.
  const at = token.indexOf('@')
  if (at < 0) return false
  const local = token.slice(0, at).replace(/^[^\w]+|[^\w]+$/g, '')
  const domain = token.slice(at + 1)
  const dot = domain.indexOf('.')
  return local.length > 0 && dot > 0 && /[a-z0-9]/i.test(domain.slice(dot + 1))
}

/** Password hashes carry their algorithm as a prefix, `$argon2id$...` here. */
function isHash(token: string): boolean {
  const lowercase = token.toLowerCase()
  return HASH_PREFIXES.some((prefix) => lowercase.startsWith(prefix))
}

function isPath(token: string): boolean {
  return (
    (token.startsWith('/') && token.length > 1) ||
    token.startsWith('\\\\') ||
    (token[1] === ':' && token.includes('\\'))
  )
}

function needsRedaction(token: string): boolean {
  return containsEmail(token) || isHash(token) || isPath(token)
}

function isBoundary(message: string, index: number): boolean {
  if (index <= 0) return true
  return !/[\w]/.test(message[index - 1]!)
}

function matchSensitiveKey(message: string, index: number): [string, number] | null {
  const quote = message[index] === '"' || message[index] === "'" ? message[index] : ''
  const keyStart = quote ? index + 1 : index

  for (const key of SENSITIVE_KEYS) {
    const candidate = message.slice(keyStart, keyStart + key.length)
    if (candidate.toLowerCase() !== key) continue

    const keyEnd = keyStart + key.length
    if (quote) {
      if (message[keyEnd] === quote) return [key, keyEnd + 1]
      continue
    }
    if (!/[\w]/.test(message[keyEnd] ?? '')) return [key, keyEnd]
  }

  return null
}

function skipSpaces(message: string, index: number): number {
  while (/\s/.test(message[index] ?? '')) index += 1
  return index
}

function quotedValueEnd(message: string, index: number, quote: string): number {
  let escaped = false
  for (let current = index + 1; current < message.length; current += 1) {
    const character = message[current]
    if (escaped) {
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === quote) {
      return current + 1
    }
  }
  return message.length
}

function unquotedValueEnd(message: string, index: number): number {
  let current = index
  while (current < message.length && !/[\s,}\]]/.test(message[current]!)) current += 1
  return current
}

function authorizationValueEnd(message: string, index: number): number | null {
  const scheme = /^(bearer|basic|digest|negotiate)\s+/i.exec(message.slice(index))
  if (!scheme) return null

  const credentialStart = index + scheme[0].length
  const credentialEnd = unquotedValueEnd(message, credentialStart)
  return credentialEnd > credentialStart ? credentialEnd : null
}

function redactSensitiveAt(message: string, index: number): [string, number] | null {
  if (!isBoundary(message, index)) return null

  const matchedKey = matchSensitiveKey(message, index)
  if (!matchedKey) return null

  const [key, keyEnd] = matchedKey
  const separatorIndex = skipSpaces(message, keyEnd)
  const separator = message[separatorIndex]
  if (separator !== ':' && separator !== '=') return null

  const valueStart = skipSpaces(message, separatorIndex + 1)
  if (valueStart >= message.length) return null

  const prefix = message.slice(index, valueStart)
  const quote = message[valueStart]
  if (quote === '"' || quote === "'") {
    return [`${prefix}${quote}${REDACTED}${quote}`, quotedValueEnd(message, valueStart, quote)]
  }

  const valueEnd =
    key === 'authorization'
      ? (authorizationValueEnd(message, valueStart) ?? unquotedValueEnd(message, valueStart))
      : unquotedValueEnd(message, valueStart)
  if (valueEnd === valueStart) return null

  return [`${prefix}${REDACTED}`, valueEnd]
}

function redactSensitiveValues(message: string): string {
  let redacted = ''
  let index = 0

  while (index < message.length) {
    const sensitive = redactSensitiveAt(message, index)
    if (sensitive) {
      redacted += sensitive[0]
      index = sensitive[1]
    } else {
      redacted += message[index]
      index += 1
    }
  }

  return redacted
}

function replacement(token: string): string {
  return isPath(token) ? REDACTED_PATH : REDACTED
}

function splitPair(token: string): [string, string, string] | null {
  const index = token.search(/[=:]/)
  if (index < 0) return null
  return [token.slice(0, index), token[index]!, token.slice(index + 1)]
}

/**
 * Redacts one whitespace-separated token. A `key=value` token keeps its key,
 * so a log line stays readable, but only while that key is no secret itself
 * and while what remains of the token no longer reads as one - a hash cut at a
 * colon must not survive as the label of its own redacted value.
 */
function redactToken(token: string): string {
  const pair = splitPair(token)
  if (pair && !isPath(token) && !needsRedaction(pair[0]) && needsRedaction(pair[2])) {
    const redacted = `${pair[0]}${pair[1]}${replacement(pair[2])}`
    if (!needsRedaction(redacted)) return redacted
  }
  return needsRedaction(token) ? replacement(token) : token
}

/**
 * Removes credentials, hashes, e-mail addresses and file system paths from a
 * message before it reaches a log. The Rust logger applies the same rules.
 */
export function redact(message: string): string {
  const parts: string[] = []

  for (const token of redactSensitiveValues(message).split(/\s+/).filter(Boolean)) {
    parts.push(redactToken(token))
  }

  return parts.join(' ')
}

/** Keeps a log line short, no matter how long a stack trace is. */
export function clamp(message: string): string {
  return message.slice(0, MAX_MESSAGE_LENGTH)
}
