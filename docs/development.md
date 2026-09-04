# Development guide

## Tooling

| Tool | Version | Source |
| --- | --- | --- |
| Node.js + npm | 26+ | `.github/actions/setup-node/action.yml`, `.github/workflows/release.yml` |
| Rust + Cargo | 1.95+ stable | `src-tauri/Cargo.toml` (`rust-version`, edition 2021) |
| Tauri CLI | 2.x | `@tauri-apps/cli` in `package.json`, run through `npm run tauri` |
| PostgreSQL | 18 | `compose.yaml` and CI service images |
| Podman or Docker + Compose | current stable | `compose.yaml` local services |

Native builds also need the platform prerequisites from the
[Tauri guide](https://v2.tauri.app/start/prerequisites/): MSVC Build Tools and WebView2 on Windows,
Xcode Command Line Tools on macOS, and `libwebkit2gtk-4.1-dev`, `librsvg2-dev`, and
`libayatana-appindicator3-dev` on Linux.

## Local setup

```sh
npm ci
cp .env.example .env       # set POSTGRES_PASSWORD, DATABASE_URL, POSTGRES_CONTAINER_URL
podman compose up -d db    # or: docker compose up -d db
npm run tauri dev          # desktop application, needs Postgres
npm run dev                # browser UI on http://127.0.0.1:1420, localStorage only
podman compose up --build  # browser UI and Postgres in containers
```

The development server binds `127.0.0.1`. Use `TAURI_DEV_HOST=<address>` only for physical-device
testing, because it serves the unauthenticated UI to the network.

`podman compose down -v` drops the `postgres_data` volume and deletes the local database. Native
Tauri windows need a desktop display server and belong on the host.

Leave `WORK_TIME_TRACKER_ENV` unset for development, tests, and CI. It defaults to `development`:
`DATABASE_URL` must name `localhost`, another loopback address, or the compose host `db`.
Production uses a remote database only with `sslmode=verify-full`; provide the pinned CA with
`sslrootcert` in the connection string or `SUPABASE_DB_ROOT_CERT`; see
[`.env.example`](../.env.example) and
[`architecture/decisions.md`](../architecture/decisions.md#separate-local-development-databases-from-verified-production-databases).

## Npm scripts and common invocations

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run icons:generate` | Regenerate the tracked application icons and checksums |
| `npm run licenses:generate` | Regenerate `src/data/licenses.json` |
| `npm run licenses:check` | Verify `src/data/licenses.json` is current |
| `npm run db:assert-local` | Fail if the configured database is not local |
| `npm run prebuild` | Verify licenses before the build lifecycle runs |
| `npm run build` | Typecheck and build the browser bundle |
| `npm run lint` | Run oxlint |
| `npm test` | Run Vitest once |
| `npm run test:coverage` | Run Vitest with the 80 percent coverage gate |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Run Playwright end-to-end tests after installing Chromium |
| `npm run typecheck` | Run TypeScript project references |
| `npm run preview` | Serve the built browser bundle with Vite preview |
| `npm run tauri` | Run the Tauri CLI |
| `npm run tauri dev` | Start the desktop app |
| `npm run architecture:check` | Validate the LikeC4 model |

## Quality checks

Run the checks that match the files you changed while iterating. Before opening a pull request, the
full set is required:

```sh
npm run lint
npm run typecheck
npm run test:coverage
npm run test:e2e
npm run architecture:check
npm run licenses:check
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
cargo test --manifest-path src-tauri/Cargo.toml
```

Run `npx playwright install --with-deps chromium` before the first e2e run in a fresh environment.
Rust tests that need Postgres skip without a reachable `DATABASE_URL`; CI sets
`REQUIRE_POSTGRES_TESTS=1` so those tests fail instead of skipping.

## Repository layout

```text
architecture/       LikeC4 model and architecture decisions
contract/           Shared domain and entity contracts
docs/               Development guide, data model, e2e cases, and UI docs
drizzle/            Postgres migration baseline
e2e/                Playwright specs and helpers
scripts/            Repository tooling
src/                React app: app, components, db, features, lib, pages, test
src-tauri/src/      Rust backend: auth, commands, config, connection, contract, models, store
```

## Release checks

The manual `Release` workflow verifies that `package.json`, `src-tauri/Cargo.toml`, and
`src-tauri/tauri.conf.json` declare the same version. It runs lint, typecheck, unit tests, the
architecture check, build, Rust format and tests, license checks, the e2e suite, and then bundles
Windows and macOS installers.
