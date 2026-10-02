import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
const pagesWorkflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8')

function jobFor(jobName) {
  const start = workflow.indexOf(`  ${jobName}:\n`)
  if (start === -1) return undefined

  const bodyStart = start + jobName.length + 4
  const remaining = workflow.slice(bodyStart)
  const nextJob = remaining.search(/\n  [\w-]+:\n/)
  return remaining.slice(0, nextJob === -1 ? undefined : nextJob)
}

function conditionFor(jobName) {
  return jobFor(jobName)?.match(/^    if: \$\{\{\s*(.*?)\s*\}\}$/m)?.[1]
}

function releaseRuns({ bundle, fuzz, migration, cancelled }) {
  return !cancelled && bundle === 'success' && fuzz === 'success' && ['success', 'skipped'].includes(migration)
}

function diagnosticGateRuns({ release, releaseType, cancelled }) {
  return !cancelled && releaseType !== 'none' && release !== 'success'
}

function bumpRuns({ release, releaseType, cancelled }) {
  return !cancelled && release === 'success' && releaseType !== 'none'
}

describe('release workflow gates', () => {
  test('keeps the workflow conditions aligned with the gate behavior', () => {
    expect(conditionFor('release')).toBe(
      `always() && !cancelled() && needs.bundle.result == 'success' && needs.fuzz.result == 'success' && contains(fromJSON('["success", "skipped"]'), needs['migrate-production-database'].result)`,
    )
    expect(conditionFor('bump-version-gate')).toBe(
      `always() && !cancelled() && inputs.release_type != 'none' && needs.release.result != 'success'`,
    )
    expect(conditionFor('bump-version')).toBe(
      `!cancelled() && needs.release.result == 'success' && inputs.release_type != 'none'`,
    )
  })

  test('deploys GitHub Pages through the existing workflow after a successful release', () => {
    const pagesJob = jobFor('deploy-pages')

    expect(conditionFor('deploy-pages')).toBe(
      `!cancelled() && needs.release.result == 'success'`,
    )
    expect(pagesJob).toContain('uses: ./.github/workflows/pages.yml')
    expect(pagesJob).toContain('pages: write')
    expect(pagesJob).toContain('id-token: write')
    expect(pagesWorkflow).toMatch(/^  workflow_call:\s*$/m)
    expect(pagesWorkflow).toMatch(/uses: actions\/checkout@[^\n]+\n\s+with:\n\s+ref: main\n/)
  })

  test('promotes the changelog of the released commit, not the current main', () => {
    const bumpJob = jobFor('bump-version')

    expect(bumpJob).toContain('git show "$RELEASED_SHA:CHANGELOG.md"')
    expect(bumpJob).toContain('RELEASED_SHA: ${{ github.sha }}')
    expect(bumpJob).toContain('--released-changelog "$RELEASED_CHANGELOG"')
  })

  test('uses the built-in token and explicitly dispatches required checks for the bump pull request', () => {
    const bumpJob = jobFor('bump-version')
    const push = bumpJob.indexOf('git push --force-with-lease origin "$branch"')
    const pullRequest = bumpJob.indexOf('gh pr create --base main')
    const checks = bumpJob.indexOf('gh workflow run ci.yml --ref "$branch"')

    expect(bumpJob).not.toContain('create-github-app-token')
    expect(bumpJob).not.toContain('RELEASE_BOT_')
    expect(bumpJob).not.toContain('environment: production')
    expect(bumpJob).toContain('actions: write')
    expect(bumpJob).toContain('contents: write')
    expect(bumpJob).toContain('pull-requests: write')
    expect(bumpJob).toContain('token: ${{ github.token }}')
    expect(bumpJob).toContain('GH_TOKEN: ${{ github.token }}')
    expect(ciWorkflow).toMatch(/^  workflow_dispatch:\s*$/m)
    expect(push).toBeGreaterThan(-1)
    expect(pullRequest).toBeGreaterThan(push)
    expect(checks).toBeGreaterThan(pullRequest)
    expect(bumpJob).toContain(
      'git add package.json package-lock.json src/data/licenses.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/fuzz/Cargo.lock src-tauri/tauri.conf.json CHANGELOG.md',
    )
  })

  test.each([
    {
      name: 'successful release with skipped optional migration',
      bundle: 'success',
      fuzz: 'success',
      migration: 'skipped',
      release: 'success',
      releaseType: 'patch',
      cancelled: false,
      expected: [true, false, true],
    },
    {
      name: 'failed prerequisite skips release and runs diagnostic gate',
      bundle: 'failure',
      fuzz: 'success',
      migration: 'success',
      release: 'skipped',
      releaseType: 'patch',
      cancelled: false,
      expected: [false, true, false],
    },
    {
      name: 'skipped prerequisite skips release and runs diagnostic gate',
      bundle: 'success',
      fuzz: 'skipped',
      migration: 'success',
      release: 'skipped',
      releaseType: 'patch',
      cancelled: false,
      expected: [false, true, false],
    },
    {
      name: 'failed release runs diagnostic gate but never bumps',
      bundle: 'success',
      fuzz: 'success',
      migration: 'success',
      release: 'failure',
      releaseType: 'patch',
      cancelled: false,
      expected: [true, true, false],
    },
    {
      name: 'cancelled workflow runs neither follow-up gate',
      bundle: 'success',
      fuzz: 'success',
      migration: 'success',
      release: 'cancelled',
      releaseType: 'patch',
      cancelled: true,
      expected: [false, false, false],
    },
    {
      name: 'release_type none skips diagnostics and bump',
      bundle: 'success',
      fuzz: 'success',
      migration: 'success',
      release: 'success',
      releaseType: 'none',
      cancelled: false,
      expected: [true, false, false],
    },
  ])('$name', ({ expected, ...scenario }) => {
    expect([
      releaseRuns(scenario),
      diagnosticGateRuns(scenario),
      bumpRuns(scenario),
    ]).toEqual(expected)
  })
})
