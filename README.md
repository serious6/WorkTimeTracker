# WorkTimeTracker

A local-first, open-source desktop work-time tracker built with Tauri 2. All data stays in a local
SQLite database, no proprietary runtime service is required.

## Features

- **Dashboard**: start, pause, resume, stop, and switch timers, manual entries, day navigation,
  daily and weekly targets with overtime, and time distribution per project.
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

## Project layout

```text
architecture/   LikeC4 model and decision records
contract/       Domain rules shared by the Rust backend and the browser fallback
drizzle/        Versioned SQLite migrations
e2e/            Playwright tests
src/            React application (app, components, db, features, lib, pages)
src-tauri/src/  Rust backend (auth, commands, contract, database, error, window_state)
```

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
