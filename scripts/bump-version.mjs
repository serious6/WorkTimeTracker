import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const versionPattern = '(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)'

export function parseVersion(version) {
  const match = new RegExp(`^${versionPattern}$`).exec(String(version ?? ''))
  if (!match) throw new Error(`Version must be plain MAJOR.MINOR.PATCH semver, got '${version ?? ''}'.`)
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

export function nextVersion(version, type) {
  const parsed = parseVersion(version)
  if (type === 'patch') return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
  if (type === 'minor') return `${parsed.major}.${parsed.minor + 1}.0`
  if (type === 'major') return `${parsed.major + 1}.0.0`
  throw new Error(`--type must be one of patch, minor, or major, got '${type ?? ''}'.`)
}

export function bumpJson(contents, version) {
  const parsed = JSON.parse(contents)
  if (!Object.hasOwn(parsed, 'version')) throw new Error('JSON file has no top-level version field to update.')

  const indent = contents.match(/^{\r?\n([ \t]+)"/)?.[1]
  if (!indent) throw new Error('JSON file format is not supported for preserving the version field.')
  const replaced = contents.replace(
    new RegExp(`^(${escapeRegExp(indent)}"version"\\s*:\\s*)"[^"]*"`, 'm'),
    `$1"${version}"`,
  )
  if (replaced === contents) throw new Error('JSON file has no top-level version field to update.')
  JSON.parse(replaced)
  return replaced
}

export function bumpCargoToml(contents, version) {
  const newline = contents.includes('\r\n') ? '\r\n' : '\n'
  const lines = contents.split(/\r?\n/)
  const packageStart = lines.findIndex((line) => line.trim() === '[package]')
  if (packageStart === -1) throw new Error('Cargo.toml has no [package] section.')

  for (let index = packageStart + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) break
    if (/^version\s*=\s*"[^"]*"\s*$/.test(lines[index])) {
      lines[index] = lines[index].replace(/^(version\s*=\s*)"[^"]*"(\s*)$/, `$1"${version}"$2`)
      return lines.join(newline)
    }
  }
  throw new Error('Cargo.toml [package] section has no version field to update.')
}

export function bumpCargoLock(contents, packageName, version) {
  const chunks = contents.split(/(?=\[\[package\]\]\r?\n)/)
  let matched = false
  const updated = chunks
    .map((chunk) => {
      if (!new RegExp(`^name = "${escapeRegExp(packageName)}"$`, 'm').test(chunk)) return chunk
      matched = true
      const replaced = chunk.replace(/^version = "[^"]*"$/m, `version = "${version}"`)
      if (replaced === chunk) throw new Error(`Cargo.lock package ${packageName} has no version field to update.`)
      return replaced
    })
    .join('')
  if (!matched) throw new Error(`Cargo.lock has no package entry named ${packageName}.`)
  return updated
}

// When a release succeeds, the bump promotes its notes from `Unreleased` to a
// dated version heading and starts the next `Unreleased` section. The release
// may have taken hours, so only the notes of `releasedChangelog`, the changelog
// of the released commit, are promoted; notes merged after it stay unreleased.
export function changelogWithBumpEntry(
  contents,
  version,
  releasedVersion,
  releaseDate = new Date().toISOString().slice(0, 10),
  releasedChangelog,
) {
  const newline = contents.includes('\r\n') ? '\r\n' : '\n'
  const lines = contents.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === '## [Unreleased]')
  if (start === -1) throw new Error('CHANGELOG.md has no ## [Unreleased] section.')

  const end = blockEnd(lines, start + 1, lines.length, /^## /)
  const entry = `- Bumped the application version to ${version}.`
  if (
    releasedVersion &&
    !lines.some(
      (line) => line.trim() === `## [${releasedVersion}]` || line.trim().startsWith(`## [${releasedVersion}] -`),
    )
  ) {
    const sections = parseSections(lines.slice(start + 1, end))
    const promoted = releasedChangelog === undefined ? sections : unreleasedSections(releasedChangelog)
    const released = new Set(promoted.flatMap((section) => section.items.map((item) => sectionItemKey(section, item))))
    const retained = keepItems(sections, (key) => !released.has(key))
    return withReleaseLinks(
      [
        ...lines.slice(0, start),
        '## [Unreleased]',
        '',
        ...renderSections(withBumpEntry(retained, entry)),
        `## [${releasedVersion}] - ${releaseDate}`,
        '',
        ...renderSections(promoted),
        ...lines.slice(end),
      ],
      releasedVersion,
    ).join(newline)
  }
  if (lines.slice(start + 1, end).some((line) => line.trim() === entry)) return contents

  const changed = findHeading(lines, start + 1, end, '### Changed')
  if (changed !== -1) {
    const at = lastContentIndex(lines, changed + 1, blockEnd(lines, changed + 1, end, /^#{2,3} /))
    lines.splice(at, 0, entry)
    return lines.join(newline)
  }

  const breaking = findHeading(lines, start + 1, end, '### Breaking changes')
  const at = lastContentIndex(lines, start + 1, breaking === -1 ? end : breaking)
  lines.splice(at, 0, '', '### Changed', '', entry)
  return lines.join(newline)
}

// A section ends at the next heading or at the link definitions of the file.
function blockEnd(lines, from, limit, headingPattern) {
  for (let index = from; index < limit; index += 1) {
    if (headingPattern.test(lines[index]) || /^\[[^\]]+\]:\s/.test(lines[index])) return index
  }
  return limit
}

// Groups a changelog block into `###` subsections of items; a wrapped bullet
// keeps its continuation lines, so an item can be compared and moved as a whole.
function parseSections(blockLines) {
  const sections = []
  let current = { heading: null, items: [] }
  const push = () => {
    if (current.heading !== null || current.items.length) sections.push(current)
  }
  for (const raw of blockLines) {
    const line = raw.trim()
    if (line.startsWith('### ')) {
      push()
      current = { heading: line, items: [] }
      continue
    }
    if (line === '') continue
    const last = current.items.at(-1)
    if (last && !line.startsWith('- ') && /^\s/.test(raw)) last.lines.push(raw)
    else current.items.push({ lines: [raw] })
  }
  push()
  return sections
}

function itemKey(item) {
  return item.lines.map((line) => line.trim()).join(' ')
}

function sectionItemKey(section, item) {
  return JSON.stringify([section.heading, itemKey(item)])
}

function keepItems(sections, predicate) {
  return sections
    .map((section) => ({ heading: section.heading, items: section.items.filter((item) => predicate(sectionItemKey(section, item))) }))
    .filter((section) => section.items.length > 0)
}

function renderSections(sections) {
  const lines = []
  for (const section of sections) {
    if (section.heading) lines.push(section.heading, '')
    for (const item of section.items) lines.push(...item.lines)
    lines.push('')
  }
  return lines
}

function withBumpEntry(sections, entry) {
  const changed = sections.find((section) => section.heading === '### Changed')
  if (changed) {
    if (!changed.items.some((item) => itemKey(item) === entry)) changed.items.push({ lines: [entry] })
    return sections
  }
  const section = { heading: '### Changed', items: [{ lines: [entry] }] }
  const breaking = sections.findIndex((item) => item.heading === '### Breaking changes')
  if (breaking === -1) sections.push(section)
  else sections.splice(breaking, 0, section)
  return sections
}

function unreleasedSections(changelog) {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === '## [Unreleased]')
  if (start === -1) return []
  const end = blockEnd(lines, start + 1, lines.length, /^## /)
  return parseSections(lines.slice(start + 1, end))
}

// The footer links follow the promotion: `Unreleased` compares from the tag of
// the released version, which gets its own comparison link.
function withReleaseLinks(lines, releasedVersion) {
  const index = lines.findIndex((line) => line.startsWith('[Unreleased]: '))
  if (index === -1) return lines
  const match = /^\[Unreleased\]:\s*(\S+\/compare\/)v(\S+?)\.\.\.HEAD\s*$/.exec(lines[index])
  if (!match) return lines

  const [, compareUrl, previous] = match
  if (previous === releasedVersion) return lines
  const updated = [...lines]
  updated[index] = `[Unreleased]: ${compareUrl}v${releasedVersion}...HEAD`
  if (!lines.some((line) => line.startsWith(`[${releasedVersion}]: `))) {
    updated.splice(index + 1, 0, `[${releasedVersion}]: ${compareUrl}v${previous}...v${releasedVersion}`)
  }
  return updated
}

function findHeading(lines, from, limit, heading) {
  for (let index = from; index < limit; index += 1) {
    if (lines[index].trim() === heading) return index
  }
  return -1
}

function lastContentIndex(lines, from, limit) {
  let index = limit
  while (index > from && lines[index - 1].trim() === '') index -= 1
  return index
}

// The workflow passes `--type`, `--from` and `--released-changelog`; local runs
// may omit them to bump from the current version in `src-tauri/tauri.conf.json`
// and promote the whole `Unreleased` section.
export function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!flag.startsWith('--')) throw new Error(`Unexpected argument '${flag}'.`)
    const name = flag.slice(2)
    const value = argv[index + 1]
    if (!['type', 'from', 'released-changelog'].includes(name)) throw new Error(`Unknown option '${flag}'.`)
    if (value === undefined) throw new Error(`${flag} needs a value.`)
    if (value.startsWith('--')) throw new Error(`${flag} needs a value, got '${value}'.`)
    args[name] = value
    index += 1
  }
  if (!args.type) throw new Error('--type needs a value.')
  if (!['patch', 'minor', 'major'].includes(args.type)) {
    throw new Error(`--type must be one of patch, minor, or major, got '${args.type}'.`)
  }
  if (args.from !== undefined) {
    try {
      parseVersion(args.from)
    } catch (error) {
      throw new Error(`--from ${error.message}`)
    }
  }
  return args
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeOutput(version) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Bumped main to ${version}.\n`)
}

function run(argv) {
  const args = parseArgs(argv)
  const tauriPath = join(root, 'src-tauri/tauri.conf.json')
  const from = args.from ?? readJson(tauriPath).version
  const version = nextVersion(from, args.type)
  const releasedChangelog = args['released-changelog']
    ? readFileSync(resolve(root, args['released-changelog']), 'utf8')
    : undefined

  const files = {
    packageJson: join(root, 'package.json'),
    tauriConfig: tauriPath,
    cargoToml: join(root, 'src-tauri/Cargo.toml'),
    cargoLock: join(root, 'src-tauri/Cargo.lock'),
    changelog: join(root, 'CHANGELOG.md'),
  }

  const updates = [
    [files.packageJson, bumpJson(readFileSync(files.packageJson, 'utf8'), version)],
    [files.tauriConfig, bumpJson(readFileSync(files.tauriConfig, 'utf8'), version)],
    [files.cargoToml, bumpCargoToml(readFileSync(files.cargoToml, 'utf8'), version)],
    [files.cargoLock, bumpCargoLock(readFileSync(files.cargoLock, 'utf8'), 'work-time-tracker', version)],
    [files.changelog, changelogWithBumpEntry(readFileSync(files.changelog, 'utf8'), version, from, undefined, releasedChangelog)],
  ]

  for (const [path, contents] of updates) writeFileSync(path, contents)

  writeOutput(version)
  console.log(`Bumped version from ${from} to ${version}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run(process.argv.slice(2))
  } catch (error) {
    console.error(`::error::${error.message}`)
    process.exit(1)
  }
}
