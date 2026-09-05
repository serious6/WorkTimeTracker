# Development guide

Setting up a checkout to work on the application. Installing a released build instead is described
in [`docs/installation.md`](installation.md).

## Tooling

| Tool | Version | Source |
| --- | --- | --- |
| Node.js + npm | 26+ | `.nvmrc`, also read by `.github/actions/setup-node/action.yml`; `.github/workflows/release.yml` still pins it inline |
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
cp .env.example .env       # set POSTGRES_PASSWORD, POSTGRES_APP_PASSWORD, DATABASE_URL, POSTGRES_CONTAINER_URL
podman compose up -d db    # or: docker compose up -d db
npm run tauri dev          # desktop application, needs Postgres
npm run dev                # browser UI on http://127.0.0.1:1420, localStorage only
podman compose up --build  # browser UI and Postgres in containers
```

The development server binds `127.0.0.1`. Use `TAURI_DEV_HOST=<address>` only for physical-device
testing, because it serves the unauthenticated UI to the network.

`podman compose down -v` drops the `postgres_data` volume and deletes the local database. Native
Tauri windows need a desktop display server and belong on the host.

Leave `WORK_TIME_TRACKER_ENV` unset for development, tests, and CI. It defaults to `development`, so
`DATABASE_URL` must name `localhost`, another loopback address, or the compose host `db`. What a
production build may reach instead is recorded in
[`architecture/decisions.md`](../architecture/decisions.md#separate-local-development-databases-from-verified-production-databases);
every variable is documented in [`.env.example`](../.env.example).

## The application database role

The tables are protected by row level security
([`data-model.md`](data-model.md#row-level-security)), and a superuser or a `BYPASSRLS` role ignores
those policies entirely. `DATABASE_URL` therefore names `POSTGRES_APP_USER`, a role that may log in,
own the `wtt` schema and create the throwaway databases of the Rust tests, and nothing else — never
`POSTGRES_USER`, which is the bootstrap superuser of the cluster.

`scripts/postgres-init/10-application-role.sh` creates that role, and the Postgres image only runs it
while it initialises its data directory. An existing database therefore keeps the state it was
created with: run `podman compose down -v && podman compose up -d db` to recreate the volume, which
also applies the current baseline schema. CI creates the same kind of role before it runs the Rust
tests.

`the_application_role_cannot_bypass_row_level_security` fails when `DATABASE_URL` still names a
superuser, so a database that is set up the old way is reported instead of silently losing the
protection.

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

## Fuzzing

Parsers and validators see input nobody wrote an example for: a driver error that ends up in a log,
a hand-edited `WorkTimeTracker.env`, or a payload from a frontend that is one release ahead. They are
covered from both sides.

Property based tests run in the normal unit test suite, as `*.property.test.ts` next to their
subject, and use [fast-check](https://fast-check.dev). They share the fixed seed configured in
`src/test/setup.ts`, so a failure reproduces from its report.

The Rust targets live in `src-tauri/fuzz` and are driven by
[cargo-fuzz](https://rust-fuzz.github.io/book/cargo-fuzz.html), which needs a nightly toolchain:

```sh
rustup toolchain install nightly
cargo install cargo-fuzz --locked
cd src-tauri/fuzz
cargo fuzz list
cargo fuzz run redact -- -max_total_time=60
```

| Target | What it drives |
| --- | --- |
| `redact` | `logging::redact` and `redact_keeping_layout`: no panic, no secret left behind, stable after one pass. |
| `database_url` | `config::redact_database_url`: a password never survives, and a value that is no URL is handled. |
| `save_input` | `SaveTimeEntry`, `SaveProject` and `SaveAbsence` validation: what passes is canonical, trimmed, and within its limits. |
| `portable_settings` | The `WorkTimeTracker.env` parser: only known settings are accepted, and the same file reads the same way twice. |

The targets reach the backend through the `fuzzing` feature of `src-tauri/Cargo.toml`, which opens
the `fuzzing` module and leaves the Tauri entry point out of the build. The feature is off in every
shipped build.

A finding is written to `src-tauri/fuzz/artifacts/<target>/`. Reproduce it with
`cargo fuzz run <target> artifacts/<target>/<crash file>`, shrink it with `cargo fuzz tmin`, then turn
it into a unit test next to the code before fixing it. The `Fuzz` workflow runs a short search for
every backend pull request and a longer one weekly, and uploads the artifacts of a failing run.

## Security checks

These run in CI only; none of them is part of the local pull request checklist.

| Workflow | What it does |
| --- | --- |
| `codeql.yml` | CodeQL `security-extended` for `javascript-typescript` and `rust` (public preview) on pushes, pull requests, and weekly. |
| `security.yml` → `osv-scanner` | OSV advisories for `package-lock.json` and `src-tauri/Cargo.lock`. `src-tauri/fuzz/Cargo.lock` is excluded through `src-tauri/fuzz/osv-scanner.toml`, because the dev-only fuzz harness duplicates the tree that is already scanned. A pull request fails only on advisories it adds; the run on `main` reports the full inventory to Security > Code scanning without failing, because the Tauri dependency tree carries GTK crates with open RUSTSEC advisories that cannot be resolved here. |
| `security.yml` → `npm-audit` | `npm audit --audit-level=high`; moderate and lower findings are left to Dependabot. |
| `security.yml` → `semgrep` | Named Semgrep packs (`p/typescript`, `p/react`, `p/secrets`, `p/github-actions`) on pull requests, so the rule set that gates the check is visible in the workflow rather than resolved from the repository URL. Rust is left to CodeQL. |
| `security.yml` → `gitleaks` | Full-history secret scan, complementing GitHub push protection. |
| `scorecard.yml` | OpenSSF Scorecard; publishing the result is what makes the README badge resolve. |

Findings land in the Security tab as code scanning alerts. `Security success` is the aggregate status
check, mirroring `CI success`.

## Repository layout

```text
architecture/       LikeC4 model and architecture decisions
contract/           Shared domain and entity contracts
docs/               Development guide, data model, e2e cases, and UI docs
drizzle/            Postgres migration baseline
e2e/                Playwright specs and helpers
portable/           Example configuration shipped with the portable archives
scripts/            Repository tooling
src/                React app: app, components, db, features, lib, pages, test
src-tauri/src/      Rust backend: auth, commands, config, connection, contract, models, store
src-tauri/fuzz/     cargo-fuzz targets for the backend parsers and validators
```

## Release checks

The manual `Release` workflow verifies that `package.json`, `src-tauri/Cargo.toml`, and
`src-tauri/tauri.conf.json` declare the same version. It runs lint, typecheck, unit tests, the
architecture check, build, Rust format and tests, license checks, the e2e suite, and then bundles
Windows and macOS installers.

### Portable archives

The `bundle` job packs the same build a second time as
`windows-x86_64-WorkTimeTracker-portable.zip` and `macos-aarch64-WorkTimeTracker-portable.zip`,
each with `WorkTimeTracker.env.example` from `portable/`, for users who may not install anything.
`npm run portable:assert-env -- portable/staging` runs before the archive is packed and fails
the job when an env file in it names a filled-in configuration or carries a value for
`DATABASE_URL` or `SUPABASE_DB_PASSWORD`. It prints file and setting names only.

`bundle.windows.webviewInstallMode` stays at the default bootstrapper: the fixed runtime would add
well over 100 MB to every artifact of the release and has to be raised by hand for each WebView2
security update, while the evergreen runtime ships with Windows 11 and reaches most Windows 10
machines through Edge. A portable archive therefore documents WebView2 as a requirement instead of
shipping it, and [`docs/installation.md`](installation.md) names the per-user bootstrapper for the
managed and LTSC images that carry no runtime.

The Windows archive is unsigned and the macOS archive is neither signed nor notarized, so SmartScreen
and Gatekeeper warn about them; [`docs/installation.md`](installation.md) describes how a user gets
past that. Portable archives are updated by hand: they carry no updater.

## Production database secrets

The `migrate-production-database` job of the `Release` workflow is the only place that sees the
production database. It runs in the protected `production` environment, so its secrets are available
to no other job, none of them is ever printed, and it only runs when the dispatch input
`migrate_production_database` asks for it — a shared database is migrated deliberately, never by an
installation that starts. The bundles contain none of these values; a deployment provides them to
the application at run time. The workflow reads, by name only:

| Secret | Purpose |
| --- | --- |
| `SUPABASE_DATABASE_URL` | complete connection string including `sslmode=verify-full`; wins over the parts below |
| `SUPABASE_DB_HOST` | host of the database, for example the connection pooler of the project |
| `SUPABASE_DB_PORT` | port, `6543` for the pooler and `5432` for a direct connection |
| `SUPABASE_DB_USER` | the dedicated least-privilege application role, never `postgres`, and neither a superuser nor `BYPASSRLS`, which would ignore the row level security policies |
| `SUPABASE_DB_PASSWORD` | password of that role |
| `SUPABASE_DB_NAME` | database name |
| `SUPABASE_DB_ROOT_CERT` | the certificate authority in PEM form; the job writes it to a file and passes its path to the application |

To rotate the credentials, change the password of the role in the Supabase dashboard (or create the
replacement role), update `SUPABASE_DB_PASSWORD` — or `SUPABASE_DATABASE_URL`, if that is the form
in use — in the `production` environment, and run the workflow again. Rotating the certificate
authority means replacing `SUPABASE_DB_ROOT_CERT` with the downloaded PEM file; nothing in the
repository has to change for either.
