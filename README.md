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

## Installation

Installers and portable archives for every release, the required database settings, and what to do
when a start fails are described in one place: [`docs/installation.md`](docs/installation.md).

Running the application from the source code — prerequisites, the bundled Postgres service,
`npm run tauri dev` and the browser-only UI — is described in
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
[`docs/development.md`](docs/development.md#production-database-secrets) for the secrets the release
workflow injects.

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

Every release also carries `windows-x86_64-WorkTimeTracker-portable.zip` and
`macos-aarch64-WorkTimeTracker-portable.zip` for machines where nothing may be installed. They run
from any writable folder without administrator rights, need the remote database above because they
can neither install nor run a local Postgres, and read it from `WorkTimeTracker.env` next to the
application. The first start moves `DATABASE_URL` and `SUPABASE_DB_PASSWORD` into the credential
store of the user account — Windows Credential Manager or macOS Keychain — so the folder itself
never keeps a secret. Setting the file up is described in
[`docs/installation.md`](docs/installation.md), the bundling in
[`docs/development.md`](docs/development.md#portable-archives).

`src/data/licenses.json` is the committed license notice for shipped dependencies. Run
`npm run licenses:generate` after updating either lockfile; `npm run licenses:check` verifies it.

The secrets the release workflow reads for the production database, and how they are rotated, are
listed in [`docs/development.md`](docs/development.md#production-database-secrets).

## Documentation

- [`docs/installation.md`](docs/installation.md) — download, install, configure, and troubleshoot the application
- [`docs/development.md`](docs/development.md) — required tools, local setup, scripts, checks, and release checks
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution workflow, commit convention, and the pull request checklist
- [`AGENTS.md`](AGENTS.md) — concise instructions for coding agents and automation
- [`docs/ui-principles.md`](docs/ui-principles.md) — binding UI design principles and Laws of UX
- [`architecture/decisions.md`](architecture/decisions.md) — architecture decisions
- [`docs/data-model.md`](docs/data-model.md) — logical data model of the persistence layer in C4 style
- [`docs/e2e-test-cases.md`](docs/e2e-test-cases.md) — end-to-end test cases in Given/When/Then form
