# Architecture decisions

Each record is short on purpose: a **Status**, then **Context**, **Decision**, and **Consequences**.
Implementation detail belongs in the module documentation and in the tests that hold the decision;
records are never numbered, so one can be added or retired without renumbering the rest. Every rule
is written down once - other documents link to the record instead of restating it.

## Keep the Rust backend and browser fallback behind one contract

**Status:** accepted

**Context:** The native app uses Rust commands and Postgres. The browser fallback exists for the Vite
UI and Playwright tests. Without a shared contract the two storage paths can drift.

**Decision:** Domain rules live in `contract/domain-rules.json`, entity shapes in
`contract/entities.json`. Rust contract tests and TypeScript contract tests execute those files.
Frontend application data access goes through the `Repository` type in `src/features/storage/`.
The explicit infrastructure exception is `log_client_error`, which may invoke the backend directly.

**Consequences:** Validation, overlap, limit, and entity changes start in `contract/` and update both
backends. A capability used by the frontend needs a Rust command, command registration, repository
method, and browser fallback implementation.

## Return structured command errors and log both sides safely

**Status:** accepted

**Context:** UI code must not match localized or redacted message text, and failures from Rust and
React need one diagnostic path without leaking credentials.

**Decision:** Commands return the `AppError` variants from `src-tauri/src/error.rs`. The frontend
branches on `kind` through `src/lib/errors.ts`. Backend failures are written by
`src-tauri/src/logging.rs`; frontend failures use `log_client_error` and `src/lib/logger.ts`.
Redaction rules stay mirrored with `src/lib/redact.ts`.

**Consequences:** New command errors use an existing `AppError` kind or add a kind on both sides.
Never branch on error messages, and never log raw credentials, password hashes, emails, tokens, or
file paths.

## Treat sessions as bearer tokens bound to one webview

**Status:** accepted

**Context:** A session id grants access to all account data. A running timer polls the backend, so
idle timeout alone would keep an unattended app signed in.

**Decision:** Native sessions live in memory, carry idle and absolute expiry, and are bound to the
webview label that created them. The frontend keeps the native session id only in a module variable.
Commands that need a user are generated with `authed_command!`; public commands are listed in
`PUBLIC_COMMANDS`. Login lockout counters are persisted in Postgres.

**Consequences:** Reloading the webview returns to login. New data commands must use
`authed_command!`, receive the current user id from it, and must not store the session id in
`localStorage`, `sessionStorage`, or cookies.

## Keep native persistence Postgres-only and migrations explicit

**Status:** accepted

**Context:** The desktop application stores durable data in Postgres. Development and tests use the
local compose database; production may use a managed database.

**Decision:** `src-tauri/src/postgres_store.rs` is the native store. `drizzle/0000_init.sql` is the
baseline for a fresh database; before the first release, schema changes stay folded into that
baseline. After a release, each schema change also adds an idempotent upgrade migration for existing
databases. Every active migration is registered in `MIGRATIONS`. Production processes verify
migrations. Only the separate migration entry point `DbConfig::for_migration` may apply them, and
only when `WORK_TIME_TRACKER_DB_MIGRATE=true`; `DbConfig::from_env` keeps application startup
verify-only.

**Consequences:** Schema changes keep `drizzle/0000_init.sql`, `MIGRATIONS`, `src/db/schema.ts`,
queries, models, `docs/data-model.md`, and any post-release upgrade migration aligned. A production
app start never mutates the shared schema.

## Enforce ownership in storage queries

**Status:** accepted

**Context:** Fetching a row before checking ownership could leak whether another user's record exists
or let a new code path forget the check.

**Decision:** Queries that use caller-supplied record ids include `AND user_id = $n`. Writes that
reference a caller-supplied foreign key first prove that the referenced row belongs to the user.
Foreign ids and unknown ids both map to `notFound`.

**Consequences:** New reads, updates, deletes, and foreign-key writes must keep the ownership check
in SQL or in the equivalent browser fallback filter. A write that changes no row answers `notFound`
instead of reporting a silent success. The module documentation of `postgres_store.rs` lists the few
statements that carry no `user_id`, with the reason each is safe.

## Bound history queries and page full-account calculations

**Status:** accepted

