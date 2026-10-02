import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
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

    expect(conditionFor('deploy-pages')).toBe(`needs.release.result == 'success'`)
    expect(pagesJob).toContain('uses: ./.github/workflows/pages.yml')
    expect(pagesJob).toContain('pages: write')
    expect(pagesJob).toContain('id-token: write')
    expect(pagesWorkflow).toMatch(/^  workflow_call:\s*$/m)
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
