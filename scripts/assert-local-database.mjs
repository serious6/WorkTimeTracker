// Fails a workflow job that is configured to reach anything but a local
// database. Development, the unit tests, the Rust tests and the Playwright
// suite always run against the compose database, so a job that carries a
// production mode, a remote `DATABASE_URL` or the secrets of a deployment is
// misconfigured. Prints host names only, never a connection string.

const localHosts = new Set(['localhost', 'db'])
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

// The hosts of both accepted spellings: a URL and a libpq `key=value` string.
function hosts(databaseUrl) {
  const value = databaseUrl.trim()
  if (!value) return []
  if (value.includes('://')) {
    const authority = value.slice(value.indexOf('://') + 3).split(/[/?]/)[0]
    const hostPart = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority
    const withoutPort = hostPart.startsWith('[')
      ? hostPart.slice(1, hostPart.indexOf(']'))
      : hostPart.split(':')[0]
    return withoutPort.split(',').filter(Boolean)
  }
  return value
    .split(/\s+/)
    .flatMap((pair) => {
      const [key, ...rest] = pair.split('=')
      if (!['host', 'hostaddr'].includes(key.trim().toLowerCase())) return []
      return rest.join('=').split(',')
    })
    .filter(Boolean)
}

function problems(env) {
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

const found = problems(process.env)
if (found.length > 0) {
  for (const problem of found) console.error(`::error::${problem}`)
  process.exit(1)
}
console.log('the configured database is local')
