export const RELEASES_URL = 'https://api.github.com/repos/serious6/WorkTimeTracker/releases'
export const RELEASES_PAGE = 'https://github.com/serious6/WorkTimeTracker/releases'
export const CACHE_KEY = 'work-time-tracker-releases'
export const CACHE_TTL = 20 * 60 * 1000

export class ReleaseRequestError extends Error {
  constructor(status) {
    super('Could not load releases')
    this.status = status
  }
}

export function inferPlatform(name) {
  const file = name.toLowerCase()
  if (file.endsWith('.msi') || file.endsWith('.exe')) return 'Windows'
  if (file.endsWith('.dmg') || file.endsWith('.app.tar.gz')) return 'macOS'
  if (file.endsWith('.appimage') || file.endsWith('.deb') || file.endsWith('.rpm')) return 'Linux'
  return 'Download'
}
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1)
  return `${(bytes / 1024 ** (index + 1)).toFixed(index ? 1 : 0)} ${units[index]}`
}
export function downloadUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}
export function releaseState(releases) {
  return Array.isArray(releases) && releases.length ? 'release' : 'empty'
}
export async function loadReleases(fetcher, storage, now = Date.now()) {
  let cached = null
  try {
    cached = JSON.parse(storage.getItem(CACHE_KEY) || 'null')
  } catch {
    storage.removeItem(CACHE_KEY)
  }
  if (cached?.expiresAt > now && Array.isArray(cached.releases)) return { releases: cached.releases, stale: false }
  try {
    const response = await fetcher(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } })
    if (!response.ok) throw new ReleaseRequestError(response.status)
    const releases = await response.json()
    if (!Array.isArray(releases)) throw new ReleaseRequestError()
    storage.setItem(CACHE_KEY, JSON.stringify({ releases, expiresAt: now + CACHE_TTL }))
    return { releases, stale: false }
  } catch (error) {
    if (Array.isArray(cached?.releases)) return { releases: cached.releases, stale: true }
    throw error
  }
}
