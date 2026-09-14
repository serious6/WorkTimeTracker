import { describe, expect, test } from 'vitest'

import {
  bumpCargoLock,
  bumpCargoToml,
  bumpJson,
  changelogWithSection,
  nextVersion,
  parseArgs,
  parseVersion,
} from './bump-version.mjs'

describe('nextVersion', () => {
  test.each([
    ['1.2.3', 'patch', '1.2.4'],
    ['1.9.9', 'minor', '1.10.0'],
    ['1.2.3', 'major', '2.0.0'],
  ])('bumps %s as %s to %s', (version, type, expected) => {
    expect(nextVersion(version, type)).toBe(expected)
  })

  test.each(['1.2', '1.2.3-beta', '', 'one.2.3', '01.2.3'])('rejects invalid version %s', (version) => {
    expect(() => parseVersion(version)).toThrow(/plain MAJOR\.MINOR\.PATCH/)
  })

  test('rejects an unknown release type', () => {
    expect(() => parseArgs(['--type', 'daily'])).toThrow(/must be one of patch, minor, or major/)
  })

  test('parses the released version argument', () => {
    expect(parseArgs(['--type', 'patch', '--from', '1.2.3'])).toEqual({ type: 'patch', from: '1.2.3' })
  })

  test('rejects a missing released version argument', () => {
    expect(() => parseArgs(['--type', 'patch', '--from'])).toThrow(/--from needs a value/)
  })
})

describe('metadata rewrites', () => {
  test('only rewrites the package version in Cargo.toml', () => {
    const cargoToml = [
      '[package]',
      'name = "work-time-tracker"',
      'version = "1.2.3"',
      '',
      '[dependencies]',
      'serde = { version = "1.0", features = ["derive"] }',
      'postgres = "0.19.14"',
      '',
    ].join('\n')

    expect(bumpCargoToml(cargoToml, '1.2.4')).toBe([
      '[package]',
      'name = "work-time-tracker"',
      'version = "1.2.4"',
      '',
      '[dependencies]',
      'serde = { version = "1.0", features = ["derive"] }',
      'postgres = "0.19.14"',
      '',
    ].join('\n'))
  })

  test('preserves JSON formatting around the version field', () => {
    const json = '{\n  "name": "work-time-tracker",\n  "version": "1.2.3",\n  "private": true\n}\n'

    expect(bumpJson(json, '1.2.4')).toBe('{\n  "name": "work-time-tracker",\n  "version": "1.2.4",\n  "private": true\n}\n')
  })

  test('only rewrites the workspace package version in Cargo.lock', () => {
    const lock = [
      '[[package]]',
      'name = "serde"',
      'version = "1.0.0"',
      '',
      '[[package]]',
      'name = "work-time-tracker"',
      'version = "1.2.3"',
      'dependencies = [',
      ' "serde",',
      ']',
      '',
    ].join('\n')

    expect(bumpCargoLock(lock, 'work-time-tracker', '1.2.4')).toBe([
      '[[package]]',
      'name = "serde"',
      'version = "1.0.0"',
      '',
      '[[package]]',
      'name = "work-time-tracker"',
      'version = "1.2.4"',
      'dependencies = [',
      ' "serde",',
      ']',
      '',
    ].join('\n'))
  })
})

describe('changelogWithSection', () => {
  const changelog = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [1.2.3] - 2026-09-14',
    '',
    '- Previous release.',
    '',
    '[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.3...HEAD',
    '[1.2.3]: https://github.com/serious6/WorkTimeTracker/releases/tag/v1.2.3',
    '',
  ].join('\n')

  test('adds exactly one new empty section after Unreleased', () => {
    const updated = changelogWithSection(changelog, '1.2.4', new Date('2026-09-15T12:00:00Z'))

    expect(updated).toContain('## [Unreleased]\n\n## [1.2.4] - 2026-09-15\n\n## [1.2.3] - 2026-09-14')
    expect(updated.match(/^## \[1\.2\.4\]/gm)).toHaveLength(1)
    expect(updated).toContain('[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.4...HEAD')
    expect(updated).toContain('[1.2.4]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.3...v1.2.4')
  })

  test('does not add a duplicate when the version section already exists', () => {
    const once = changelogWithSection(changelog, '1.2.4', new Date('2026-09-15T12:00:00Z'))

    expect(changelogWithSection(once, '1.2.4', new Date('2026-09-16T12:00:00Z'))).toBe(once)
  })

  test('refreshes links when the version section already exists', () => {
    const stale = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '## [1.2.4] - 2026-09-15',
      '',
      '## [1.2.3] - 2026-09-14',
      '',
      '[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.3...HEAD',
      '[1.2.3]: https://github.com/serious6/WorkTimeTracker/releases/tag/v1.2.3',
      '',
    ].join('\n')

    const updated = changelogWithSection(stale, '1.2.4', new Date('2026-09-16T12:00:00Z'))

    expect(updated).toContain('## [1.2.4] - 2026-09-15')
    expect(updated).not.toContain('## [1.2.4] - 2026-09-16')
    expect(updated.match(/^## \[1\.2\.4\]/gm)).toHaveLength(1)
    expect(updated).toContain('[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.4...HEAD')
    expect(updated).toContain('[1.2.4]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.3...v1.2.4')
  })
})
