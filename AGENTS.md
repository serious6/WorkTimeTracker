# Agent instructions

Concise instructions for coding agents and automation. Human workflow details live in
[`CONTRIBUTING.md`](CONTRIBUTING.md); setup, scripts, and local checks live in
[`docs/development.md`](docs/development.md).

## Project purpose and hard constraints

WorkTimeTracker is a local-first, open-source Tauri 2 desktop app for personal work time tracking.
It has a TypeScript/React frontend and a Rust backend that stores native app data in Postgres.

- Offline-first: do not add network calls other than the configured database connection.
- Cross-platform: Windows, macOS, and Linux must keep working.
- Timestamps are canonical UTC ISO 8601 with milliseconds (`2026-08-27T08:00:00.000Z`). The
  original offset is not stored; derive local days and durations in the current timezone and account
  for DST.
- Frontend data access goes through `src/features/storage/`; keep the Tauri repository and browser
  fallback in sync.
- Validation, overlap, and limit rules live in `contract/domain-rules.json` and are asserted by the
  Rust and TypeScript contract tests.

## Repository layout

```text
architecture/       LikeC4 model and architecture decisions
contract/           Shared domain and entity contracts
docs/               Development guide, data model, e2e cases, UI and security docs
drizzle/            Postgres migration baseline
e2e/                Playwright specs and helpers
scripts/            Repository tooling
src/                React app: app, components, db, features, lib, pages, test
src-tauri/src/      Rust backend: auth, commands, config, connection, contract, models, store
```

## Test conventions

- Frontend unit tests sit next to the subject as `<name>.test.ts` or `<name>.test.tsx` under `src/`.
- Script tests sit next to the script as `scripts/<name>.test.mjs`.
- Rust tests are `#[cfg(test)]` modules in the file they cover; shared helpers live in
  `src-tauri/src/test_support.rs`.
- End-to-end tests are `e2e/<topic>.spec.ts`, use `e2e/helpers.ts`, and are documented in
  [`docs/e2e-test-cases.md`](docs/e2e-test-cases.md).
- Tests are deterministic: mock the clock, use fixed dates, and do not depend on timezone or test
  order.

## Common commands

| Purpose | Command |
| --- | --- |
| Install dependencies | `npm ci` |
| Browser UI | `npm run dev` |
| Desktop app | `npm run tauri dev` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm test` |
| Unit tests with coverage gate | `npm run test:coverage` |
| One unit test file | `npx vitest run src/features/timer/timer-store.test.ts` |
| End-to-end tests | `npm run test:e2e` |
| Rust format | `cargo fmt --manifest-path src-tauri/Cargo.toml --check` |
| Rust lint | `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets` |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Architecture model | `npm run architecture:check` |
| License notice | `npm run licenses:check` |

## Change rules

- Keep changes scoped to the task; do not reformat unrelated files.
- Documentation and comments stay concise and function-oriented: explain why, invariants, error
  cases, or domain rules, not what the code already says.
- New dependencies must be OSI-approved open source and require regenerated license data.
- Do not commit secrets, `.env` files, credentials, `dist/`, `target/`, or `node_modules/`.
