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

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.includes(key.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase())
}

function containsEmail(token: string): boolean {
  const at = token.indexOf('@')
  if (at < 0) return false
  const local = token.slice(0, at).replace(/^[^\w]+|[^\w]+$/g, '')
  const domain = token.slice(at + 1)
  const dot = domain.indexOf('.')
  return local.length > 0 && dot > 0 && /[a-z0-9]/i.test(domain.slice(dot + 1))
}

/** Argon2 and PBKDF2 hashes are written as `$argon2id$...`. */
function isHash(token: string): boolean {
  return token.startsWith('$') && token.length > 1
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

function replacement(token: string): string {
  return isPath(token) ? REDACTED_PATH : REDACTED
}

function splitPair(token: string): [string, string, string] | null {
  const index = token.search(/[=:]/)
  if (index < 0) return null
  return [token.slice(0, index), token[index]!, token.slice(index + 1)]
}

/**
 * Removes credentials, hashes, e-mail addresses and file system paths from a
 * message before it reaches a log. The Rust logger applies the same rules.
 */
export function redact(message: string): string {
  const parts: string[] = []
  let redactNext = false

  for (const token of message.split(/\s+/).filter(Boolean)) {
    if (redactNext) {
      redactNext = false
      parts.push(REDACTED)
      continue
    }
    const pair = splitPair(token)
    if (pair && isSensitiveKey(pair[0])) {
      const [key, separator, value] = pair
      if (value === '') {
        redactNext = true
        parts.push(`${key}${separator}`)
      } else {
        parts.push(`${key}${separator}${REDACTED}`)
      }
      continue
    }
    if (pair && !isPath(token) && needsRedaction(pair[2])) {
      parts.push(`${pair[0]}${pair[1]}${replacement(pair[2])}`)
      continue
    }
    parts.push(needsRedaction(token) ? replacement(token) : token)
  }

  return parts.join(' ')
}

/** Keeps a log line short, no matter how long a stack trace is. */
export function clamp(message: string): string {
  return message.slice(0, MAX_MESSAGE_LENGTH)
}
