# Contributing

Detailed rules for agents and automation are in [`AGENTS.md`](AGENTS.md); this page is the short
version for humans.

## Prerequisites and local checks

Required tool versions, local setup, npm scripts, and quality commands are maintained in
[`docs/development.md`](docs/development.md). Installing a released build instead of running from
source is described in [`docs/installation.md`](docs/installation.md).

## Branches

Branch off `main` as `<type>/<short-topic>`, for example `feat/project-budgets` or
`fix/overlapping-entries`.

## Tests are required

Every feature and every bugfix ships with **unit tests**, and anything user-facing also ships with
an **e2e test** covering the happy path and one failure case, listed in
[`docs/e2e-test-cases.md`](docs/e2e-test-cases.md). A bugfix starts with a failing test. Where the
test files live and how they stay deterministic is described in
[`AGENTS.md`](AGENTS.md#test-conventions).

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
- Keep documentation concise, and keep every fact in one place: link to the document that owns it
  instead of repeating it.
- Domain rules live in `contract/domain-rules.json` and must stay in sync with the Rust backend and
  the browser fallback.
- Schema changes follow
  [`architecture/decisions.md`](architecture/decisions.md#keep-native-persistence-postgres-only-and-migrations-explicit)
  and update `docs/data-model.md` with the migration.
- UI changes follow the binding rules in [`docs/ui-principles.md`](docs/ui-principles.md).
