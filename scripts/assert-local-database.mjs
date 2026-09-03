// Fails a workflow job that is configured to reach anything but a local
// database. Development, the unit tests, the Rust tests and the Playwright
// suite always run against the compose database, so a job that carries a
// production mode, a remote `DATABASE_URL` or the secrets of a deployment is
// misconfigured. Prints host names only, never a connection string.

import { pathToFileURL } from 'node:url'

const localHosts = new Set(['localhost', 'db'])
const hostKeys = ['host', 'hostaddr']
const productionKeys = [
  'SUPABASE_DATABASE_URL',
  'SUPABASE_DB_HOST',
  'SUPABASE_DB_PORT',
  'SUPABASE_DB_USER',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_DB_NAME',
  'SUPABASE_DB_ROOT_CERT',
]

function isLoopback(host) {
  if (host === '::1' || host === '[::1]') return true
  const parts = host.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255) && parts[0] === '127'
}

function isLocal(host) {
  const name = host.trim().toLowerCase()
  return localHosts.has(name) || isLoopback(name)
}

function isHostKey(key) {
  return hostKeys.includes(key.trim().toLowerCase())
}

function decode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

// The driver reads `host` and `hostaddr` from the query of a URL as well and
// connects to them in addition to the authority, so they are checked too.
function queryHosts(query) {
  return query
    .split('&')
    .flatMap((parameter) => {
      const [key, ...rest] = parameter.split('=')
      if (!isHostKey(key)) return []
      return decode(rest.join('=')).split(',')
    })
    .filter(Boolean)
}

// The hosts of both accepted spellings: a URL and a libpq `key=value` string.
export function hosts(databaseUrl) {
  const value = databaseUrl.trim()
  if (!value) return []
  if (value.includes('://')) {
    const body = value.slice(value.indexOf('://') + 3)
    // The driver reads everything up to the first `@` as the credentials, so a
    // password containing a `?` does not start the query.
    const credentials = body.indexOf('@')
    const rest = credentials === -1 ? body : body.slice(credentials + 1)
    const query = rest.indexOf('?')
    const authority = (query === -1 ? rest : rest.slice(0, query)).split('/')[0]
    const withoutPort = authority.startsWith('[')
      ? authority.slice(1, authority.indexOf(']'))
      : authority.split(':')[0]
    return [
      ...withoutPort.split(','),
      ...(query === -1 ? [] : queryHosts(rest.slice(query + 1))),
    ].filter(Boolean)
  }
  return value
    .split(/\s+/)
    .flatMap((pair) => {
      const [key, ...rest] = pair.split('=')
      if (!isHostKey(key)) return []
      return rest.join('=').split(',')
    })
    .filter(Boolean)
}

export function problems(env) {
  const found = []
  const mode = (env.WORK_TIME_TRACKER_ENV ?? '').trim().toLowerCase()
  if (mode && mode !== 'development') {
    found.push(`WORK_TIME_TRACKER_ENV is "${mode}"; a test job must run in development mode`)
  }
  for (const host of hosts(env.DATABASE_URL ?? '')) {
    if (!isLocal(host)) found.push(`DATABASE_URL points at the remote host "${host}"`)
  }
  for (const key of productionKeys) {
    if ((env[key] ?? '').trim()) found.push(`${key} is set; deployment secrets belong to the release job only`)
  }
  return found
}

// Only the executed script fails the job; the unit tests import the rules.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const found = problems(process.env)
  if (found.length > 0) {
    for (const problem of found) console.error(`::error::${problem}`)
    process.exit(1)
  }
  console.log('the configured database is local')
}
