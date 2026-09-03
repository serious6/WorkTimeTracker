# Contributing

Detailed rules for agents and automation are in [`AGENTS.md`](AGENTS.md); this page is the short
version for humans.

## Prerequisites

| Software | Version | Needed for | Notes |
| --- | --- | --- | --- |
| Node.js + npm | 26+ | Frontend, Vite dev server, Tauri CLI | Enough on its own for `npm run dev` |
| Rust + Cargo | 1.95+ (stable) | Tauri backend | Install via [rustup](https://rustup.rs/) |
| C toolchain | — | Linking the Rust backend | **Windows**: MSVC Build Tools (`x86_64-pc-windows-msvc`); the GNU toolchain cannot link the `cdylib` target. **macOS**: Xcode Command Line Tools. **Linux**: see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) |
| WebView runtime | — | Native window | **Windows**: WebView2, preinstalled on Windows 11. macOS ships WKWebView, Linux needs `webkit2gtk` |
| Podman or Docker (+ Compose) | — | Postgres via `compose.yaml` | Not needed with a local Postgres |
| PostgreSQL | 18 | Backend storage | Provided by the compose `db` service |

## Local development

```sh
npm ci
cp .env.example .env       # set POSTGRES_PASSWORD, DATABASE_URL, POSTGRES_CONTAINER_URL
podman compose up -d db    # or: docker compose up -d db
npm run tauri dev          # desktop application, needs Postgres
npm run dev                # browser UI on http://localhost:1420, localStorage only
podman compose up --build  # browser UI and Postgres in containers
```

`DATABASE_URL` must point at `localhost`, another loopback address, or the compose hostname `db`.
`podman compose down -v` drops the `postgres_data` volume and deletes the local database. Native
Tauri windows need a desktop display server and belong on the host.

## Branches

Branch off `main` as `<type>/<short-topic>`, for example `feat/project-budgets` or
`fix/overlapping-entries`.

## Tests are required

Every feature and every bugfix ships with **unit tests** (Vitest as `<name>.test.ts(x)` next to the
code, `#[cfg(test)]` modules for Rust). Anything user-facing also ships with an **e2e test** in
`e2e/` covering the happy path and one failure case, listed in
[`docs/e2e-test-cases.md`](docs/e2e-test-cases.md). Tests mock the clock instead of reading it. A
bugfix starts with a failing test.

## Quality checks

Run before opening a pull request:

```sh
npm run lint
npm run typecheck
npm run licenses:check
npm run test:coverage
npm run test:e2e
npm run architecture:check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm run test:coverage` fails below 80 percent statement, branch, function, or line coverage.
`npm run test:e2e` runs against a `test-e2e` build served by `vite preview`, not the dev server.
Run `npx playwright install --with-deps chromium` once before the first e2e run.
Rust tests that need a database skip without a reachable `DATABASE_URL`; `REQUIRE_POSTGRES_TESTS=1`
(as in CI) turns the skip into a failure.

## Conventional Commits

Commit messages and pull request titles follow
[Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <summary>`, lower
case and imperative. The repository squash-merges, so CI rejects a title that does not parse.

| Type | Use for | Example |
| --- | --- | --- |
| `feat` | new user-facing functionality | `feat(timer): switch the running entry to another project` |
| `fix` | bugfix | `fix(db): reject an entry that overlaps a running timer` |
| `docs` | documentation only | `docs(contributing): add the commit cheat sheet` |
| `test` | tests only | `test(overtime): cover the manual balance adjustment` |
| `refactor` | behaviour-preserving change | `refactor(storage): extract the range helper` |
| `perf` | performance | `perf(reports): memoise the weekly totals` |
| `chore` | maintenance, dependencies | `chore(deps): update tauri to 2.11.4` |
| `build` | build system, bundling | `build(tauri): bundle the generated icon set` |
| `ci` | workflows and CI | `ci: run the e2e suite on pull requests` |

Scopes: `ui`, `timer`, `entries`, `projects`, `budgets`, `absences`, `overtime`, `settings`, `auth`,
`db`, `tauri`, `docs`, `ci`, `deps`. A breaking change adds `!` after the type or scope and a
`BREAKING CHANGE:` footer:

```text
refactor(ui)!: replace the toast store with a provider

BREAKING CHANGE: consumers must render <Toaster /> inside the provider.
```

## Pull request checklist

- [ ] One topic per pull request.
- [ ] Unit tests added or updated; e2e test added for user-facing behaviour.
- [ ] The quality checks above pass locally.
- [ ] Documentation the change invalidates is updated.
- [ ] A schema change ships with a new numbered migration in `drizzle/`.
- [ ] The title follows Conventional Commits.

## Project layout

```text
architecture/   LikeC4 model and decision records
contract/       Domain rules shared by the Rust backend and the browser fallback
docs/           Data model and further documentation
drizzle/        Single Postgres migration applied by the Rust backend and Drizzle
e2e/            Playwright tests
scripts/        Repository tooling, for example the icon generator
src/            React application (app, components, db, features, lib, pages)
src-tauri/src/  Rust backend (auth, commands, error, logging, postgres_store, window_state)
```

## Application icon

`src-tauri/icons/app-icon.svg` is the source artwork, `public/favicon.svg` the same mark for the web
build, and both repeat the paths of the in-app `AppLogo`. After changing the source run
`npm run icons:generate`: it regenerates every icon and the checksums in
`src-tauri/icons/icons.lock.json`, which the unit tests verify.

## Conventions

- Only add dependencies with an OSI-approved open-source license.
- Keep documentation concise.
- Domain rules live in `contract/domain-rules.json` and must stay in sync with the Rust backend and
  the browser fallback.
- `drizzle/0000_init.sql` is the baseline migration and stays unchanged. A schema change adds a new
  numbered file in `drizzle/`, appends it to `MIGRATIONS` in `src-tauri/src/postgres_store.rs`
  (applied once inside a transaction and recorded in `schema_migrations`), and updates
  `src/db/schema.ts` and the queries in `src-tauri/src/postgres_store.rs`.
- UI changes follow the binding rules in [`docs/ui-principles.md`](docs/ui-principles.md) and
  update [`docs/ui-audit.md`](docs/ui-audit.md) when a view changes noticeably.
