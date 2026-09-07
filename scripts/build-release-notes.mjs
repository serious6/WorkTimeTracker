// Builds the body of a GitHub release. The human-readable summary comes from
// `CHANGELOG.md`, so a release never ships the raw output of a version control
// log; the commits are appended below it as a collapsed section for
// traceability only. Fails the release job when the released version has no
// changelog section.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Headings of the changelog subsection that describes the upgrade impact.
const upgradeHeadings = ['breaking changes', 'breaking change', 'upgrade impact', 'upgrade notes']

// At most this many commits are listed; a longer range is summarised instead of
// turning the release body into a version control log.
export const commitLimit = 100

function headingVersion(line) {
  const match = /^##\s+\[?v?([^\]\s]+)\]?/.exec(line)
  return match ? match[1] : null
}

// The body of the section of one version, without its heading, or `null` when
// the changelog has no section for it.
export function extractSection(changelog, version) {
  const wanted = String(version).replace(/^v/, '')
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((line) => headingVersion(line) === wanted)
  if (start === -1) return null
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (headingVersion(lines[index]) !== null) {
      end = index
      break
    }
  }
  // Link definitions of the reference style live at the end of the file and
  // belong to no section.
  const body = lines
    .slice(start + 1, end)
    .filter((line) => !/^\[[^\]]+\]:\s/.test(line))
    .join('\n')
    .trim()
  return body
}

// Splits the upgrade impact out of the section, so it is stated once and under
// its own heading in the release notes.
export function splitUpgradeImpact(section) {
  const text = String(section ?? '')
  const lines = text.split('\n')
  const start = lines.findIndex((line) => {
    const match = /^#{3,}\s+(.+?)\s*$/.exec(line)
    return match !== null && upgradeHeadings.includes(match[1].toLowerCase())
  })
  if (start === -1) return { highlights: text.trim(), upgrade: null }
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{2,}\s+/.test(lines[index])) {
      end = index
      break
    }
  }
  const upgrade = lines.slice(start + 1, end).join('\n').trim()
  const highlights = [...lines.slice(0, start), ...lines.slice(end)].join('\n').trim()
  return { highlights, upgrade: upgrade || null }
}

const defaultUpgrade = (repositoryUrl) =>
  `Install or upgrade with the installer or the portable archive of this release; [docs/installation.md](${repositoryUrl}/blob/main/docs/installation.md) describes both. The database schema is not migrated by an installation: a shared database is migrated deliberately through the \`migrate_production_database\` input of the \`Release\` workflow.`

function commitList(commits, repositoryUrl) {
  const shown = commits.slice(0, commitLimit)
  const lines = shown.map(({ sha, subject }) => {
    const short = sha.slice(0, 7)
    return `- [\`${short}\`](${repositoryUrl}/commit/${sha}) ${subject}`
  })
  if (commits.length > shown.length) {
    lines.push(`- …and ${commits.length - shown.length} more commits.`)
  }
  return lines
}

// The complete release body: summary first, then the upgrade impact, then the
// commits of the release in a collapsed section.
export function buildNotes({ version, tag, section = '', commits = [], previousTag = null, repositoryUrl }) {
  const { highlights, upgrade } = splitUpgradeImpact(section)
  const compareUrl = previousTag
    ? `${repositoryUrl}/compare/${previousTag}...${tag}`
    : `${repositoryUrl}/commits/${tag}`
  const parts = [
    '## Highlights',
    '',
    highlights || `See [CHANGELOG.md](${repositoryUrl}/blob/main/CHANGELOG.md) for the changes of ${version}.`,
    '',
    '## Upgrade impact',
    '',
    upgrade || defaultUpgrade(repositoryUrl),
    '',
    '<details><summary>Commits in this release</summary>',
    '',
  ]
  parts.push(...(commits.length > 0 ? commitList(commits, repositoryUrl) : ['No commits were recorded for this release.']))
  parts.push(
    '',
    previousTag ? `[Compare ${previousTag}…${tag}](${compareUrl})` : `[All commits up to ${tag}](${compareUrl})`,
    '',
    '</details>',
    '',
    `The full history is kept in [CHANGELOG.md](${repositoryUrl}/blob/main/CHANGELOG.md).`,
    '',
  )
  return parts.join('\n')
}

function git(args) {
  // `stdio` keeps a failed lookup (the first release has no previous tag) out
  // of the job log.
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

// The tag of the previous release, or `null` for the first one.
export function previousTagOf(runGit = git) {
  try {
    return runGit(['describe', '--tags', '--abbrev=0', '--match', 'v*', 'HEAD^']) || null
  } catch {
    return null
  }
}

export function parseCommits(log) {
  return log
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('\t')
      return separator === -1
        ? { sha: line, subject: '' }
        : { sha: line.slice(0, separator), subject: line.slice(separator + 1) }
    })
}

function commitsOf(previousTag, runGit = git) {
  const range = previousTag ? `${previousTag}..HEAD` : 'HEAD'
  return parseCommits(runGit(['log', '--no-merges', '--format=%H%x09%s', range]))
}

// A flag without a value would silently fall back to a default and release the
// wrong version, so it fails instead.
function option(argv, name) {
  const index = argv.indexOf(`--${name}`)
  if (index === -1) return undefined
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    console.error(`::error::--${name} needs a value.`)
    process.exit(1)
  }
  return value
}

// Only the executed script fails the job; the unit tests import the rules.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2)
  const changelogPath = option(argv, 'changelog') ?? 'CHANGELOG.md'
  const version = option(argv, 'version') ?? JSON.parse(readFileSync('package.json', 'utf8')).version
  const tag = option(argv, 'tag') ?? `v${version}`
  const output = option(argv, 'output')
  const server = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const repositoryUrl = `${server}/${process.env.GITHUB_REPOSITORY || 'serious6/WorkTimeTracker'}`

  const section = extractSection(readFileSync(changelogPath, 'utf8'), version)
  if (!section) {
    console.error(
      `::error::${changelogPath} has no section for version ${version}. Add the release notes before publishing.`,
    )
    process.exit(1)
  }
  const previousTag = previousTagOf()
  const notes = buildNotes({
    version,
    tag,
    section,
    commits: commitsOf(previousTag),
    previousTag,
    repositoryUrl,
  })
  if (output) {
    writeFileSync(output, notes)
    console.log(`wrote the release notes for ${tag} to ${output}`)
  } else {
    console.log(notes)
  }
}
