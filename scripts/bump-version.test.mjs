import { describe, expect, test } from 'vitest'

import {
  bumpCargoLock,
  bumpCargoToml,
  bumpJson,
  bumpPackageLock,
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

  test('only rewrites root package metadata in package-lock.json', () => {
    const lock = [
      '{',
      '  "name": "work-time-tracker",',
      '  "version": "0.2.3",',
      '  "lockfileVersion": 3,',
      '  "requires": true,',
      '  "packages": {',
      '    "": {',
      '      "name": "work-time-tracker",',
      '      "version": "0.2.3",',
      '      "dependencies": {',
      '        "example": "0.2.3"',
      '      }',
      '    },',
      '    "node_modules/example": {',
      '      "version": "0.2.3"',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n')

    expect(bumpPackageLock(lock, '0.2.4')).toBe([
      '{',
      '  "name": "work-time-tracker",',
      '  "version": "0.2.4",',
      '  "lockfileVersion": 3,',
      '  "requires": true,',
      '  "packages": {',
      '    "": {',
      '      "name": "work-time-tracker",',
      '      "version": "0.2.4",',
      '      "dependencies": {',
      '        "example": "0.2.3"',
      '      }',
      '    },',
      '    "node_modules/example": {',
      '      "version": "0.2.3"',
      '    }',
      '  }',
      '}',
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

  test('keeps an existing release section and records the next version under Unreleased', () => {
    const updated = changelogWithBumpEntry(changelog, '1.2.4', '1.2.3', '2026-10-02')

    expect(updated).toContain(
      '## [Unreleased]\n\n### Changed\n\n- Bumped the application version to 1.2.4.\n\n## [1.2.3] - 2026-09-14',
    )
    expect(updated).not.toMatch(/^## \[1\.2\.4\]/m)
    expect(updated).toContain('[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.3...HEAD')
  })

  test('promotes Unreleased notes into a dated section for the released version', () => {
    const pending = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Fixed',
      '',
      '- A pending fix.',
      '',
      '[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.3...HEAD',
      '',
    ].join('\n')

    const updated = changelogWithBumpEntry(pending, '1.2.4', '1.2.3', '2026-10-02')

    expect(updated).toContain(
      '## [Unreleased]\n\n### Changed\n\n- Bumped the application version to 1.2.4.\n\n## [1.2.3] - 2026-10-02\n\n### Fixed\n\n- A pending fix.',
    )
  })

  test('rewrites the comparison links for the promoted version', () => {
    const pending = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Fixed',
      '',
      '- A pending fix.',
      '',
      '[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.2...HEAD',
      '[1.2.2]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.1...v1.2.2',
      '',
    ].join('\n')

    const updated = changelogWithBumpEntry(pending, '1.2.4', '1.2.3', '2026-10-02')

    expect(updated).toContain(
      '[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.3...HEAD\n[1.2.3]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.2...v1.2.3\n[1.2.2]:',
    )
  })

  test('promotes only the notes of the released changelog and keeps later ones unreleased', () => {
    const released = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Fixed',
      '',
      '- A released fix that wraps over',
      '  two lines.',
      '',
    ].join('\n')
    const pending = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Fixed',
      '',
      '- A released fix that wraps over',
      '  two lines.',
      '- A fix merged while the release was waiting.',
      '',
      '### Added',
      '',
      '- Something merged after the release.',
      '',
      '[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.2...HEAD',
      '',
    ].join('\n')

    const updated = changelogWithBumpEntry(pending, '1.2.4', '1.2.3', '2026-10-02', released)

    expect(updated).toContain(
      [
        '## [Unreleased]',
        '',
        '### Fixed',
        '',
        '- A fix merged while the release was waiting.',
        '',
        '### Added',
        '',
        '- Something merged after the release.',
        '',
        '### Changed',
        '',
        '- Bumped the application version to 1.2.4.',
        '',
        '## [1.2.3] - 2026-10-02',
        '',
        '### Fixed',
        '',
        '- A released fix that wraps over',
        '  two lines.',
        '',
      ].join('\n'),
    )
  })

  test.each(['\n', '\r\n'])('promotes the snapshot despite later edits, moves, or deletions (%j)', (newline) => {
    const released = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Fixed',
      '',
      '- An edited fix.',
      '- A moved fix.',
      '- A removed fix.',
      '- An unchanged fix.',
      '',
    ].join('\n')
    const pending = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Fixed',
      '',
      '- An edited fix with newer wording.',
      '- An unchanged fix.',
      '',
      '### Added',
      '',
      '- A moved fix.',
      '- An unchanged fix.',
      '- A later addition.',
      '',
      '## [1.2.2] - 2026-09-14',
      '',
      '### Fixed',
      '',
      '- An older fix.',
      '',
    ].join(newline)

    const updated = changelogWithBumpEntry(pending, '1.2.4', '1.2.3', '2026-10-02', released)

    expect(updated).toBe([
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Fixed',
      '',
      '- An edited fix with newer wording.',
      '',
      '### Added',
      '',
      '- A moved fix.',
      '- An unchanged fix.',
      '- A later addition.',
      '',
      '### Changed',
      '',
      '- Bumped the application version to 1.2.4.',
      '',
      '## [1.2.3] - 2026-10-02',
      '',
      '### Fixed',
      '',
      '- An edited fix.',
      '- A moved fix.',
      '- A removed fix.',
      '- An unchanged fix.',
      '',
      '## [1.2.2] - 2026-09-14',
      '',
      '### Fixed',
      '',
      '- An older fix.',
      '',
    ].join(newline))
    expect(changelogWithBumpEntry(updated, '1.2.4', '1.2.3', '2026-10-02', released)).toBe(updated)
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
