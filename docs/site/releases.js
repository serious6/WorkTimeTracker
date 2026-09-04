import { RELEASES_PAGE, downloadUrl, formatBytes, inferPlatform, loadReleases, releaseState } from './release-data.js'

const content = document.querySelector('#release-content')
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const date = (value) => new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(value))

function render(releases, stale) {
  content.setAttribute('aria-busy', 'false')
  if (releaseState(releases) === 'empty') {
    content.innerHTML = '<div class="empty"><span class="icon" aria-hidden="true">◷</span><h3>No releases yet</h3><p>The first WorkTimeTracker release will appear here when it’s published.</p></div>'
    return
  }
  const release = releases.find((item) => !item.draft) || releases[0]
  const assets = (Array.isArray(release.assets) ? release.assets : []).map((asset) => {
    const url = downloadUrl(asset.browser_download_url)
    return url ? `<a class="asset" href="${escape(url)}"><span class="asset-icon" aria-hidden="true">↓</span><div><strong>${escape(inferPlatform(asset.name))} · ${escape(asset.name)}</strong><span class="asset-meta">${formatBytes(asset.size)} · ${asset.download_count} download${asset.download_count === 1 ? '' : 's'}</span></div><span class="download-arrow" aria-hidden="true">↓</span></a>` : ''
  }).join('')
  const notes = release.body ? `<p class="release-notes">${escape(release.body.slice(0, 320))}${release.body.length > 320 ? '…' : ''}</p>` : ''
  content.innerHTML = `<div class="release-head"><div><h3>Latest release: ${escape(release.tag_name)}</h3><p class="release-meta">Published ${date(release.published_at)}</p></div>${stale ? '<span class="release-meta">Showing saved results</span>' : ''}</div>${notes}${assets ? `<div class="asset-list">${assets}</div>` : '<p class="release-meta">This release does not include downloadable assets yet.</p>'}<a class="older-link" href="${RELEASES_PAGE}">View all releases on GitHub →</a>`
}
function renderError(error) {
  content.setAttribute('aria-busy', 'false')
  const rateLimited = error.status === 403
  content.innerHTML = `<div class="error"><h3>${rateLimited ? 'Downloads are temporarily busy' : 'Couldn’t load releases'}</h3><p>${rateLimited ? 'GitHub’s public API rate limit has been reached. Please try again shortly.' : 'Please check your connection or visit GitHub Releases directly.'}</p><a class="older-link" href="${RELEASES_PAGE}">View releases on GitHub →</a></div>`
}
loadReleases(fetch, localStorage).then(({ releases, stale }) => render(releases, stale)).catch(renderError)
