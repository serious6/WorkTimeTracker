import { describe, expect, test } from 'vitest'

import { hosts, problems } from './assert-local-database.mjs'

describe('hosts', () => {
  test('reads the authority of a URL and the hosts of a keyword/value string', () => {
    expect(hosts('postgresql://user@localhost:5432/worktimetracker')).toEqual(['localhost'])
    expect(hosts('postgresql://user@[::1]:5432/worktimetracker')).toEqual(['::1'])
    expect(hosts('host=localhost,db hostaddr=127.0.0.1 dbname=worktimetracker')).toEqual([
      'localhost',
      'db',
      '127.0.0.1',
    ])
  })

  test('reads the host parameters of the query of a URL as well', () => {
    expect(hosts('postgresql://user@localhost/worktimetracker?host=db.codehub.org')).toEqual([
      'localhost',
      'db.codehub.org',
    ])
    expect(
      hosts('postgresql://user@localhost/worktimetracker?sslmode=verify-full&hostaddr=203.0.113.8'),
    ).toEqual(['localhost', '203.0.113.8'])
    expect(hosts('postgresql://user@localhost/worktimetracker?host=db%2Ecodehub%2Eorg')).toEqual([
      'localhost',
      'db.codehub.org',
    ])
  })
})

describe('problems', () => {
  test('accepts the local database of the compose stack', () => {
    expect(problems({ DATABASE_URL: 'postgresql://user@localhost:5432/worktimetracker' })).toEqual(
      [],
    )
    expect(problems({ DATABASE_URL: 'host=db dbname=worktimetracker' })).toEqual([])
  })

  test('reports a remote host in the authority of a URL', () => {
    expect(problems({ DATABASE_URL: 'postgresql://user@db.codehub.org/worktimetracker' })).toEqual([
      'DATABASE_URL points at the remote host "db.codehub.org"',
    ])
  })

  test('reports a remote host that only the query of a URL names', () => {
    expect(
      problems({ DATABASE_URL: 'postgresql://user@localhost/worktimetracker?host=db.codehub.org' }),
    ).toEqual(['DATABASE_URL points at the remote host "db.codehub.org"'])
  })

  test('reports a production mode and the secrets of a deployment', () => {
    expect(
      problems({
        WORK_TIME_TRACKER_ENV: 'production',
        DATABASE_URL: 'postgresql://user@localhost/worktimetracker',
        SUPABASE_DB_PASSWORD: 'secret',
      }),
    ).toEqual([
      'WORK_TIME_TRACKER_ENV is "production"; a test job must run in development mode',
      'SUPABASE_DB_PASSWORD is set; deployment secrets belong to the release job only',
    ])
  })
})
