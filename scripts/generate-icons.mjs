import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const iconsDirectory = join(root, 'src-tauri/icons')
const source = join(iconsDirectory, 'app-icon.svg')
const favicon = join(root, 'public/favicon.svg')
const lockFile = join(iconsDirectory, 'icons.lock.json')

const key = (path) => relative(root, path).split(/[\\/]/).join(posix.sep)
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

/** The set the desktop app bundles; `tauri icon` also writes mobile assets we do not ship. */
const bundled = readdirSync(iconsDirectory)
  .filter((name) => name !== 'app-icon.svg' && name !== 'icons.lock.json')
  .sort()

const output = mkdtempSync(join(tmpdir(), 'work-time-tracker-icons-'))
try {
  execFileSync('npm', ['run', 'tauri', '--', 'icon', key(source), '--output', output], {
    cwd: root,
    stdio: 'inherit',
  })
  for (const name of bundled) copyFileSync(join(output, name), join(iconsDirectory, name))
} finally {
  rmSync(output, { recursive: true, force: true })
}

const lock = {
  sources: Object.fromEntries([source, favicon].map((path) => [key(path), digest(path)])),
  generated: Object.fromEntries(
    bundled.map((name) => [key(join(iconsDirectory, name)), digest(join(iconsDirectory, name))]),
  ),
}

writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`)