**Context:** Accounts can accumulate years of entries and audit records. Views should not load the
whole account unless their calculation requires it.

**Decision:** List commands accept `from`, `to`, and `limit`; defaults and caps are declared in
`contract/domain-rules.json`. UI views request the visible window. Full-account calculations use the
paged helpers in `src/features/storage/list-range.ts`.

**Consequences:** New list APIs must expose a bounded range. Views that need complete history must
page explicitly instead of relying on an unbounded backend response.

## Persist audit trails and derive timer state from entries

**Status:** accepted

**Context:** Users need an audit trail for changes, and tracking must survive reloads, crashes, and
sleep without trusting a client-side clock.

**Decision:** Mutations write audit rows in the same transaction as the change. A running timer is a
`time_entries` row with `end_time` null. Recovery reconciles the stored entries; stopping rounds once
and stores the rounded result.

**Consequences:** Rejected writes do not produce audit rows. Reports, exports, and balances derive
from stored timestamps and do not round a second time.

## Harden development and webview entry points

**Status:** accepted

**Context:** The dev server, the CSP, and the web inspector decide whether an injected script or a
network peer can read application data.

**Decision:** The dev server binds `127.0.0.1` unless `TAURI_DEV_HOST` is set deliberately.
`app.security.csp` names every directive explicitly, grants neither `'unsafe-inline'` nor
`'unsafe-eval'`, and limits `connect-src` to the IPC channel. Zod is imported through
`src/lib/zod.ts`, which configures `jitless`, so no schema needs `eval`. The web inspector stays
compiled into debug builds only.

**Consequences:** LAN testing is opt-in and temporary. A new frontend dependency has to work under
the CSP; `e2e/security-csp.spec.ts` fails a bundle that needs inline code, and the tests in
`src-tauri/src/lib.rs` fail a release build that enables `tauri/devtools` or `debug-assertions`.

## Separate local development databases from verified production databases

**Status:** accepted

**Context:** Development, tests, and CI must never reach a deployed database. A production build
needs a remote database, but only with verified transport and a deliberate migration step.

**Decision:** The mode is explicit rather than derived from the host. `WORK_TIME_TRACKER_ENV`
defaults to `development`, which accepts `localhost`, a loopback address, or the compose host `db`
only. `production` refuses local hosts and accepts a remote one only with `sslmode=verify-full`
against the certificate authority pinned in `sslrootcert` or `SUPABASE_DB_ROOT_CERT`; nothing
relaxes that verification. Connection details are configuration: the release workflow injects them
from the protected `production` environment, and a portable installation reads them from
`WorkTimeTracker.env`, whose secrets move into the credential store of the user account on the first
start.

**Consequences:** Test helpers refuse to create or drop a database outside development and a local
host. Connection strings pass `redact_database_url` before they are logged. Credentials never live
in the repository, in a CI job outside the protected migration step, or in a portable folder that
may be copied.

## The legal texts are versioned content, not layout

**Status:** accepted

**Context:** The terms of service and the privacy policy have to be comparable revisions, and they
must state which of the two storage modes applies to the build the reader runs.

**Decision:** Both documents are data in `src/features/legal/legal-documents.ts`, rendered by one
`LegalDocumentView`, each carrying its own version and an ISO day that is shown as written. Both
texts name the two storage modes and state that the authors administer the hosted production
database.

**Consequences:** A wording change is a content change and never touches a component. Registration
requires accepting both texts; the acceptance itself is not persisted, and an installed build keeps
the revision it was released with.

## Archiving retires a project, it never touches its records

**Status:** accepted

**Context:** A project that is no longer worked on has to leave the selections that create time,
while its history stays intact. Deleting it detaches its entries and the past reads as "Deleted
project", which the monthly record cannot use.

**Decision:** The `archived` flag removes the project from the pickers that create time only. It
stays on the Projects page with a marker, keeps its total, entries, reports, and exports, and a
selection that already names it keeps offering it. Archiving is allowed while its timer runs. An
overdue or exhausted budget shows a status message with an icon next to the picker, never colour
alone.

**Consequences:** Recording what happened outweighs the plan: neither archiving nor a budget may
block starting, switching, or stopping a timer, and no edit silently drops the booked project.
