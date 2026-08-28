# WorkTimeTracker

A local-first, open-source desktop work-time tracker built with Tauri 2.

## Stack

- Tauri 2 with typed Rust commands
- React, TypeScript, Vite, Tailwind CSS, and shadcn/ui-compatible components
- Zustand for local UI state and TanStack Query for asynchronous state
- Zod validation
- Drizzle SQLite schema with a bundled SQLite database managed by Rust
- Native versioned migrations with `rusqlite_migration`
- Recharts
- Vitest and Playwright
- LikeC4 architecture documentation

AI support is intentionally deferred.

## Prerequisites

- Node.js 26+
- Rust stable
- [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/)

All direct software dependencies use OSI-approved MIT, Apache-2.0, BSD, or compatible dual licenses. The application works locally without a proprietary runtime service.

## Development

```sh
npm ci
npm run tauri dev
```

For browser-only UI development:

```sh
npm run dev
```

## Quality checks

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run architecture:check
cargo test --manifest-path src-tauri/Cargo.toml
```

Build the web frontend or desktop application with `npm run build` and `npm run tauri build`.

## Release

The `Release` workflow runs on manual dispatch (Actions → Release → Run workflow). It runs the web, Rust, and end-to-end checks in parallel, then bundles the desktop application on Linux, Windows, and macOS and publishes the bundles as a GitHub release. The tag defaults to `v<version from src-tauri/tauri.conf.json>` and can be overridden per run. Downloadable installers are attached to the release on the repository's Releases page.

## Containers

The development container supports both Docker Compose and Podman Compose:

```sh
docker compose up --build
# or
podman compose up --build
```

The browser UI is then available at <http://localhost:1420>. Native Tauri windows should be run on the host because containers do not provide a desktop display server by default.

## Project layout

```text
architecture/        LikeC4 model
drizzle/             Versioned SQLite migrations
e2e/                 Playwright tests
src/
  app/               Application providers and navigation
  components/        Layout and shadcn/ui-compatible primitives
  db/                Drizzle schema
  features/          Dashboard, projects, time entries, time management, timer, settings, storage
  lib/               Date, error, and class-name helpers
  pages/             Projects, time entries, time management, reports, calendar, and settings views
src-tauri/
  src/commands.rs    Tauri command boundary
  src/database.rs    SQLite persistence
  src/window_state.rs Window size and position persistence
```

## Dashboard

The dashboard is the landing page and covers the daily workflow: start, pause, resume, stop,
and switch timers, manual time entries, day navigation, daily and weekly targets with overtime,
time distribution per project, and recent projects.

A running timer is a time entry without an end time, so durations are derived from timestamps
and survive restarts, sleep, and backgrounding. In the browser the same UI runs against a
`localStorage` repository, which keeps end-to-end tests independent from the native build.

## Time Management

Time Management adds already worked time retroactively. Pick a project and a date, then use the
quick-add buttons (15 min, 30 min, 1 hour, 1 day from the daily target) or `Custom` for free
durations such as `2h 45m`, `90m`, or `1.5h`. Entries are placed in the first free slot of that
day, so they never overlap existing entries, and can be edited or deleted in the list below.
