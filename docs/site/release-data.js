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
  const file = String(name || '').toLowerCase()
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
export function formatReleaseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date)
}
export function releaseState(releases) {
  return Array.isArray(releases) && releases.length ? 'release' : 'empty'
}
// Every cache access is best-effort: browsers throw (for example `SecurityError`)
// when storage is blocked, and downloads must still load in that case.
function clearCache(storage) {
  try {
    storage.removeItem(CACHE_KEY)
  } catch {
    // Nothing can be dropped when storage is unavailable.
  }
}
function readCache(storage) {
  let raw = null
  try {
    raw = storage.getItem(CACHE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const cached = JSON.parse(raw)
    if (cached && Array.isArray(cached.releases)) return cached
  } catch {
    // A malformed entry is dropped below.
  }
  clearCache(storage)
  return null
}
function writeCache(storage, value) {
  try {
    storage.setItem(CACHE_KEY, value)
  } catch {
    // A missing cache only costs a request on the next visit.
  }
}
export async function loadReleases(fetcher, storage, now = Date.now()) {
  const cached = readCache(storage)
  if (cached?.expiresAt > now) return { releases: cached.releases, stale: false }
  try {
    const response = await fetcher(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } })
    if (!response.ok) throw new ReleaseRequestError(response.status)
    const releases = await response.json()
    if (!Array.isArray(releases)) throw new ReleaseRequestError()
    writeCache(storage, JSON.stringify({ releases, expiresAt: now + CACHE_TTL }))
    return { releases, stale: false }
  } catch (error) {
    if (Array.isArray(cached?.releases)) return { releases: cached.releases, stale: true }
    throw error
  }
}
