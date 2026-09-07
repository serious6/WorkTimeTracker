# Contributing

Detailed rules for agents and automation are in [`AGENTS.md`](AGENTS.md); this page is the short
version for humans.

## Prerequisites and local checks

Required tool versions, local setup, npm scripts, and quality commands are maintained in
[`docs/development.md`](docs/development.md). Installing a released build instead of running from
source is described in [`docs/installation.md`](docs/installation.md).

## Requirements for acceptable contributions

A contribution is accepted when it meets all of the following:

- **Coding standard** - TypeScript and React code passes
  [oxlint](https://oxc.rs/docs/guide/usage/linter.html) with the rules in
  [`.oxlintrc.json`](.oxlintrc.json) and the compiler options in
  [`tsconfig.app.json`](tsconfig.app.json); Rust code is formatted with `rustfmt` and passes
  `clippy` with no warnings. The commands that enforce this - `npm run lint`, `npm run typecheck`,
  `cargo fmt --manifest-path src-tauri/Cargo.toml --check`,
  `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets` - are listed in
  [`docs/development.md`](docs/development.md#quality-checks).
- **Tests** - see [Tests are required](#tests-are-required).
- **Commit and pull request titles** - see [Conventional Commits](#conventional-commits).
- **Pull request** - every item of the [pull request checklist](#pull-request-checklist) is done.
- **Documentation** - every document the change invalidates is updated, following the
  [documentation conventions](#conventions).
- **Dependencies** - only dependencies with an OSI-approved open-source license;
  `npm run licenses:check` verifies the bundled notices.
- **Architecture and UI rules** - changes follow
  [`architecture/decisions.md`](architecture/decisions.md),
  [`docs/ui-principles.md`](docs/ui-principles.md), and the domain rules in
  [`contract/domain-rules.json`](contract/domain-rules.json), which must stay in sync with the Rust
  backend and the browser fallback.

## License of contributions

Contributions are accepted under the MIT License of this repository, see [`LICENSE`](LICENSE): by
opening a pull request you agree that your contribution is licensed under those terms.

## Branches

Branch off `main` as `<type>/<short-topic>`, for example `feat/project-budgets` or
`fix/overlapping-entries`.

## Tests are required

Every feature and every bugfix ships with **unit tests**, and anything user-facing also ships with
an **e2e test** covering the happy path and one failure case, listed in
[`docs/e2e-test-cases.md`](docs/e2e-test-cases.md). A bugfix starts with a failing test. Where the
test files live and how they stay deterministic is described in
[`AGENTS.md`](AGENTS.md#test-conventions).

## Changelog

Every user-facing change adds a line to the `Unreleased` section of [`CHANGELOG.md`](CHANGELOG.md)
under `Added`, `Changed`, `Fixed`, `Removed` or `Security`, and a breaking change describes its
upgrade impact under `Breaking changes`. Write it for users, not for reviewers. Releasing turns that
section into a version heading, and the `Release` workflow publishes it as the release notes, so a
version without a section cannot be released; see
[`docs/development.md`](docs/development.md#release-checks).

## Quality checks

Every check that has to pass before a pull request is listed once, in
[`docs/development.md`](docs/development.md#quality-checks), together with the coverage gate, the
Playwright setup, and how the Rust tests behave without a database. Run the subset that matches your
change while iterating and the full set before opening the pull request.

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
- [ ] User-facing changes are listed in the `Unreleased` section of `CHANGELOG.md`.
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

- Keep documentation concise, and keep every fact in one place: link to the document that owns it
  instead of repeating it.
- Schema changes follow
  [`architecture/decisions.md`](architecture/decisions.md#keep-native-persistence-postgres-only-and-migrations-explicit)
  and update `docs/data-model.md` with the migration.
