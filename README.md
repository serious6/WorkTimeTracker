# WorkTimeTracker

A local-first, open-source desktop work-time tracker built with Tauri 2. Data stays in a Postgres
database you control, for example the bundled compose service.

## Features

- **Dashboard**: start, pause, resume, stop, and switch timers; day navigation; daily and weekly
  targets with a cumulative overtime balance; time distribution per project.
- **Time Management**: add worked time retroactively via quick-add buttons or durations such as
  `2h 45m`; entries are placed in the first free slot of the day and never overlap.
- **Budgets**: per-project hour budgets with a due date; consumption and forecast appear in `Reports`.
- **Working Time**: breaks as entries of their own, warnings for break, daily maximum and rest
  period limits, a monthly CSV or PDF record per employee, and an audit trail of every change.
- **Absences**: vacation, sick leave, unpaid leave, or half day for a day or a range. A full-day
  absence drops that day's target to zero, a half day keeps half of it.
- **Settings**: weekly working time and working days; the daily target follows from both. The
  working time limits default to the German ArbZG and can be adjusted or restored.
- **Accounts**: registration with a strict password policy, Argon2id hashes, login lockout, and
  per-user data isolation.

## Stack

Tauri 2 with typed Rust commands, React, TypeScript, Vite, Tailwind CSS, Zustand, TanStack Query,
Zod, Drizzle schema and migrations, Postgres, Recharts, Vitest, Playwright, and LikeC4.

## Getting started

Install Node.js 26+ and Rust 1.95+, copy `.env.example` to `.env`, start the bundled
Postgres service, then run `npm run tauri dev` for the desktop application or `npm run dev` for the
browser-only UI at <http://127.0.0.1:1420>. Commands and prerequisites are in
[`docs/development.md`](docs/development.md). The contribution workflow is in
[`CONTRIBUTING.md`](CONTRIBUTING.md); coding agents follow [`AGENTS.md`](AGENTS.md).

## Database

Postgres is required for the native application. Application tables live in the dedicated `wtt`
schema, leaving the default `public` schema empty. `WORK_TIME_TRACKER_ENV` selects how the
database is reached and defaults to `development`.

- `development` — `DATABASE_URL` must point at `localhost`, another loopback address, or the
  compose hostname `db`; every other TCP host is rejected before connecting. The connection uses no
  TLS, which is what the bundled database offers. Development, the tests, the Playwright suite and
  every CI job run in this mode.
- `production` — the connection may name a remote host, but only over TLS with the certificate
  chain *and* the host name verified (`sslmode=verify-full`) against the certificate authority
  pinned in `SUPABASE_DB_ROOT_CERT`. There is no setting that relaxes this: an unverifiable
  certificate fails the start instead of falling back to an unencrypted connection. A production
  process never migrates the shared database, it only verifies that the migrations are applied.

The production connection is configuration, never part of the repository: `DATABASE_URL` wins when
it is set, otherwise it is assembled from `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`,
`SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD` and `SUPABASE_DB_NAME`. A missing or malformed value
fails the start with a redacted message. See [`.env.example`](.env.example) for every variable and
the release section below for the secrets the workflow injects.

Removing the `postgres_data` volume permanently deletes the local database. Database files of
earlier versions are neither read nor migrated; export what you need before switching.

## Legal documents

The account menu of the header opens the terms of service, the privacy policy and the third-party
license notices. Both legal texts live in
[`src/features/legal/legal-documents.ts`](src/features/legal/legal-documents.ts) and carry their own
version and date, so a wording change is a content change and the installed build always states the
revision it shows. Both texts distinguish the two storage modes: a local, self-hosted or browser
build keeps the data in the storage you configured, while a released production build stores it in
the hosted Postgres database in the EU described above, which the authors administer and may review
to fix errors and evaluate usage.

## Logs

Errors of the backend and of the user interface are appended to
`<app data directory>/logs/work-time-tracker.log`, redacted and rotated at 512 KiB.

## Release

