# Architecture decisions

Each record follows the arc42 decision template: **Context**, **Decision**, and **Consequences**.
Superseded implementation notes are intentionally omitted; keep this file for decisions that affect
future changes.

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

**Decision:** `src-tauri/src/postgres_store.rs` is the native store. The current pre-release baseline
is `drizzle/0000_init.sql`, registered in `MIGRATIONS`. Production processes verify migrations.
Only the separate migration entry point `DbConfig::for_migration` may apply them, and only when
`WORK_TIME_TRACKER_DB_MIGRATE=true`; `DbConfig::from_env` keeps application startup verify-only.

**Consequences:** Schema changes keep `drizzle/0000_init.sql`, `MIGRATIONS`, `src/db/schema.ts`,
queries, models, and `docs/data-model.md` aligned. A production app start never mutates the shared
schema.

## Enforce ownership in storage queries

**Status:** accepted

**Context:** Fetching a row before checking ownership could leak whether another user's record exists
or let a new code path forget the check.

**Decision:** Queries that use caller-supplied record ids include `AND user_id = $n`. Writes that
reference a caller-supplied foreign key first prove that the referenced row belongs to the user.
Foreign ids and unknown ids both map to `notFound`.

**Consequences:** New reads, updates, deletes, and foreign-key writes must keep the ownership check in
SQL or in the equivalent browser fallback filter. A write that changes no row is an error, not a
silent success.

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

**Context:** The dev server, CSP, and web inspector determine whether an injected script or a network
peer can read application data.

**Decision:** The dev server binds `127.0.0.1` unless `TAURI_DEV_HOST` is set deliberately. The Tauri
CSP allows bundled scripts and styles only, no inline/eval execution, and IPC-only connections.
Zod is imported through `src/lib/zod.ts` so schemas run without eval. Web inspector support remains
compiled into debug builds only.

**Consequences:** LAN testing is opt-in and temporary. New frontend dependencies must work under the
CSP. Release builds must not enable `tauri/devtools` or release `debug-assertions`.

## Separate local development databases from verified production databases

**Status:** accepted

**Context:** Development, tests, and CI must never reach a deployed database. Production needs a
remote database, but only with verified transport and an explicit migration step.

**Decision:** `WORK_TIME_TRACKER_ENV` defaults to `development`, where database hosts must be
`localhost`, loopback, or the compose host `db` without TLS. `production` refuses local hosts and
requires `sslmode=verify-full` with `SUPABASE_DB_ROOT_CERT`. The release workflow injects production
connection values from the protected `production` environment.

**Consequences:** Test helpers refuse to create or drop databases outside development/local hosts.
Remote connection strings are redacted before logging. Production database credentials never belong
in the repository or CI jobs outside the protected migration step.

## Accept the current transitive glib advisory until Tauri upgrades

**Status:** accepted

**Context:** Linux builds currently pull `glib` 0.18.5 through Tauri's GTK/WebKit stack. That version
is in the affected range `glib` >= 0.15.0 and < 0.20.0 for
[RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429)
([GHSA-wrw7-89jp-8q8g](https://github.com/advisories/GHSA-wrw7-89jp-8q8g)) in `VariantStrIter`.

**Decision:** Accept the advisory while Tauri's GTK bindings pin the 0.18 line and no patched
backport or compatible stack upgrade is available. The affected iterator is not used by this
repository, and Windows and macOS builds do not link `glib`.

**Consequences:** Re-evaluate this exception when Tauri's Linux backend depends on `glib` 0.20 or
newer, then take the upgrade through the regular cargo dependency update path.
