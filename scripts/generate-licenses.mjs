import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'src/data/licenses.json')
const missingText = 'License text unavailable in this build environment.'
const previous = existsSync(output) ? readJson(output) : undefined

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function text(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return value.name ?? value.email ?? null
  return null
}

function repository(value) {
  const url = typeof value === 'string' ? value : value?.url
  if (!url) return null
  const normalized = url.replace(/^git\+/, '').replace(/^git:\/\//, 'https://')
  const githubShorthand = normalized.match(/^(?:github:)?([^/:]+\/[^/]+(?:\/[^#]+)?)(#.+)?$/)
  if (githubShorthand) return `https://github.com/${githubShorthand[1]}${githubShorthand[2] ?? ''}`
  return normalized.replace(/^git@github\.com:/, 'https://github.com/')
}

function license(metadata) {
  return typeof metadata.license === 'string'
    ? metadata.license
    : Array.isArray(metadata.licenses)
      ? metadata.licenses.map((item) => item.type).filter(Boolean).join(' OR ') || 'UNKNOWN'
      : 'UNKNOWN'
}

function licenseText(directory, licenseFile) {
  if (!existsSync(directory)) return missingText
  const candidates = licenseFile
    ? [licenseFile]
    : readdirSync(directory)
        .filter((name) => /^(licen[cs]e|copying|notice|unlicense)([._-]|$)/i.test(name))
        .sort()
  const contents = []
  for (const candidate of candidates) {
    const file = join(directory, candidate)
    try {
      contents.push(readFileSync(file, 'utf8'))
    } catch {
      // A metadata license file may point outside the package directory.
    }
  }
  return contents.length ? contents.join('\n\n---\n\n') : missingText
}

function packageLicenseText(directory, metadata) {
  return licenseText(directory, metadata.licenseFile ?? metadata.license_file)
}

function npmPackages() {
  const lock = readJson(join(root, 'package-lock.json'))
  return Object.entries(lock.packages)
    .filter(([path, entry]) => path && !entry.dev && path.startsWith('node_modules/'))
    .map(([path]) => {
      const metadata = readJson(join(root, path, 'package.json'))
      return {
        name: metadata.name,
        version: metadata.version,
        license: license(metadata),
        publisher: text(metadata.publisher) ?? text(metadata.author),
        repository: repository(metadata.repository) ?? metadata.homepage ?? null,
        licenseText: packageLicenseText(join(root, path), metadata),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
}

function cargoMetadata() {
  try {
    return JSON.parse(
      execFileSync(
        'cargo',
        ['metadata', '--locked', '--format-version', '1', '--manifest-path', 'src-tauri/Cargo.toml'],
        { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
      ),
    ).packages
  } catch {
    console.warn('Could not run cargo metadata; reading available Cargo.toml files instead.')
    return []
  }
}

function crateMetadata(directory) {
  if (!directory) return {}
  const manifest = readFileSync(join(directory, 'Cargo.toml'), 'utf8')
  return {
    license: manifest.match(/^license = "(.+)"$/m)?.[1],
    license_file: manifest.match(/^license-file = "(.+)"$/m)?.[1],
    repository: manifest.match(/^repository = "(.+)"$/m)?.[1],
    homepage: manifest.match(/^homepage = "(.+)"$/m)?.[1],
    authors: [...(manifest.match(/^authors = \[(.+)\]$/m)?.[1]?.matchAll(/"([^"]+)"/g) ?? [])].map(
      (match) => match[1],
    ),
  }
}

function cargoPackages() {
  const metadataByNameAndVersion = new Map(
    cargoMetadata().map((item) => [`${item.name}@${item.version}`, item]),
  )
  const lock = readFileSync(join(root, 'src-tauri/Cargo.lock'), 'utf8')
  const packages = [...lock.matchAll(/\[\[package\]\]\n([\s\S]*?)(?=\n\[\[package\]\]|\s*$)/g)]
    .map((match) => ({
      name: match[1].match(/^name = "(.+)"$/m)?.[1],
      version: match[1].match(/^version = "(.+)"$/m)?.[1],
      source: match[1].match(/^source = "(.+)"$/m)?.[1],
    }))
    .filter((item) => item.name && item.version && item.source?.startsWith('registry+'))

  const registrySources = join(process.env.CARGO_HOME ?? join(process.env.HOME ?? '', '.cargo'), 'registry/src')
  return packages
    .map((item) => {
      const metadata = metadataByNameAndVersion.get(`${item.name}@${item.version}`)
      const directory = existsSync(registrySources)
        ? readdirSync(registrySources)
            .flatMap((registry) => [
              join(registrySources, registry, `${item.name}-${item.version}`),
              join(registrySources, registry, `${item.name}-${item.version.split('+')[0]}`),
            ])
            .find(existsSync)
        : undefined
      const sourceMetadata = crateMetadata(directory)
      const crate = metadata ?? sourceMetadata
      const committed = previous?.rust.find(
        (candidate) => candidate.name === item.name && candidate.version === item.version,
      )
      if (!directory && committed) return committed
      return {
        name: item.name,
        version: item.version,
        license: crate.license ?? 'UNKNOWN',
        publisher: crate.authors?.join(', ') || null,
        repository: crate.repository ?? crate.homepage ?? null,
        licenseText: directory ? packageLicenseText(directory, crate) : missingText,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
}

const packageJson = readJson(join(root, 'package.json'))
const next = { appVersion: packageJson.version, npm: npmPackages(), rust: cargoPackages() }
const fingerprint = (data) => createHash('sha256').update(JSON.stringify(data)).digest('hex')
const generatedAt =
  previous && fingerprint(next) === fingerprint({ appVersion: previous.appVersion, npm: previous.npm, rust: previous.rust })
    ? previous.generatedAt
    : new Date(process.env.SOURCE_DATE_EPOCH ? Number(process.env.SOURCE_DATE_EPOCH) * 1000 : Date.now()).toISOString()
const result = { generatedAt, ...next }
const content = `${JSON.stringify(result, null, 2)}\n`

if (process.argv.includes('--check')) {
  if (!existsSync(output) || readFileSync(output, 'utf8') !== content) {
    console.error(`License notices are stale. Run: npm run licenses:generate (${relative(root, output)})`)
    process.exitCode = 1
  }
} else {
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, content)
}
