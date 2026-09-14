import { describe, expect, test } from 'vitest'

import {
  bumpCargoLock,
  bumpCargoToml,
  bumpJson,
  changelogWithBumpEntry,
  nextVersion,
  parseArgs,
  parseVersion,
} from './bump-version.mjs'

describe('version and argument parsing', () => {
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
    expect(() => parseArgs(['--from', '--type', 'patch'])).toThrow(/--from needs a value, got '--type'/)
  })

  test('rejects an invalid released version argument before running the bump', () => {
    expect(() => parseArgs(['--type', 'patch', '--from', '1.2.3-beta'])).toThrow(
      /--from Version must be plain MAJOR\.MINOR\.PATCH/,
    )
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

  test('preserves CRLF line endings when rewriting Cargo.toml', () => {
    const cargoToml = [
      '[package]',
      'name = "work-time-tracker"',
      'version = "1.2.3"',
      '',
      '[dependencies]',
      'serde = { version = "1.0", features = ["derive"] }',
      '',
    ].join('\r\n')

    expect(bumpCargoToml(cargoToml, '1.2.4')).toBe([
      '[package]',
      'name = "work-time-tracker"',
      'version = "1.2.4"',
      '',
      '[dependencies]',
      'serde = { version = "1.0", features = ["derive"] }',
      '',
    ].join('\r\n'))
  })

  test('preserves JSON formatting around the version field', () => {
    const json = '{\n  "name": "work-time-tracker",\n  "version": "1.2.3",\n  "private": true\n}\n'

    expect(bumpJson(json, '1.2.4')).toBe('{\n  "name": "work-time-tracker",\n  "version": "1.2.4",\n  "private": true\n}\n')
  })

  test('only rewrites the top-level JSON version field', () => {
    const json = [
      '{',
      '  "name": "work-time-tracker",',
      '  "config": {',
      '    "version": "9.9.9"',
      '  },',
      '  "version": "1.2.3"',
      '}',
      '',
    ].join('\n')

    expect(bumpJson(json, '1.2.4')).toBe([
      '{',
      '  "name": "work-time-tracker",',
      '  "config": {',
      '    "version": "9.9.9"',
      '  },',
      '  "version": "1.2.4"',
      '}',
      '',
    ].join('\n'))
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

  test('rewrites Cargo.lock package blocks with CRLF line endings', () => {
    const lock = [
      '[[package]]',
      'name = "serde"',
      'version = "1.0.0"',
      '',
      '[[package]]',
      'name = "work-time-tracker"',
      'version = "1.2.3"',
      '',
    ].join('\r\n')

    expect(bumpCargoLock(lock, 'work-time-tracker', '1.2.4')).toBe([
      '[[package]]',
      'name = "serde"',
      'version = "1.0.0"',
      '',
      '[[package]]',
      'name = "work-time-tracker"',
      'version = "1.2.4"',
      '',
    ].join('\r\n'))
  })

  test('rejects a Cargo.lock without the workspace package entry', () => {
    const lock = ['[[package]]', 'name = "serde"', 'version = "1.0.0"', ''].join('\n')

    expect(() => bumpCargoLock(lock, 'work-time-tracker', '1.2.4')).toThrow(/no package entry/)
  })
})

describe('changelogWithBumpEntry', () => {
  const changelog = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [1.2.3] - 2026-09-14',
    '',
    '### Changed',
    '',
    '- Bumped the application version to 1.2.3.',
    '',
    '[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.3...HEAD',
    '[1.2.3]: https://github.com/serious6/WorkTimeTracker/releases/tag/v1.2.3',
    '',
  ].join('\n')

  test('records the bump under Unreleased instead of dating a new section', () => {
    const updated = changelogWithBumpEntry(changelog, '1.2.4')

    expect(updated).toContain(
      '## [Unreleased]\n\n### Changed\n\n- Bumped the application version to 1.2.4.\n\n## [1.2.3] - 2026-09-14',
    )
    expect(updated).not.toMatch(/^## \[1\.2\.4\]/m)
    expect(updated).toContain('[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.3...HEAD')
  })

  test('appends to an existing Changed subsection and keeps later subsections', () => {
    const withEntries = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Changed',
      '',
      '- Something changed.',
      '',
      '### Breaking changes',
      '',
      'None.',
      '',
      '## [1.2.3] - 2026-09-14',
      '',
    ].join('\n')

    expect(changelogWithBumpEntry(withEntries, '1.2.4')).toContain(
      '### Changed\n\n- Something changed.\n- Bumped the application version to 1.2.4.\n\n### Breaking changes',
    )
  })

  test('adds the Changed subsection before Breaking changes', () => {
    const withBreaking = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Added',
      '',
      '- Something new.',
      '',
      '### Breaking changes',
      '',
      'None.',
      '',
    ].join('\n')

    expect(changelogWithBumpEntry(withBreaking, '1.2.4')).toContain(
      '- Something new.\n\n### Changed\n\n- Bumped the application version to 1.2.4.\n\n### Breaking changes',
    )
  })

  test('does not add a duplicate entry when it is already there', () => {
    const once = changelogWithBumpEntry(changelog, '1.2.4')

    expect(changelogWithBumpEntry(once, '1.2.4')).toBe(once)
  })

  test('rejects a changelog without an Unreleased section', () => {
    expect(() => changelogWithBumpEntry('# Changelog\n', '1.2.4')).toThrow(/no ## \[Unreleased\] section/)
  })
})
