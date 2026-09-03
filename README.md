# WorkTimeTracker

A local-first, open-source desktop work-time tracker built with Tauri 2. The native app stores data
in a Postgres database you control, for example the bundled local compose service.

## Features

- **Dashboard**: start, pause, resume, stop, and switch timers, manual entries, day navigation,
  daily and weekly targets with overtime, a cumulative overtime balance carried across weeks and
  months, and time distribution per project.
- **Time Management**: add worked time retroactively via quick-add buttons or custom durations
  such as `2h 45m`; entries are placed in the first free slot of the day and never overlap.
- **Budgets**: per-project hour budgets with a due date; consumption and forecast appear in `Reports`.
- **Working Time**: breaks as entries of their own, warnings for the break, daily maximum and rest
  period limits, a monthly CSV or PDF record per employee, and the audit trail of every change.
- **Absences**: mark a day or a range as vacation, sick leave, unpaid leave, or half day. A full-day
  absence drops the target of a working day to zero, a half day keeps half of it, so the overtime
  balance stays correct. Absences appear in the monthly record and in their own audit trail.
- **Settings**: weekly working time and working days; the daily target is derived from both. The
  working time limits default to the German ArbZG and can be adjusted or restored.
- **Accounts**: registration with a strict password policy, Argon2id hashes, login lockout, and
  per-user data isolation.

## Stack

Tauri 2 with typed Rust commands, React, TypeScript, Vite, Tailwind CSS, Zustand, TanStack Query,
Zod, Drizzle schema and migrations, Postgres, Recharts, Vitest, Playwright, and LikeC4.

## Getting started

```sh
npm ci
cp .env.example .env
# Set POSTGRES_PASSWORD and DATABASE_URL in .env.
podman compose up -d db   # or: docker compose up -d db
npm run tauri dev         # desktop application
npm run dev               # browser-only UI at http://localhost:1420
```

Prerequisites and the contribution workflow are described in [`CONTRIBUTING.md`](CONTRIBUTING.md);
coding agents follow [`AGENTS.md`](AGENTS.md). Every change needs unit and end-to-end tests, and
every commit and pull request title follows Conventional Commits.

The development container runs the browser UI with `docker compose up --build` or
`podman compose up --build`. Native Tauri windows need a desktop display server and should be run
on the host. The compose stack starts Postgres by default and persists it in the `postgres_data`
volume.

## Database backend

Postgres is required for the native Tauri application. Copy `.env.example` to `.env`, set a local
`POSTGRES_PASSWORD`, set `DATABASE_URL` to the bundled database using the same password, and start
the compose service:

```sh
cp .env.example .env
# Set POSTGRES_PASSWORD and DATABASE_URL in .env.
podman compose up -d db   # or: docker compose up -d db
npm run tauri dev
```

Set `DATABASE_URL` to use `localhost` (or another loopback address) when running Tauri on the host.
Compose constructs the development container's URL with the service hostname `db`, because
`localhost` inside that container would not reach Postgres. The backend intentionally uses no TLS
and enforces this local-only model: TCP hosts other than `localhost`, loopback addresses, and the
compose hostname `db` are rejected before connecting. Remote Postgres servers are not supported.

This is a breaking storage change. Earlier local database files are not read or migrated by this
version; export any data you need before switching to the Postgres-only application.

`podman compose down -v` or `docker compose down -v` removes the `postgres_data` volume and
permanently deletes the local Postgres database.

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

## Application icon

`src-tauri/icons/app-icon.svg` is the source artwork; `public/favicon.svg` is the same mark for the
web build, and both repeat the paths of the in-app `AppLogo` component. Regenerate the bundled icon
set (`icon.ico`, `icon.icns`, and every PNG size) after changing the source:

```bash
npm run icons:generate
```

The command runs `tauri icon`, copies the desktop icons back into `src-tauri/icons` and records the
checksums of the artwork and of every generated file in `src-tauri/icons/icons.lock.json`. The unit
tests compare the committed files against that lock, so editing the artwork without regenerating
fails the test suite.

## Logs

Errors of the backend and of the user interface are appended to
`<app data directory>/logs/work-time-tracker.log`, for example
`~/.local/share/io.github.serious6.worktimetracker/logs/work-time-tracker.log` on Linux. Credentials, hashes,
e-mail addresses and file system paths are redacted, and the file is rotated once it exceeds
512 KiB.

## Release

The `Release` workflow runs on manual dispatch. It verifies that `package.json`,
`src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` declare the same version, runs all checks,
then bundles the desktop application on Linux, Windows, and macOS and attaches the installers to a
GitHub release tagged `v<version>`.

## Third-party licenses

`src/data/licenses.json` is the committed, build-time notice for production npm dependencies and
Rust crates. Run `npm run licenses:generate` after updating either lockfile; `npm run licenses:check`
verifies it is current. Development-only npm tools are excluded because they are not shipped.

## Documentation

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup, local runs, quality checks, commit conventions, and the pull request checklist
- [`AGENTS.md`](AGENTS.md) — detailed instructions for coding agents and automation
- [`architecture/decisions.md`](architecture/decisions.md) — architecture decisions
- [`docs/data-model.md`](docs/data-model.md) — logical data model of the persistence layer in C4 style
- [`docs/e2e-test-cases.md`](docs/e2e-test-cases.md) — end-to-end test cases in Given/When/Then form
- [`docs/security-advisories.md`](docs/security-advisories.md) — accepted dependency advisories and why
- [`docs/ui-principles.md`](docs/ui-principles.md) — binding UI and design principles, including the Laws of UX
- [`docs/ui-audit.md`](docs/ui-audit.md) — audit of every view against the UI design principles
