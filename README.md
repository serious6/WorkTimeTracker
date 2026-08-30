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
podman compose up -d db   # or: docker compose up -d db
npm run tauri dev         # desktop application
npm run dev               # browser-only UI at http://localhost:1420
```

Prerequisites and the contribution workflow are described in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

The development container runs the browser UI with `docker compose up --build` or
`podman compose up --build`. Native Tauri windows need a desktop display server and should be run
on the host. The compose stack starts Postgres by default and persists it in the `postgres_data`
volume.

## Database backend

Postgres is required for the native Tauri application. Copy `.env.example` to `.env`, keep the
default `DATABASE_URL` for the bundled local database, and start the compose service:

```sh
cp .env.example .env
podman compose up -d db   # or: docker compose up -d db
npm run tauri dev
```

The built-in `DATABASE_URL` default matches the compose `db` service; `.env.example` shows
the full local connection string. `DATABASE_URL` may point at another Postgres instance, but the
connection is unencrypted (the backend connects without TLS), so only local endpoints such as
`localhost` or a container on the same host are supported. Remote or TLS-required servers need
transport encryption, which this version does not implement.

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

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup, local runs, and quality checks
- [`architecture/decisions.md`](architecture/decisions.md) — architecture decisions
- [`docs/data-model.md`](docs/data-model.md) — logical data model of the persistence layer in C4 style
- [`docs/security-advisories.md`](docs/security-advisories.md) — accepted dependency advisories and why
