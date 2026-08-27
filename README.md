# WorkTimeTracker

A local-first, open-source desktop work-time tracker built with Tauri 2.

## Stack

- Tauri 2 with typed Rust commands
- React, TypeScript, Vite, Tailwind CSS, and shadcn/ui-compatible components
- Zustand for local UI state and TanStack Query for asynchronous state
- Zod validation
- Drizzle SQLite schema with a bundled SQLite database managed by Rust
- Recharts
- Vitest and Playwright
- LikeC4 architecture documentation

AI support is intentionally deferred.

## Prerequisites

- Node.js 22+
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
  app/               Application providers
  components/ui/     shadcn/ui-compatible primitives
  db/                Drizzle schema
  features/          Feature modules, state, validation, and queries
src-tauri/
  src/commands.rs    Tauri command boundary
  src/database.rs    SQLite persistence
```
