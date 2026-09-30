import { build } from 'vite'
import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

test('the production boot entry does not statically load the React application', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const result = await build({ logLevel: 'silent', build: { write: false } })
  if (Array.isArray(result) || !('output' in result)) throw new Error('Expected one build')
  const chunks = result.output.filter((output) => output.type === 'chunk')
  const entry = chunks.find((chunk) => chunk.isEntry)
  expect(entry).toBeDefined()

  const pending = entry ? [entry] : []
  const modules = new Set<string>()
  const visited = new Set<string>()
  while (pending.length) {
    const chunk = pending.pop()
    if (!chunk || visited.has(chunk.fileName)) continue
    visited.add(chunk.fileName)
    for (const module of Object.keys(chunk.modules)) modules.add(module)
    for (const imported of chunk.imports) {
      const dependency = chunks.find((candidate) => candidate.fileName === imported)
      if (dependency) pending.push(dependency)
    }
  }

  expect([...modules].some((module) => module.endsWith('/src/boot-status.ts'))).toBe(true)
  expect([...modules].filter((module) => /\/(?:react|react-dom)\//.test(module))).toEqual([])
  expect([...modules].some((module) => module.endsWith('/src/main.tsx'))).toBe(false)
  expect(chunks.some((chunk) => Object.keys(chunk.modules).some(
    (module) => module.endsWith('/src/main.tsx'),
  ))).toBe(true)
  const html = result.output.find((output) => output.type === 'asset' && output.fileName === 'index.html')
  expect(html?.type === 'asset' ? String(html.source) : '').toMatch(/rel="stylesheet"/)
}, 30_000)
