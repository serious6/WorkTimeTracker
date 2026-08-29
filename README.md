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

## Continuous integration

The `CI` workflow targets a ≤2 minute wall-clock time on pull requests by running independent
checks as parallel jobs instead of one long sequential job:

| Job                       | What it runs                                    | ~Duration |
| -------------------------- | ------------------------------------------------ | --------- |
| `lint-typecheck-build`     | `lint`, `typecheck`, `architecture:check`, `build` | ~10s      |
| `test`                     | `test:coverage`                                   | ~2min       |
| `rust`                     | `cargo fmt --check`, `cargo test`                 | ~1min       |
| `end-to-end`               | Playwright `test:e2e`                             | ~1.3min     |
| `ci-success`               | Aggregates the results above for branch protection | instant   |

Compared with the previous single `web` job (lint → typecheck → test:coverage →
architecture:check → build, ~2m20s sequential) and `rust` job (~2m30s, dominated by a full
`npm run tauri build -- --no-bundle`), the changes are:

- **Parallel jobs instead of one long job**: the fast frontend checks and the slow unit-test run
  are now separate jobs, so the unit tests (the actual bottleneck, ~110s of jsdom/vitest
  execution) don't serialize behind lint/typecheck/build.
- **`npm run tauri build -- --no-bundle` is skipped on pull requests.** It fully recompiles the
  Rust app and the frontend, duplicating `cargo test` and the web `build` for ~60s of largely
  redundant signal. It still runs on every push to `main` (keeping `Swatinem/rust-cache` warm) and
  can be run on a PR on demand via **Actions → CI → Run workflow** (`workflow_dispatch`). Full
  cross-platform installer bundles are still built by the `Release` workflow.
- **Cached `node_modules`** via `.github/actions/setup-node` (keyed on `package-lock.json`), so
  `npm ci` is skipped on a cache hit instead of running in three jobs.
- **Cached apt packages** (`libayatana-appindicator3-dev`, `librsvg2-dev`,
  `libwebkit2gtk-4.1-dev`) with `awalsh128/cache-apt-pkgs-action` instead of an uncached
  `apt-get update && apt-get install` (~30-90s) on every run.
- **Path-based job skipping**: a `changes` job (`dorny/paths-filter`) skips the `rust` job when a
  pull request only touches frontend files, and skips the frontend jobs when it only touches
  `src-tauri/**`. Pushes to `main` and manual runs always run every job. A `ci-success` job
  aggregates the results so a skipped job doesn't break required status checks.

## Release

The `Release` workflow runs on manual dispatch. It verifies that `package.json`,
`src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` declare the same version, runs all checks,
then bundles the desktop application on Linux, Windows, and macOS and attaches the installers to a
GitHub release tagged `v<version>`.

## Documentation

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup, local runs, and quality checks
- [`architecture/decisions.md`](architecture/decisions.md) — architecture decisions
