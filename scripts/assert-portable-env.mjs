// Fails the release job when a portable archive would ship a configured
// connection. Such an archive carries the documented example only: a filled-in
// `WorkTimeTracker.env` does not belong in it, and no env file in it may carry
// a value for a secret setting. Prints file and setting names only, never a
// value.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

// The settings a portable installation keeps in the credential store of the
// user account instead of in the file; see `src-tauri/src/portable.rs`.
export const secretKeys = ['DATABASE_URL', 'SUPABASE_DB_PASSWORD']

// The value the application leaves behind once it has moved a secret into the
// credential store, so a scrubbed file is not read as a configured one.
const storedMarker = 'stored-in-credential-store'

const liveFile = 'WorkTimeTracker.env'

function isEnvFile(name) {
  return name === liveFile || name.endsWith('.env') || name.endsWith('.env.example')
}

function unquote(value) {
  const match = value.match(/^(["'])(.*)\1$/)
  return match ? match[2] : value
}

// The problems of one env file: its name and the settings that carry a value.
export function fileProblems(name, contents) {
  const found = []
  if (name.split(/[\\/]/).pop() === liveFile) {
    found.push(`${name} is a configured connection; a portable archive ships the example only`)
  }
  for (const line of contents.split(/\r?\n/)) {
    const text = line.trim()
    if (!text || text.startsWith('#')) continue
    const separator = text.indexOf('=')
    if (separator === -1) continue
    const key = text.slice(0, separator).trim()
    const value = unquote(text.slice(separator + 1).trim())
    if (!secretKeys.includes(key) || !value || value === storedMarker) continue
    found.push(`${name} carries a value for the secret setting ${key}`)
  }
  return found
}

function envFiles(directory, root = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return envFiles(path, root)
    if (!entry.isFile() || !isEnvFile(entry.name)) return []
    return [{ name: relative(root, path), contents: readFileSync(path, 'utf8') }]
  })
}

export function problems(files) {
  return files.flatMap(({ name, contents }) => fileProblems(name, contents))
}

// Only the executed script fails the job; the unit tests import the rules.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2]
  if (!directory || !statSync(directory).isDirectory()) {
    console.error('::error::pass the folder of the portable archive to check')
    process.exit(1)
  }
  const found = problems(envFiles(directory))
  if (found.length > 0) {
    for (const problem of found) console.error(`::error::${problem}`)
    process.exit(1)
  }
  console.log('the portable archive carries no configured connection')
}
