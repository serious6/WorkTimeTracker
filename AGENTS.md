# Agent instructions

Instructions for coding agents and automation working in this repository. Contributors get the
short version in [`CONTRIBUTING.md`](CONTRIBUTING.md); everything here is binding for both.

## Project overview

WorkTimeTracker is a local-first, open-source desktop application built with Tauri 2: a
TypeScript/React frontend and a Rust backend that stores the data in a Postgres database the user
controls. The domain is personal work time:

- **Tracking**: start, pause, resume, stop and switch a timer; a running timer is a `time_entries`
  row with `end_time` NULL, and durations are derived from the timestamps.
- **Entries and projects**: manual and retroactive entries, per-project budgets, notes, an audit
  trail of every change. Entries of one user never overlap.
- **Breaks and limits**: breaks are entries of their own and are checked against the break, daily
  maximum and rest period limits (German ArbZG defaults).
- **Absences and overtime**: vacation, sick leave, unpaid and half days reduce the daily target;
  the overtime balance is derived from targets and tracked time, only explicit records are stored.
- **Reports and exports**: dashboards, weekly views, time per project and a monthly CSV or PDF
  record.

Known constraints: offline-first (no network calls other than the local database), cross-platform
(Windows, macOS, Linux), and every timestamp is stored with its offset — never assume a fixed
timezone or ignore DST when computing a duration or a day boundary.

## Repository layout

```text
architecture/       LikeC4 model and decision records (read decisions.md before changing behaviour)
contract/           domain-rules.json, shared by the Rust backend and the browser fallback
docs/               data model, e2e test cases, UI principles and audit, security advisories
drizzle/            numbered Postgres migrations
e2e/                Playwright specs (*.spec.ts) and the shared helpers.ts
scripts/            repository tooling, for example the icon and license generators
src/                React application
  app/              shell, navigation
  components/ui/    the sanctioned UI kit
  db/               Drizzle schema
  features/<name>/  feature slices (schema, hooks, components) — the unit of organisation
  lib/              framework-free helpers (date, errors, logger, redact)
  pages/            one component per view
  test/             harness.tsx and setup.ts for the unit tests
src-tauri/src/      Rust backend (auth, commands, config, contract, error, logging,
                    postgres_store, store, models, window_state)
```

Test conventions:

- Frontend unit tests sit next to their subject as `<name>.test.ts` / `<name>.test.tsx` under
  `src/` and are the only files Vitest collects.
- Rust tests are `#[cfg(test)]` modules in the file they cover; helpers live in `test_support.rs`.
- End-to-end tests are `e2e/<topic>.spec.ts` and reuse the helpers in `e2e/helpers.ts`
  (`register`, `login`, `createProject`, `addEntry`, `dialog`, `trackingCard`, `dateKey`).
  Every case is documented in [`docs/e2e-test-cases.md`](docs/e2e-test-cases.md).

## Setup and tooling

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js + npm | 26+ | frontend, Vite, Playwright, Tauri CLI |
| Rust + Cargo | 1.95+ stable (edition 2021) | Tauri backend |
| Tauri CLI | `@tauri-apps/cli` 2.x, via `npm run tauri` | dev and bundle |
| PostgreSQL | 18, e.g. the `db` service of `compose.yaml` | native storage |
| Podman or Docker + Compose | — | running that database |

Platform prerequisites for a native build: MSVC Build Tools on Windows (the GNU toolchain cannot
link the `cdylib`) plus WebView2, Xcode Command Line Tools on macOS, and on Linux the packages
`libwebkit2gtk-4.1-dev`, `librsvg2-dev` and `libayatana-appindicator3-dev`. See the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci                          # installs the frontend and the CLI tools
cp .env.example .env            # set POSTGRES_PASSWORD, DATABASE_URL, POSTGRES_CONTAINER_URL
podman compose up -d db         # or: docker compose up -d db
```

The browser-only UI needs Node.js alone; it stores its data in `localStorage` and is what the
Playwright suite runs against.

## Common commands

| Purpose | Command |
| --- | --- |
| Browser UI (port 1420) | `npm run dev` |
| Desktop application | `npm run tauri dev` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm test` |
| Unit tests with coverage gate | `npm run test:coverage` |
| One unit test file | `npx vitest run src/features/timer/timer-store.test.ts` |
| One unit test by name | `npx vitest run -t "setSession stores a session"` |
| End-to-end tests | `npm run test:e2e` |
| One e2e file or test | `npx playwright test e2e/projects.spec.ts -g "P1"` |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` |
| One Rust test | `cargo test --manifest-path src-tauri/Cargo.toml overlap` |
| Rust format | `cargo fmt --manifest-path src-tauri/Cargo.toml --check` |
| Architecture model | `npm run architecture:check` |
| License notice | `npm run licenses:check` (regenerate with `npm run licenses:generate`) |

Playwright browsers are not always installed in a fresh environment; run
`npx playwright install --with-deps chromium` once before `npm run test:e2e`. The Rust tests that
need a database skip without a reachable `DATABASE_URL`; CI sets `REQUIRE_POSTGRES_TESTS=1` to turn
that skip into a failure, so run them the same way when you touch `postgres_store.rs`.

## Testing policy (mandatory)

- Every new feature and every bugfix ships with **unit tests**: frontend logic and component tests
  under `src/` (Vitest, Testing Library, the harness in `src/test/harness.tsx`), and `#[cfg(test)]`
  tests for Rust changes.
- Every user-facing change ships with an **end-to-end test** in `e2e/` that covers the happy path
  and at least one failure or edge case (rejected input, conflict, empty state), and is documented
  in `docs/e2e-test-cases.md`.
