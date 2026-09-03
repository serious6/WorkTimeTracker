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

Install Node.js and Rust, copy `.env.example` to `.env`, start the bundled Postgres service, then
run `npm run tauri dev` for the desktop application or `npm run dev` for the browser-only UI at
<http://localhost:1420>. The exact commands, prerequisites, and the contribution workflow are in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Database

Postgres is required for the native application. `DATABASE_URL` must point at `localhost`, another
loopback address, or the compose hostname `db`; every other TCP host is rejected before connecting.
The connection intentionally uses no TLS, and remote Postgres servers are not supported.

Removing the `postgres_data` volume permanently deletes the local database. Database files of
earlier versions are neither read nor migrated; export what you need before switching.

## Project layout

```text
architecture/   LikeC4 model and decision records
contract/       Domain rules shared by the Rust backend and the browser fallback
docs/           Data model and further documentation
drizzle/        Single Postgres migration applied by the Rust backend and Drizzle
e2e/            Playwright tests
src/            React application (app, components, db, features, lib, pages)
src-tauri/src/  Rust backend (auth, commands, error, logging, postgres_store, window_state)
```

Errors of the backend and of the user interface are appended to
`<app data directory>/logs/work-time-tracker.log`, redacted and rotated at 512 KiB.

## Release

The `Release` workflow runs on manual dispatch. It checks that `package.json`,
`src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` declare the same version, runs all checks,
bundles the application on Linux, Windows, and macOS, and attaches the installers to a GitHub
release tagged `v<version>`. `Containerfile.build` builds the same Linux bundle formats locally
in a container, on its own pinned Debian and Rust base images rather than the runner image and
toolchain of the workflow, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

`src/data/licenses.json` is the committed license notice for shipped dependencies. Run
`npm run licenses:generate` after updating either lockfile; `npm run licenses:check` verifies it.

## Documentation

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup, local runs, quality checks, and the UI design principles
- [`architecture/decisions.md`](architecture/decisions.md) — architecture decisions
- [`docs/data-model.md`](docs/data-model.md) — logical data model of the persistence layer in C4 style
- [`docs/e2e-test-cases.md`](docs/e2e-test-cases.md) — end-to-end test cases in Given/When/Then form
- [`docs/security-advisories.md`](docs/security-advisories.md) — accepted dependency advisories and why
- [`docs/ui-audit.md`](docs/ui-audit.md) — audit of every view against the UI design principles
