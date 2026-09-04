import { describe, expect, test } from 'vitest'
import { CACHE_KEY, CACHE_TTL, RELEASES_URL, formatBytes, inferPlatform, loadReleases, releaseState } from '../docs/site/release-data.js'

describe('release page helpers', () => {
  test('infers every supported installer platform', () => {
    expect(inferPlatform('tracker.msi')).toBe('Windows')
    expect(inferPlatform('tracker.app.tar.gz')).toBe('macOS')
    expect(inferPlatform('tracker.AppImage')).toBe('Linux')
  })
  test('formats asset sizes and selects the empty state', () => {
    expect(formatBytes(1_572_864)).toBe('1.5 MB')
    expect(formatBytes(-1)).toBe('Unknown size')
    expect(releaseState([])).toBe('empty')
    expect(releaseState([{ tag_name: 'v1.0.0' }])).toBe('release')
  })
  test('caches successful results and uses stale results after a failed request', async () => {
    const values = new Map()
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
    const releases = [{ tag_name: 'v1.0.0', assets: [{ name: 'WorkTimeTracker.msi' }] }]
    const fetcher = async (url) => {
      expect(url).toBe(RELEASES_URL)
      return { ok: true, json: async () => releases }
    }
    await expect(loadReleases(fetcher, storage, 100)).resolves.toEqual({ releases, stale: false })
    expect(JSON.parse(values.get(CACHE_KEY)).expiresAt).toBe(100 + CACHE_TTL)
    await expect(loadReleases(async () => { throw new Error('offline') }, storage, 100 + CACHE_TTL + 1)).resolves.toEqual({ releases, stale: true })
  })
})
