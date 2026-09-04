import { describe, expect, test } from 'vitest'

import { fileProblems, problems, secretKeys } from './assert-portable-env.mjs'

const example = [
  '# Configuration of a portable installation.',
  'WORK_TIME_TRACKER_ENV=production',
  'DATABASE_URL=',
  'SUPABASE_DB_HOST=',
  'SUPABASE_DB_PASSWORD=',
  'SUPABASE_DB_ROOT_CERT=database-ca.pem',
].join('\n')

describe('fileProblems', () => {
  test('accepts the shipped example with empty secrets', () => {
    expect(fileProblems('WorkTimeTracker.env.example', example)).toEqual([])
  })

  test('accepts a file whose secrets moved into the credential store', () => {
    expect(
      fileProblems(
        'WorkTimeTracker.env.example',
        'DATABASE_URL=stored-in-credential-store\nSUPABASE_DB_PASSWORD=stored-in-credential-store\n',
      ),
    ).toEqual([])
  })

  test('reports a value for a secret setting without printing it', () => {
    const found = fileProblems(
      'WorkTimeTracker.env.example',
      "DATABASE_URL=******db.example.org/postgres\nSUPABASE_DB_PASSWORD='hunter2'\n",
    )

    expect(found).toHaveLength(2)
    for (const problem of found) {
      expect(problem).not.toContain('hunter2')
      expect(problem).toContain('WorkTimeTracker.env.example')
    }
    expect(found[0]).toContain(secretKeys[0])
    expect(found[1]).toContain(secretKeys[1])
  })

  test('reports a filled-in configuration file in the archive', () => {
    expect(fileProblems('portable/WorkTimeTracker.env', example)).toEqual([
      'portable/WorkTimeTracker.env is a configured connection; a portable archive ships the example only',
    ])
  })

  test('ignores comments and settings that carry no secret', () => {
    expect(
      fileProblems(
        'WorkTimeTracker.env.example',
        '# DATABASE_URL=******db.example.org/postgres\nSUPABASE_DB_HOST=db.example.org\n',
      ),
    ).toEqual([])
  })
})

describe('problems', () => {
  test('collects the problems of every env file of the archive', () => {
    expect(
      problems([
        { name: 'WorkTimeTracker.env.example', contents: example },
        { name: 'nested/WorkTimeTracker.env.example', contents: 'SUPABASE_DB_PASSWORD=hunter2\n' },
      ]),
    ).toEqual([
      'nested/WorkTimeTracker.env.example carries a value for the secret setting SUPABASE_DB_PASSWORD',
    ])
  })
})
