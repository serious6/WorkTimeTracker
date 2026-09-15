# Changelog

All notable changes to WorkTimeTracker are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every user-facing change adds a line to `Unreleased`; releasing turns that section into a version
heading with the release date. The `Release` workflow publishes the section of the released version
as the release notes, so a version without a section here cannot be released. See
[`CONTRIBUTING.md`](CONTRIBUTING.md#changelog).

## [Unreleased]

### Changed

- The Audit Trails page no longer reads and renders the whole history at once: it shows the newest
  50 records of the selected period and appends the next 50 with a "Load more" button, which is
  replaced by an end-of-list hint once the trail is exhausted. Changing the period or the trail type
  restarts the list at the first 50 records.

## [0.2.2] - 2026-09-15

### Changed

- Bumped the application version to 0.2.2.

### Fixed

- A session that is started right after a rounded up one is no longer discarded: the timer measures
  the elapsed time from the moment it was started, so a session of 40 seconds is stored as one
  minute even when the previous rounding reached past the clock. The timer also writes its decisions
  and every failure into the log file, so a session that is not stored explains itself.

### Breaking changes

None.

## [0.2.1] - 2026-09-14

### Added

- The sign-in and registration forms are now recognisable to password managers: named forms, stable
  field ids with the matching autocomplete tokens, and a window title that names the application, so
  a saved item is identifiable as WorkTimeTracker. The supported platforms and the known limitations
  are listed in [`docs/installation.md`](docs/installation.md#9-password-managers).

### Changed

- Bumped the application version to 0.2.1.

### Breaking changes

None.

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

[Unreleased]: https://github.com/serious6/WorkTimeTracker/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/serious6/WorkTimeTracker/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/serious6/WorkTimeTracker/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/serious6/WorkTimeTracker/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/serious6/WorkTimeTracker/releases/tag/v0.1.0