- A bugfix starts with a test that fails without the fix.
- A change to a validation, overlap or limit rule is added to `contract/domain-rules.json` first,
  so both the Rust and the TypeScript contract suite assert it.
- Tests are deterministic: never read the real clock. Use `vi.useFakeTimers()` /
  `vi.setSystemTime()` in unit tests and fixed dates or the `dateKey` helper in e2e tests, and
  never depend on the machine timezone or on the order of the tests.
- Coverage must stay at or above the 80 percent gate of `npm run test:coverage`.
- The full suite must pass locally before a pull request is opened.

## Commit policy

Commits and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org/)
— the repository squash-merges, so the pull request title becomes the commit message and CI
rejects a title that does not parse.

```text
<type>(<optional scope>)<optional !>: <imperative summary>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`, `perf`, `style`, `revert`.
Common scopes: `ui`, `tracker`, `timer`, `entries`, `projects`, `budgets`, `absences`, `overtime`,
`settings`, `auth`, `db`, `tauri`, `docs`, `ci`, `deps`.

```text
feat(timer): switch the running entry to another project
fix(db): reject an entry that overlaps a running timer
docs(agents): document the testing policy
test(overtime): cover the manual balance adjustment
refactor(ui)!: replace the toast store with a provider

BREAKING CHANGE: consumers must render <Toaster /> inside the provider.
```

A breaking change is marked with `!` after the type or scope **and** a `BREAKING CHANGE:` footer.
The summary is lower case, imperative and without a trailing period.

## Code style

- **TypeScript**: strict mode; no `any` and no non-null assertion to silence the compiler. Validate
  external data with Zod schemas from the feature slice. `npm run lint` (oxlint) and
  `npm run typecheck` must be clean.
- **React**: function components, feature slices under `src/features/<name>/`, state in Zustand
  stores, server state through TanStack Query. Reuse the kit in `src/components/ui/` and the tokens
  in `src/index.css`; the binding UI rules are in [`docs/ui-principles.md`](docs/ui-principles.md).
- **Rust**: `cargo fmt` clean, idiomatic `Result` handling, no `unwrap`/`expect` in command paths.
  Run `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets` and add no new warnings
  (the existing ones are not part of the CI gate, `cargo fmt --check` and `cargo test` are).
- **Errors across the IPC boundary**: commands return the `AppError` enum
  (`notSignedIn`, `validation`, `conflict`, `notFound`, `rateLimited`, `database`, `internal`,
  `src-tauri/src/error.rs`); the frontend branches on `kind` via `src/lib/errors.ts`, never on the
  message text. New commands are written with the `authed_command!` macro so the session check
  cannot be forgotten, and are registered in `src-tauri/src/lib.rs`. Every capability the frontend
  uses must exist in both backends: the Rust commands and the browser fallback
  (`src/features/storage/local-repository.ts`) behind the `Repository` type.
- **Comments** explain why, not what, and match the tone of the surrounding file.

## Persistence and IPC

The native backend talks to Postgres only (`src-tauri/src/postgres_store.rs`, connection from
`DATABASE_URL`, local hosts only). Migrations are the numbered files in `drizzle/`, applied once in
a transaction by `MIGRATIONS` in `postgres_store.rs` and recorded in `schema_migrations`; the
Drizzle schema in `src/db/schema.ts` and [`docs/data-model.md`](docs/data-model.md) describe the
same tables. In the browser the same data lives in `localStorage`, scoped per user.

The complete IPC command inventory is the `invoke_handler` list in `src-tauri/src/lib.rs`,
implemented in `src-tauri/src/commands.rs`. The frontend never calls `invoke` directly: it goes
through the `Repository` type in `src/features/storage/`, which resolves to `tauri-repository.ts`
in the app and to `local-repository.ts` in the browser. A new command therefore needs the Rust
command, its registration, the `Repository` method and both implementations.

## Release and versioning

`package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` must declare the same
version. The `Release` workflow is dispatched manually, verifies that the versions match, runs all
checks, bundles the installers for Linux, Windows and macOS and publishes them as the GitHub
release `v<version>`. `Containerfile.build` produces the same Linux bundles locally, see
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Definition of Done

- [ ] The change is scoped to one topic and touches no unrelated code.
- [ ] Unit tests cover the new logic (frontend and/or Rust).
- [ ] An e2e test covers the user-facing path, happy case plus one failure case, and is listed in
      `docs/e2e-test-cases.md`.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run test:e2e`,
      `npm run architecture:check`, `npm run licenses:check`, `npm run build`,
      `cargo fmt --check` and `cargo test` pass.
- [ ] A schema change comes with a new numbered file in `drizzle/`, is appended to `MIGRATIONS` in
      `src-tauri/src/postgres_store.rs`, and updates `src/db/schema.ts` and `docs/data-model.md`.
- [ ] Documentation that the change invalidates is updated (README, `docs/`, `architecture/`).
- [ ] Every commit and the pull request title follow Conventional Commits.

## Do and don't

Do:

- Keep the two backends, the contract file and their tests in sync.
- Add a decision to `architecture/decisions.md` when you change how something works, not only what.
- Prefer the existing dependencies; a new one needs an OSI-approved open-source license and a
  regenerated `src/data/licenses.json`.

Don't:

- Commit secrets, `.env` files, credentials, build artifacts (`dist/`, `target/`, `node_modules/`)
  or generated files that a command produces.
- Change the database schema without a migration, and never edit an applied migration —
  `drizzle/0000_init.sql` is the immutable baseline.
- Log or display credentials, hashes, e-mail addresses or file system paths; the redaction rules in
  `src-tauri/src/logging.rs` and `src/lib/redact.ts` stay mirrored.
- Weaken or delete an existing test to make a change pass, or reformat files you did not otherwise
  touch.
