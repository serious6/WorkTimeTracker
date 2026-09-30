import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, open, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

const BUDGET_MS = 1000
const REPORT_TIMEOUT_MS = 15000

export function assertBudget({ observedMs, backendMs }) {
  assert(
    observedMs < BUDGET_MS && backendMs < BUDGET_MS,
    `Cold start must be < ${BUDGET_MS} ms: spawn-to-report ${observedMs.toFixed(1)} ms, backend ${backendMs} ms`,
  )
}

async function stop(child, closed) {
  if (!child.pid) return
  // Kill only this launch's process tree, including WebKit/WebView2 children.
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      timeout: 5000,
    })
    if (result.status !== 0 && child.exitCode === null) throw new Error('Could not stop native process')
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  await Promise.race([
    closed,
    delay(5000, undefined, { ref: false }).then(() => {
      throw new Error('Native process did not terminate')
    }),
  ])
}

export async function measureStartup({
  executable,
  args = [],
  directory,
  env,
  log = join(directory, 'logs', 'work-time-tracker.log'),
  timeoutMs = REPORT_TIMEOUT_MS,
  verify = () => {},
}) {
  await mkdir(dirname(log), { recursive: true })
  // Reserve a fresh log atomically and retain its identity while the native logger appends.
  const logFile = await open(log, 'wx+', 0o600).catch((error) => {
    if (error.code === 'EEXIST') {
      throw new Error('Startup log already exists; refusing a warm or stale measurement')
    }
    throw error
  })
  try {
    // Start before spawn, not on its "spawn" event or the first backend message.
    const started = performance.now()
    const child = spawn(executable, args, {
      cwd: directory,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let failure
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-4096) })
    const diagnostic = () => {
      // Only classify known failures; arbitrary stderr can contain credentials or paths.
      if (/cannot open display|failed to open display/i.test(stderr)) return ' (display unavailable)'
      if (/DRI3|DMA-BUF/i.test(stderr)) {
        return ' (WebKit graphics unavailable; Xvfb needs WEBKIT_DISABLE_DMABUF_RENDERER=1)'
      }
      if (/error while loading shared libraries|Library not loaded/i.test(stderr)) {
        return ' (native shared library unavailable)'
      }
      if (/WebView2/i.test(stderr)) return ' (WebView2 reported a startup failure)'
      return ''
    }
    child.once('error', () => { failure = new Error('Could not launch native process') })
    child.once('exit', (code, signal) => {
      failure = new Error(`Native process exited before the loading-page report (${code ?? signal})`)
    })
    const closed = new Promise((resolveClosed) => child.once('close', resolveClosed))
    try {
      let contents = ''
      while (performance.now() - started < timeoutMs) {
        if (failure) throw new Error(failure.message + diagnostic())
        contents += await logFile.readFile('utf8')
        const match = contents.match(
          /(?:^|\n)[^\n]* INFO \[boot\] loading page shown after (\d+) ms(?:, [^\n]*)?\r?\n/,
        )
        if (match) {
          const result = { observedMs: performance.now() - started, backendMs: Number(match[1]) }
          await verify(result)
          return result
        }
        await delay(10)
      }
      throw new Error(`No loading-page report within ${timeoutMs} ms of process launch${diagnostic()}`)
    } finally {
      await stop(child, closed)
    }
  } finally {
    await logFile.close()
  }
}

export async function checkNativeStartup(source) {
  const directory = await mkdtemp(resolve('.native-startup-'))
  const sockets = new Set()
  let connected = false
  // A configured local database that accepts TCP but never answers forces setup
  // to remain pending. Moving that work back onto the main thread must fail.
  const database = createServer((socket) => {
    connected = true
    sockets.add(socket)
    socket.on('error', () => {})
    socket.once('close', () => sockets.delete(socket))
  })
  try {
    const application = join(directory, basename(source))
    await cp(resolve(source), application, { recursive: true, verbatimSymlinks: true })
    const executable = process.platform === 'darwin'
      ? join(application, 'Contents', 'MacOS', 'work-time-tracker')
      : application
    const home = join(directory, 'home')
    const env = { ...process.env }
    for (const key of Object.keys(env)) {
      if (/^(DATABASE_URL$|SUPABASE_|WORK_TIME_TRACKER_|PG|TAURI_)/i.test(key)) delete env[key]
    }
    Object.assign(env, {
      HOME: home,
      CFFIXED_USER_HOME: home,
      USERPROFILE: home,
      APPDATA: join(home, 'AppData', 'Roaming'),
      LOCALAPPDATA: join(home, 'AppData', 'Local'),
      XDG_DATA_HOME: join(home, '.local', 'share'),
      XDG_CONFIG_HOME: join(home, '.config'),
      XDG_CACHE_HOME: join(home, '.cache'),
      WEBVIEW2_USER_DATA_FOLDER: join(home, 'webview'),
      TMPDIR: join(home, 'tmp'),
      TMP: join(home, 'tmp'),
      TEMP: join(home, 'tmp'),
    })
    await Promise.all([
      home, env.APPDATA, env.LOCALAPPDATA, env.XDG_DATA_HOME,
      env.XDG_CONFIG_HOME, env.XDG_CACHE_HOME, env.WEBVIEW2_USER_DATA_FOLDER, env.TMPDIR,
    ].map((path) => mkdir(path, { recursive: true })))
    await new Promise((ready, reject) => {
      database.once('error', reject)
      database.listen(0, '127.0.0.1', ready)
    })
    const address = database.address()
    assert(address && typeof address !== 'string')
    env.DATABASE_URL = `host=127.0.0.1 port=${address.port} user=startup_probe dbname=startup_probe sslmode=disable`
    const result = await measureStartup({
      executable, directory, env,
      verify: async () => {
        const deadline = performance.now() + REPORT_TIMEOUT_MS
        while (!connected && performance.now() < deadline) await delay(10)
        assert(connected, 'Native startup did not attempt the configured stalled database')
      },
    })
    const budget = result.observedMs < BUDGET_MS && result.backendMs < BUDGET_MS
      ? 'within'
      : 'over'
    console.log(`Native cold start: spawn-to-report ${result.observedMs.toFixed(1)} ms; backend ${result.backendMs} ms (${budget} ${BUDGET_MS} ms budget)`)
    return result
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise((done) => database.close(done))
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = process.argv[2] ?? {
    linux: 'src-tauri/target/release/work-time-tracker',
    darwin: 'src-tauri/target/release/bundle/macos/WorkTimeTracker.app',
    win32: 'src-tauri/target/release/work-time-tracker.exe',
  }[process.platform]
  try {
    assert(source, 'Native startup requires Linux, macOS, or Windows')
    await checkNativeStartup(source)
  } catch (error) {
    // Filesystem and spawn errors can contain user paths; report only our own diagnostics.
    console.error(error.code && error.code !== 'ERR_ASSERTION'
      ? `Native startup check failed (${error.code})`
      : error.message)
    process.exitCode = 1
  }
}
