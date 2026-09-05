# Security Policy

## Supported versions

WorkTimeTracker is developed on `main`. Only the latest release receives security fixes.

## Reporting a vulnerability

Report suspected vulnerabilities privately through
[GitHub Security Advisories](https://github.com/serious6/WorkTimeTracker/security/advisories/new).
Please do not open a public issue for a vulnerability.

Include the affected version, the platform, reproduction steps, and the impact you expect. Redact
credentials, database URLs, password hashes, and personal data from anything you attach.

You can expect an acknowledgement within seven days and a status update at least every two weeks
until the report is resolved. Fixes are published as a new release together with an advisory.

## Scope

The application is local-first: it talks to no network service other than the Postgres database
configured by the user. Reports about that database connection, the stored credentials, the Argon2id
password hashes, the login lockout, per-user data isolation, or the Tauri command surface are in
scope. The security of a user's own Postgres deployment is not.

## Automated checks

Pull requests and pushes to `main` run CodeQL, OSV-Scanner, `npm audit`, and gitleaks; Semgrep runs
on pull requests. See [`.github/workflows`](.github/workflows). Dependency updates arrive weekly
through Dependabot.
