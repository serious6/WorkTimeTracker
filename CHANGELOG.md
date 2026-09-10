# Changelog

All notable changes to WorkTimeTracker are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every user-facing change adds a line to `Unreleased`; releasing turns that section into a version
heading with the release date. The `Release` workflow publishes the section of the released version
as the release notes, so a version without a section here cannot be released. See
[`CONTRIBUTING.md`](CONTRIBUTING.md#changelog).

## [Unreleased]

Nothing yet. Add the change under `Added`, `Changed`, `Fixed`, `Removed` or `Security`, and note the
upgrade impact under `Breaking changes`.

## [0.2.0] - 2026-09-10

### Changed

- Bumped the application version to 0.2.0.

### Breaking changes

None.

## [0.1.0] - 2026-09-07

First public release: a local-first desktop work-time tracker that keeps every entry in a Postgres
database you control.

### Added

- Dashboard with start, pause, resume, stop and project switching, day navigation, daily and weekly
  targets, a cumulative overtime balance and the time distribution per project.
- Retroactive time management through quick-add buttons or durations such as `2h 45m`; entries land
  in the first free slot of the day and never overlap.
- Per-project hour budgets with a due date, including consumption and forecast in `Reports`.
- Working-time support: breaks as entries of their own, warnings for break, daily maximum and rest
  period limits, a monthly CSV or PDF record per employee, and an audit trail of every change.
- Absences for a day or a range as vacation, sick leave, unpaid leave or half day; a full-day
  absence drops that day's target to zero, a half day keeps half of it.
- Settings for the weekly working time and the working days, with working-time limits that default
  to the German ArbZG and can be adjusted or restored.
- Accounts with a strict password policy, Argon2id hashes, login lockout and per-user data
  isolation.
- Installers for Windows and macOS plus portable archives for machines where nothing may be
  installed.

### Breaking changes

None: this is the first release. Installing it is described in
[`docs/installation.md`](https://github.com/serious6/WorkTimeTracker/blob/main/docs/installation.md).

[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/serious6/WorkTimeTracker/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/serious6/WorkTimeTracker/releases/tag/v0.1.0
