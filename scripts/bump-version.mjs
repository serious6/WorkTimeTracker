import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const versionPattern = '(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)'
const versionHeading = new RegExp(`^## \\[${versionPattern}\\] - \\d{4}-\\d{2}-\\d{2}$`)

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
  return chunks
    .map((chunk) => {
      if (!new RegExp(`^name = "${escapeRegExp(packageName)}"$`, 'm').test(chunk)) return chunk
      const replaced = chunk.replace(/^version = "[^"]*"$/m, `version = "${version}"`)
      if (replaced === chunk) throw new Error(`Cargo.lock package ${packageName} has no version field to update.`)
      return replaced
    })
    .join('')
}

export function changelogWithSection(contents, version, date = new Date()) {
  const newline = contents.includes('\r\n') ? '\r\n' : '\n'
  const heading = `## [${version}] - ${date.toISOString().slice(0, 10)}`
  const lines = contents.split(/\r?\n/)
  const unreleased = lines.findIndex((line) => line.trim() === '## [Unreleased]')
  if (unreleased === -1) throw new Error('CHANGELOG.md has no ## [Unreleased] section.')

  const { exists, insert, previousVersion } = changelogSectionPlan(lines, version, unreleased)
  const body =
    exists
      ? contents
      : [
          ...trimTrailingBlankLines(lines.slice(0, insert)),
          '',
          heading,
          '',
          ...trimLeadingBlankLines(lines.slice(insert)),
        ].join(newline)

  return updateChangelogLinks(body, version, previousVersion, newline)
}

function changelogSectionPlan(lines, version, unreleased) {
  const section = lines.findIndex((line) => line.startsWith(`## [${version}] - `))
  if (section !== -1) {
    return {
      exists: true,
      insert: section,
      previousVersion: nextChangelogVersion(lines, section + 1),
    }
  }

  const firstVersion = lines.findIndex((line, index) => index > unreleased && versionHeading.test(line))
  const insert = firstVersion === -1 ? lines.length : firstVersion
  return {
    exists: false,
    insert,
    previousVersion: changelogVersion(lines[insert]),
  }
}

function nextChangelogVersion(lines, start) {
  for (let index = start; index < lines.length; index += 1) {
    const version = changelogVersion(lines[index])
    if (version) return version
  }
  return null
}

function changelogVersion(line) {
  const match = versionHeading.exec(line ?? '')
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null
}

// The workflow passes `--type` and `--from`; local runs may omit `--from` to
// bump from the current version in `src-tauri/tauri.conf.json`.
export function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!flag.startsWith('--')) throw new Error(`Unexpected argument '${flag}'.`)
    const name = flag.slice(2)
    const value = argv[index + 1]
    if (!['type', 'from'].includes(name)) throw new Error(`Unknown option '${flag}'.`)
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value.`)
    args[name] = value
    index += 1
  }
  if (!args.type) throw new Error('--type needs a value.')
  if (!['patch', 'minor', 'major'].includes(args.type)) {
    throw new Error(`--type must be one of patch, minor, or major, got '${args.type}'.`)
  }
  if (args.from !== undefined) parseVersion(args.from)
  return args
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function trimTrailingBlankLines(lines) {
  const copy = [...lines]
  while (copy.length > 0 && copy.at(-1) === '') copy.pop()
  return copy
}

function trimLeadingBlankLines(lines) {
  const copy = [...lines]
  while (copy.length > 0 && copy[0] === '') copy.shift()
  return copy
}

function updateChangelogLinks(contents, version, previousVersion, newline = '\n') {
  const unreleased = contents.match(/^\[Unreleased\]:\s*(.+)$/m)?.[1]
  if (!unreleased) return contents

  const compareBase = unreleased.replace(/\/compare\/.*$/, '/compare')
  const releaseBase = unreleased.replace(/\/compare\/.*$/, '/releases/tag')
  const previousTag = previousVersion ? `v${previousVersion}` : null
  const lines = contents.split(/\r?\n/).filter((line) => {
    if (line.startsWith('[Unreleased]: ')) return false
    return !line.startsWith(`[${version}]: `)
  })

  const linksStart = lines.findIndex((line) => /^\[(Unreleased|\d[^\]]*)\]:\s/.test(line))
  const linkLines = [
    `[Unreleased]: ${compareBase}/v${version}...HEAD`,
    previousTag
      ? `[${version}]: ${compareBase}/${previousTag}...v${version}`
      : `[${version}]: ${releaseBase}/v${version}`,
  ]
  if (linksStart === -1) {
    return [...trimTrailingBlankLines(lines), '', ...linkLines, ''].join(newline)
  }
  lines.splice(linksStart, 0, ...linkLines)
  return lines.join(newline)
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
    [files.changelog, changelogWithSection(readFileSync(files.changelog, 'utf8'), version)],
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
