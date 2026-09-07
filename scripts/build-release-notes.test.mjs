import { describe, expect, test } from 'vitest'

import { buildNotes, commitLimit, extractSection, parseCommits, previousTagOf, splitUpgradeImpact } from './build-release-notes.mjs'

const repositoryUrl = 'https://github.com/serious6/WorkTimeTracker'

const changelog = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  'Nothing yet.',
  '',
  '## [1.2.0] - 2026-09-07',
  '',
  '### Added',
  '',
  '- A weekly report.',
  '',
  '### Breaking changes',
  '',
  'The settings file moved.',
  '',
  '## [1.1.0] - 2026-08-01',
  '',
  '- Older release.',
  '',
  '[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v1.2.0...HEAD',
].join('\n')

describe('extractSection', () => {
  test('returns the body of the requested version without its heading', () => {
    expect(extractSection(changelog, '1.2.0')).toBe(
      '### Added\n\n- A weekly report.\n\n### Breaking changes\n\nThe settings file moved.',
    )
  })

  test('accepts a tag with the v prefix and stops at the next version', () => {
    expect(extractSection(changelog, 'v1.1.0')).toBe('- Older release.')
  })

  test('drops the version link definitions of the file', () => {
    expect(extractSection(changelog, 'Unreleased')).toBe('Nothing yet.')
    expect(extractSection(`${changelog}\n[1.2.0]: ${repositoryUrl}/releases/tag/v1.2.0`, 'v1.1.0')).toBe(
      '- Older release.',
    )
  })

  test('keeps the reference link definitions the section itself needs', () => {
    const withReference = [
      '## [1.0.0] - 2026-01-01',
      '',
      'See [the guide][install].',
      '',
      `[install]: ${repositoryUrl}/blob/main/docs/installation.md`,
    ].join('\n')

    expect(extractSection(withReference, '1.0.0')).toBe(
      `See [the guide][install].\n\n[install]: ${repositoryUrl}/blob/main/docs/installation.md`,
    )
  })

  test('returns null for a version the changelog does not describe or leaves empty', () => {
    expect(extractSection(changelog, '9.9.9')).toBeNull()
    expect(extractSection('## [1.0.0] - 2026-01-01\n\n## [0.9.0]\n\n- Older.', '1.0.0')).toBeNull()
  })
})

describe('splitUpgradeImpact', () => {
  test('moves the breaking changes out of the summary', () => {
    expect(splitUpgradeImpact(extractSection(changelog, '1.2.0'))).toEqual({
      highlights: '### Added\n\n- A weekly report.',
      upgrade: 'The settings file moved.',
    })
  })

  test('tolerates a missing section', () => {
    expect(splitUpgradeImpact(null)).toEqual({ highlights: '', upgrade: null })
  })

  test('reports no upgrade note when the section has none', () => {
    expect(splitUpgradeImpact('### Fixed\n\n- A rounding error.')).toEqual({
      highlights: '### Fixed\n\n- A rounding error.',
      upgrade: null,
    })
  })
})

describe('buildNotes', () => {
  const commits = [
    { sha: 'a'.repeat(40), subject: 'feat(reports): add the weekly report' },
    { sha: 'b'.repeat(40), subject: 'fix(timer): keep the running entry' },
  ]

  test('puts the summary first and the commits into a collapsed section', () => {
    const notes = buildNotes({
      version: '1.2.0',
      tag: 'v1.2.0',
      section: extractSection(changelog, '1.2.0'),
      commits,
      previousTag: 'v1.1.0',
      repositoryUrl,
    })

    expect(notes.indexOf('## Highlights')).toBe(0)
    expect(notes).toContain('- A weekly report.')
    expect(notes.indexOf('## Upgrade impact')).toBeLessThan(notes.indexOf('<details>'))
    expect(notes).toContain('The settings file moved.')
    expect(notes).toContain('<details><summary>Commits in this release</summary>')
    expect(notes).toContain(`- [\`aaaaaaa\`](${repositoryUrl}/commit/${'a'.repeat(40)}) feat(reports): add the weekly report`)
    expect(notes).toContain(`[Compare v1.1.0…v1.2.0](${repositoryUrl}/compare/v1.1.0...v1.2.0)`)
  })

  test('falls back to the standard upgrade sentence and the first-release link', () => {
    const notes = buildNotes({
      version: '0.1.0',
      tag: 'v0.1.0',
      section: '### Added\n\n- The first release.',
      commits,
      previousTag: null,
      repositoryUrl,
    })

    expect(notes).toContain('docs/installation.md')
    expect(notes).toContain('migrate_production_database')
    expect(notes).toContain(`[All commits up to v0.1.0](${repositoryUrl}/commits/v0.1.0)`)
  })

  test('summarises a range that exceeds the commit limit', () => {
    const many = Array.from({ length: commitLimit + 3 }, (_, index) => ({
      sha: String(index).padStart(40, '0'),
      subject: `chore: commit ${index}`,
    }))
    const notes = buildNotes({ version: '1.2.0', tag: 'v1.2.0', section: '- A change.', commits: many, repositoryUrl })

    expect(notes).toContain('…and 3 more commits.')
    expect(notes.split('\n').filter((line) => line.startsWith('- [`')).length).toBe(commitLimit)
  })

  test('points at the changelog when the section carries no text', () => {
    const notes = buildNotes({ version: '1.2.0', tag: 'v1.2.0', repositoryUrl })

    expect(notes).toContain(`See [CHANGELOG.md](${repositoryUrl}/blob/main/CHANGELOG.md) for the changes of 1.2.0.`)
  })

  test('states an empty commit range instead of leaving the section blank', () => {
    const notes = buildNotes({ version: '1.2.0', tag: 'v1.2.0', section: '- A change.', commits: [], repositoryUrl })

    expect(notes).toContain('No commits were recorded for this release.')
  })

  test('escapes the markup of a commit subject so it cannot close the collapsed section', () => {
    const notes = buildNotes({
      version: '1.2.0',
      tag: 'v1.2.0',
      section: '- A change.',
      commits: [{ sha: 'd'.repeat(40), subject: 'fix(ui): drop </details> & <script> from the title' }],
      repositoryUrl,
    })

    expect(notes).toContain('fix(ui): drop &lt;/details&gt; &amp; &lt;script&gt; from the title')
    expect(notes.split('</details>').length).toBe(2)
  })
})

describe('git helpers', () => {
  test('parses the log format of the script', () => {
    expect(parseCommits(`${'c'.repeat(40)}\tfix(db): reject an overlap\n\n`)).toEqual([
      { sha: 'c'.repeat(40), subject: 'fix(db): reject an overlap' },
    ])
  })

  test('reports no previous tag when the repository carries none', () => {
    expect(previousTagOf(() => '')).toBeNull()
    expect(
      previousTagOf(() => {
        throw new Error('fatal: no names found')
      }),
    ).toBeNull()
    expect(previousTagOf(() => 'v1.1.0')).toBe('v1.1.0')
  })
})