The `Release` workflow runs on manual dispatch. It checks that `package.json`,
`src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` declare the same version, runs the checks
listed in [`docs/development.md`](docs/development.md#release-checks), bundles the application on
Windows and macOS, and attaches those installers and the portable archives below to a GitHub
release tagged `v<version>`.

### Portable archives

Every release also contains `windows-x86_64-WorkTimeTracker-portable.zip` and
`macos-aarch64-WorkTimeTracker-portable.zip` for machines where nothing may be installed. Unpack
the archive into any folder you may write to and start `WorkTimeTracker.exe` or
`WorkTimeTracker.app` from there; no administrator rights are needed. Windows needs the WebView2
runtime, which is part of Windows 10 and 11. The archives are not signed, so SmartScreen and
Gatekeeper warn about them once; on macOS the quarantine flag is removed with
`xattr -d com.apple.quarantine WorkTimeTracker.app`.

A portable installation requires the remote database described above, because it can neither
install nor run a local Postgres. It reads its connection from `WorkTimeTracker.env` next to the
application — beside `WorkTimeTracker.exe` on Windows and beside `WorkTimeTracker.app` on macOS, so
the file survives replacing the bundle. Copy the included `WorkTimeTracker.env.example`, fill in the
settings of [`.env.example`](.env.example), and restrict the file to your account
(`chmod 600 WorkTimeTracker.env`); a relative `SUPABASE_DB_ROOT_CERT` path is resolved against that
folder, so the pinned certificate authority travels with the archive. A value that the process
environment already carries wins over the file, so a managed deployment can still override it.

The folder may be copied or synchronized, so it never keeps a secret. On the first start
`DATABASE_URL` and `SUPABASE_DB_PASSWORD` are moved into the credential store of the user
account — the Windows Credential Manager, which protects them with DPAPI in the scope of the
current user, and the macOS Keychain, both available without administrator rights — and the file
keeps the marker `stored-in-credential-store` in their place. Only the host, the port, the database
name and the path of the certificate authority stay readable. Deleting the file forgets the
connection: the next start removes the stored secrets as well. The application refuses to start on a
file that others may read, on a secret it can neither store nor read back, and on a certificate it
cannot verify against the pinned authority; every message names the file and the setting, never a
value. Application data and logs stay in the user profile directory, and a portable installation is
updated by hand.

`src/data/licenses.json` is the committed license notice for shipped dependencies. Run
`npm run licenses:generate` after updating either lockfile; `npm run licenses:check` verifies it.

### Production database secrets

The `migrate-production-database` job of the workflow is the only place that sees the production
database. It runs in the protected `production` environment, so its secrets are available to no
other job, none of them is ever printed, and it only runs when the dispatch input
`migrate_production_database` asks for it — a shared database is migrated deliberately, never by an
installation that starts. The bundles contain none of these values; a deployment provides them to
the application at run time. The workflow reads, by name only:

| Secret | Purpose |
| --- | --- |
| `SUPABASE_DATABASE_URL` | complete connection string including `sslmode=verify-full`; wins over the parts below |
| `SUPABASE_DB_HOST` | host of the database, for example the connection pooler of the project |
| `SUPABASE_DB_PORT` | port, `6543` for the pooler and `5432` for a direct connection |
| `SUPABASE_DB_USER` | the dedicated least-privilege application role, never `postgres` |
| `SUPABASE_DB_PASSWORD` | password of that role |
| `SUPABASE_DB_NAME` | database name |
| `SUPABASE_DB_ROOT_CERT` | the certificate authority in PEM form; the job writes it to a file and passes its path to the application |

To rotate the credentials, change the password of the role in the Supabase dashboard (or create the
replacement role), update `SUPABASE_DB_PASSWORD` — or `SUPABASE_DATABASE_URL`, if that is the form
in use — in the `production` environment, and run the workflow again. Rotating the certificate
authority means replacing `SUPABASE_DB_ROOT_CERT` with the downloaded PEM file; nothing in the
repository has to change for either.

## Documentation

- [`docs/development.md`](docs/development.md) — required tools, local setup, scripts, checks, and release checks
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution workflow, commit convention, and the pull request checklist
- [`AGENTS.md`](AGENTS.md) — concise instructions for coding agents and automation
- [`docs/ui-principles.md`](docs/ui-principles.md) — binding UI design principles and Laws of UX
- [`architecture/decisions.md`](architecture/decisions.md) — architecture decisions
- [`docs/data-model.md`](docs/data-model.md) — logical data model of the persistence layer in C4 style
- [`docs/e2e-test-cases.md`](docs/e2e-test-cases.md) — end-to-end test cases in Given/When/Then form
