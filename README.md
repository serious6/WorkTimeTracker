# WorkTimeTracker

A local-first, open-source desktop work-time tracker built with Tauri 2. All data stays in a local
SQLite database, no proprietary runtime service is required.

## Features

- **Dashboard**: start, pause, resume, stop, and switch timers, manual entries, day navigation,
  daily and weekly targets with overtime, a cumulative overtime balance carried across weeks and
  months, and time distribution per project.
- **Time Management**: add worked time retroactively via quick-add buttons or custom durations
  such as `2h 45m`; entries are placed in the first free slot of the day and never overlap.
- **Budgets**: per-project hour budgets with a due date; consumption and forecast appear in `Reports`.
- **Settings**: weekly working time and working days; the daily target is derived from both.
- **Accounts**: registration with a strict password policy, Argon2id hashes, login lockout, and
  per-user data isolation.

## Stack

Tauri 2 with typed Rust commands, React, TypeScript, Vite, Tailwind CSS, Zustand, TanStack Query,
Zod, Drizzle schema with `rusqlite_migration`, Recharts, Vitest, Playwright, and LikeC4.

## Getting started

```sh
npm ci
npm run tauri dev   # desktop application
npm run dev         # browser-only UI at http://localhost:1420
```

Prerequisites and the contribution workflow are described in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

The development container runs the browser UI with `docker compose up --build` or
`podman compose up --build`. Native Tauri windows need a desktop display server and should be run
on the host. Its SQLite database persists in the `app_data` volume at
`/root/.local/share/io.github.serious6.worktimetracker/work-time-tracker.sqlite`.

## Database backend

The app defaults to an embedded SQLite file and needs no extra setup. It can be pointed at a
Postgres server instead, for example one started locally via Podman/Docker compose:

```sh
cp .env.example .env             # then edit as needed
podman compose --profile postgres up -d   # or: docker compose --profile postgres up -d
npm run tauri dev                # or: npm run dev
```

Backend selection is driven by environment variables (see `.env.example`):

- `WTT_DB_BACKEND` — `sqlite` (default) or `postgres`.
- `DATABASE_URL` — Postgres connection string, only read when the backend is `postgres`.
- `WTT_SQLITE_PATH` — optional override of the SQLite file location.

Running `podman compose up -d` (without `--profile postgres`) behaves exactly as before and never
starts the `db` service. `podman compose down -v` removes the `postgres_data` volume and
permanently deletes the Postgres database — only use it when you intend to discard local data.

## Project layout

```text
architecture/   LikeC4 model and decision records
contract/       Domain rules shared by the Rust backend and the browser fallback
docs/           Data model and further documentation
drizzle/        Versioned SQLite migrations (drizzle/postgres for the optional Postgres backend)
e2e/            Playwright tests
src/            React application (app, components, db, features, lib, pages)
src-tauri/src/  Rust backend (auth, commands, contract, database, error, logging, window_state)
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
