# Contributing

Detailed rules for agents and automation are in [`AGENTS.md`](AGENTS.md); this page is the short
version for humans.

## Quick start

Node.js 26+, Rust 1.95+ stable and — for the native app — Postgres 18 (the `db` service of
`compose.yaml`) plus the platform prerequisites listed in
[`AGENTS.md`](AGENTS.md#setup-and-tooling).

```sh
git clone https://github.com/serious6/WorkTimeTracker.git
cd WorkTimeTracker
npm ci
npm run dev               # browser-only UI at http://localhost:1420, data in localStorage

cp .env.example .env      # then set POSTGRES_PASSWORD and DATABASE_URL
podman compose up -d db   # or: docker compose up -d db
npm run tauri dev         # desktop application with the Rust backend
```

## Branches

Branch off `main` and name the branch `<type>/<short-topic>` with the type of the change, for
example `feat/project-budgets`, `fix/overlapping-entries` or `docs/contributing`.

## Tests are required

Every new feature and every bugfix ships with **unit tests** (Vitest next to the code as
`<name>.test.ts(x)`, `#[cfg(test)]` modules for Rust) **and**, for anything user-facing, an
**end-to-end test** in `e2e/` covering the happy path and at least one failure case, documented in
[`docs/e2e-test-cases.md`](docs/e2e-test-cases.md). Tests must be deterministic — mock the clock,
never read the real one. A bugfix starts with a test that fails without the fix.

## Quality checks

Run before opening a pull request:

```sh
npm run lint
npm run typecheck
npm run licenses:check
npm run test:coverage
npm run test:e2e
npm run architecture:check
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm run test:coverage` fails below 80 percent statement, branch, function, or line coverage.
`npm run test:e2e` builds the app in the `test-e2e` mode and serves the build with `vite preview`,
which is faster and more stable than running the tests against the dev server; run
`npx playwright install --with-deps chromium` once before the first run. The Rust tests that need a
database skip without a reachable `DATABASE_URL`; set `REQUIRE_POSTGRES_TESTS=1` (as CI does) to
turn that skip into a failure.

## Conventional Commits

Every commit message and every pull request title follows
[Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <summary>`, lower
case and imperative. The repository squash-merges, so the pull request title becomes the commit
message and CI rejects a title that does not parse.

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
| `ci` | workflows and CI configuration | `ci: run the e2e suite on pull requests` |

Common scopes: `ui`, `tracker`, `timer`, `entries`, `projects`, `budgets`, `absences`, `overtime`,
`settings`, `auth`, `db`, `tauri`, `docs`, `ci`, `deps`. A breaking change adds `!` after the type
or scope and a `BREAKING CHANGE:` footer:

```text
refactor(ui)!: replace the toast store with a provider

BREAKING CHANGE: consumers must render <Toaster /> inside the provider.
```

## Pull request checklist

- [ ] The change is focused on one topic.
- [ ] Unit tests added or updated, e2e test added for user-facing behaviour.
- [ ] All quality checks above pass locally.
- [ ] Documentation updated (README, `docs/`, `architecture/`) where the change invalidates it.
- [ ] A schema change ships with a new numbered migration in `drizzle/`.
- [ ] The pull request title follows Conventional Commits.

## Guidelines

- Only add dependencies with an OSI-approved open-source license, and regenerate
  `src/data/licenses.json` with `npm run licenses:generate`.
- Keep documentation concise.
- Domain rules live in `contract/domain-rules.json` and must stay in sync with the Rust backend and
  the browser fallback.
- `drizzle/0000_init.sql` is the baseline migration and stays unchanged. A schema change gets a new
  numbered file in `drizzle/`, is appended to `MIGRATIONS` in `src-tauri/src/postgres_store.rs`
  (which applies it once, inside a transaction, and records it in `schema_migrations`), and comes
  with the matching update in `src/db/schema.ts` and the queries in
  `src-tauri/src/postgres_store.rs`.
- UI changes follow the binding rules in [`docs/ui-principles.md`](docs/ui-principles.md) and
  update [`docs/ui-audit.md`](docs/ui-audit.md) when a view changes noticeably.
