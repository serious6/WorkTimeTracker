# Contributing

Detailed rules for agents and automation are in [`AGENTS.md`](AGENTS.md); this page is the short
version for humans.

## Prerequisites and local checks

Required tool versions, local setup, npm scripts, and quality commands are maintained in
[`docs/development.md`](docs/development.md).

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
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
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
- [ ] A schema change updates the migration in `drizzle/`.
- [ ] The title follows Conventional Commits.

## Code review

Reviews - by humans or agents - follow
[`.github/skills/code-review/SKILL.md`](.github/skills/code-review/SKILL.md):
the review dimensions, severity levels, and output template.

## Project layout

See [`docs/development.md`](docs/development.md#repository-layout) for the maintained repository map.

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
- `drizzle/0000_init.sql` is the current baseline migration. Schema changes keep it,
  `MIGRATIONS` in `src-tauri/src/postgres_store.rs`, `src/db/schema.ts`, and the queries in
  `src-tauri/src/postgres_store.rs` in sync.
- UI changes follow the binding rules in [`docs/ui-principles.md`](docs/ui-principles.md).
