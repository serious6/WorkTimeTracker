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

Postgres is required for the native application; application tables live in the dedicated `wtt`
schema, leaving the default `public` schema empty. `WORK_TIME_TRACKER_ENV` decides which database
may be reached: `development` accepts a local host only, `production` a remote host only over a TLS
connection verified against a pinned certificate authority, and it never migrates the shared
database. The rules and their reasoning are recorded in
[`architecture/decisions.md`](architecture/decisions.md#separate-local-development-databases-from-verified-production-databases),
every setting in [`.env.example`](.env.example), and the secrets the release workflow injects in
[`docs/development.md`](docs/development.md#production-database-secrets).

## Legal documents

The account menu of the header opens the terms of service, the privacy policy and the third-party
license notices. Both legal texts live in
[`src/features/legal/legal-documents.ts`](src/features/legal/legal-documents.ts) and carry their own
version and date, so a wording change is a content change and the installed build always states the
revision it shows. Both texts distinguish the two storage modes: a local, self-hosted or browser
build keeps the data in the storage you configured, while a released production build stores it in a
hosted Postgres database in the EU, which the authors administer and may review to fix errors and
evaluate usage.

## Logs

Backend and user interface errors are appended to a redacted log file that rotates at 512 KiB.
[`docs/installation.md`](docs/installation.md) names its location and what the messages mean.

## Release

The `Release` workflow runs on manual dispatch. It checks that `package.json`,
`src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` declare the same version, runs the checks
listed in [`docs/development.md`](docs/development.md#release-checks), bundles the application on
Windows and macOS, and attaches those installers and the portable archives below to a GitHub
release tagged `v<version>`.

### Portable archives

Every release also carries `windows-x86_64-WorkTimeTracker-portable.zip` and
`macos-aarch64-WorkTimeTracker-portable.zip` for machines where nothing may be installed. Using one
is described in [`docs/installation.md`](docs/installation.md), how the release job builds and
checks it in [`docs/development.md`](docs/development.md#portable-archives).

## Documentation

- [`docs/installation.md`](docs/installation.md) — download, install, configure, and troubleshoot the application
- [`docs/development.md`](docs/development.md) — required tools, local setup, scripts, checks, and release checks
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution workflow, commit convention, and the pull request checklist
- [`AGENTS.md`](AGENTS.md) — concise instructions for coding agents and automation
- [`docs/ui-principles.md`](docs/ui-principles.md) — binding UI design principles and Laws of UX
- [`architecture/decisions.md`](architecture/decisions.md) — architecture decisions
- [`docs/data-model.md`](docs/data-model.md) — logical data model of the persistence layer in C4 style
- [`docs/e2e-test-cases.md`](docs/e2e-test-cases.md) — end-to-end test cases in Given/When/Then form
