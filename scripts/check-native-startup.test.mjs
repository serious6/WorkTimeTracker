import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { assertBudget, checkNativeStartup, measureStartup } from './check-native-startup.mjs'

describe('native cold-start measurement', () => {
  test('requires both clocks to stay strictly below one second', () => {
    expect(() => assertBudget({ observedMs: 999.9, backendMs: 999 })).not.toThrow()
    for (const measurement of [
      { observedMs: 1000, backendMs: 10 },
      { observedMs: 10, backendMs: 1000 },
      { observedMs: 1100, backendMs: 10 },
    ]) {
      expect(() => assertBudget(measurement)).toThrow('1000 ms')
    }
  })

  async function fixture(run) {
    const directory = await mkdtemp(resolve('.native-startup-test-'))
    const log = join(directory, 'logs', 'work-time-tracker.log')
    await mkdir(join(directory, 'logs'))
    const launch = (code, timeoutMs = 5000) =>
      measureStartup({
        executable: process.execPath,
        args: ['-e', code, log],
        directory,
        env: process.env,
        timeoutMs,
      })
    try {
      await run({ directory, log, launch })
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  }

  test('observes a fresh process report and terminates the process afterwards', () =>
    fixture(async ({ directory, launch }) => {
      const result = await launch(`
        const fs = require('node:fs');
        fs.writeFileSync('pid', String(process.pid));
        fs.writeFileSync(process.argv[1], '2026-09-15T00:00:00.000Z INFO [boot] loading page shown after 25 ms\\n');
        setInterval(() => {}, 1000);
      `)
      expect(result.backendMs).toBe(25)
      expect(result.observedMs).toBeGreaterThan(0)
      const pid = Number(await readFile(join(directory, 'pid'), 'utf8'))
      expect(() => process.kill(pid, 0)).toThrow()
    }))

  test('rejects a delayed process even when its internal clock claims a fast boot', () =>
    fixture(async ({ launch }) => {
      const result = await launch(`
        const fs = require('node:fs');
        setTimeout(() => fs.writeFileSync(process.argv[1],
          '2026-09-15T00:00:00.000Z INFO [boot] loading page shown after 1 ms\\n'), 1100);
        setInterval(() => {}, 1000);
      `)
      expect(() => assertBudget(result)).toThrow('1000 ms')
    }))

  test('times out and reaps a process blocked before the renderer report', () =>
    fixture(async ({ directory, launch }) => {
      await expect(
        launch(`
          require('node:fs').writeFileSync('pid', String(process.pid));
          setInterval(() => {}, 1000);
        `, 500),
      ).rejects.toThrow('No loading-page report')
      const pid = Number(await readFile(join(directory, 'pid'), 'utf8'))
      expect(() => process.kill(pid, 0)).toThrow()
    }))

  test('reaps the process when a post-report assertion fails', () =>
    fixture(async ({ directory }) => {
      await expect(measureStartup({
        executable: process.execPath,
        args: ['-e', `
          const fs = require('node:fs');
          fs.writeFileSync('pid', String(process.pid));
          fs.writeFileSync('logs/work-time-tracker.log',
            '2026-09-15T00:00:00.000Z INFO [boot] loading page shown after 1000 ms, over the 1000 ms boot budget\\n');
          setInterval(() => {}, 1000);
        `],
        directory,
        env: process.env,
        verify: assertBudget,
      })).rejects.toThrow('1000 ms')
      const pid = Number(await readFile(join(directory, 'pid'), 'utf8'))
      expect(() => process.kill(pid, 0)).toThrow()
    }))

  test('rejects early exits, spawn failures, and stale reports', () =>
    fixture(async ({ log, launch }) => {
      await expect(launch('process.exit(7)')).rejects.toThrow('exited before')
      await expect(measureStartup({
        executable: resolve('missing-native-startup-binary'),
        directory: resolve('.'),
        log,
        env: process.env,
      })).rejects.toThrow('Could not launch')
      await writeFile(log, '[boot] loading page shown after 1 ms\n')
      await expect(launch('setInterval(() => {}, 1000)')).rejects.toThrow('already exists')
    }))

  test('classifies startup diagnostics without exposing arbitrary stderr', () =>
    fixture(async ({ launch }) => {
      await expect(launch(`
        console.error('error while loading shared libraries: /private/example user@example.invalid');
        process.exit(7);
      `)).rejects.toMatchObject({
        message: 'Native process exited before the loading-page report (7) (native shared library unavailable)',
      })
    }))

  test('settles cleanup when copying fails before the database listener starts', async () => {
    await expect(checkNativeStartup(resolve('missing-native-startup-source'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
