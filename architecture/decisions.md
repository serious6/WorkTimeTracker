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
requires `sslmode=verify-full` with a pinned CA from connection-string `sslrootcert` or
`SUPABASE_DB_ROOT_CERT`. The release workflow injects production connection values from the
protected `production` environment.

**Consequences:** Test helpers refuse to create or drop databases outside development/local hosts.
Remote connection strings are redacted before logging. Production database credentials never belong
in the repository or CI jobs outside the protected migration step.

`app.security.csp` in `src-tauri/tauri.conf.json` names every directive it relies on instead of
falling back to `default-src`, and it grants neither `'unsafe-inline'` nor `'unsafe-eval'`:
scripts and stylesheets come from the bundle (`'self'`), plugins are refused (`object-src 'none'`),
the document base cannot be rewritten (`base-uri 'self'`), no form may leave the application
(`form-action 'none'`) and nothing may embed it (`frame-ancestors 'none'`). `connect-src` stays
limited to the IPC channel, so an injected script has no channel to exfiltrate a session id.
`dangerousDisableAssetCspModification` stays unset, so Tauri adds the nonces of its own injected
script on top.

The application needs no inline style: React writes the dynamic project colors and progress widths
through the CSSOM (`element.style`), which the policy does not gate, and Vite links the compiled
stylesheet as a file. Zod is the one dependency that wants `eval`: it compiles an object schema with
`new Function` when the environment allows it and probes for that capability with a `new Function`
that it catches, which the policy still reports as a violation. `src/lib/zod.ts` therefore configures
`jitless` once and re-exports `z`; every schema imports Zod from there, so the configuration is
applied before the first schema is constructed, and `no-restricted-imports` in `.oxlintrc.json`
keeps a direct `zod` import from slipping back in.

`e2e/security-csp.spec.ts` reads the policy from the Tauri configuration, serves the production
bundle with it and fails on any `securitypolicyviolation`, so a change that needs inline code is
noticed in CI instead of in the packaged application. The policy is not applied by the dev server:
`tauri dev` loads `devUrl` directly, where Vite injects its stylesheets and its HMR client inline.

## 14. The web inspector belongs to a debug build only

An open web inspector reads the running application: the session id in `sessionStorage`, the
arguments and answers of every IPC command, and the data of the signed in account. A shipped build
therefore carries no devtools, while `tauri dev` keeps them.

Tauri already draws that line. Everything that opens the inspector is compiled under
`cfg(any(debug_assertions, feature = "devtools"))`: the `with_devtools` call that turns the
developer extras of the webview and its "Inspect Element" entry on, the `toggle-devtools.js` that
tauri injects for the keyboard shortcut, the `internal_toggle_devtools` command behind it and
`WebviewWindow::open_devtools`. `devtools` is not one of the default features of the `tauri` crate,
so `tauri dev` compiles the dev profile and keeps them while `npm run tauri build` compiles the
release profile and drops them — as long as no cargo feature switches them back on and the bundle
is not built with `--debug`.

Tests in `src-tauri/src/lib.rs` hold that guarantee instead of leaving it to whoever reads the
manifest next: `devtools_stay_out_of_a_release_build` fails when a feature of `src-tauri/Cargo.toml`
enables `tauri/devtools` or a profile turns `debug-assertions` back on for the release build, and
`a_devtools_call_carries_a_debug_assertions_guard` fails when a backend source reaches the devtools
without a condition that governs the call. That scan reads the `cfg` attribute of the item or the
statement, the attributes of the enclosing items and blocks and a `cfg!` around the block, and it
evaluates the predicate with `debug_assertions` off and every other flag on, so
`any(debug_assertions, windows)` and `not(debug_assertions)` count as no guard at all. Comments and
string literals are stripped before the scan. `a_guard_that_governs_the_call_is_accepted` and
`a_guard_that_governs_nothing_is_rejected` pin that behaviour on fixtures. What the tests cannot see
is a `debug-assertions` flag handed to the compiler from outside the manifest, through `RUSTFLAGS`
or a `.cargo/config.toml`; the release workflow sets neither.

The window in `tauri.conf.json` names no `devtools` field on purpose. `false` would remove the
inspector from `tauri dev` as well, and `true` cannot bring back what the release profile has
already compiled out.

## 15. Ownership is part of the query, and a write that changes nothing is refused

Every statement in `src-tauri/src/postgres_store.rs` that names a record by an id the caller
supplied carries `AND user_id = $n`, and a write that names a project (`create_time_entry`,
`update_time_entry`, `switch_running_time_entry`, the budget writers) checks that reference the same
way. The ownership test is therefore part of the query instead of a check on an already fetched row,
which cannot be skipped in a new code path and cannot read a foreign row on the way. The module
documentation of `postgres_store.rs` lists the few statements that carry no `user_id` - the account
lookups of a sign in, the lockout counters, the auth trail and the installation metadata - with the
reason each is safe.

A read, an update and a delete of a record of another account therefore answer `notFound`, the same
answer an unknown id gets, so the id space of another account stays indistinguishable from an empty
one. A delete of an id that matches nothing used to report success in both backends; it now reports
`notFound` as well, because a silent success cannot be told apart from a delete that was refused.
`local-repository.ts` follows the same rule, so the browser fallback and the Rust backend answer
alike.

## 16. Local Postgres for development, a remote database only for a production build

Development, the unit and contract suites, the Playwright suite and every CI job connect to the
compose database on `localhost` (or the service `db` inside compose). A deployment reaches a
managed Postgres instead, which is a remote host, so the strict local-only guard of
`connection::plan` could no longer be the only rule.

The mode is explicit rather than derived from the host: `WORK_TIME_TRACKER_ENV` is `development`
unless it says `production`, and only a production process may name a remote host. That keeps a
developer checkout, a test run and a CI job on a local database even when a remote connection
string happens to be present in the environment, and `test_support` refuses to create or drop a
database whenever the mode is production or the host is not local, so a deployed server can never
be the target of a test.

A remote connection is only accepted with `sslmode=verify-full` and a pinned certificate
authority. The chain and the host name are verified by `rustls` against that one authority instead
of the certificate store of the machine, and there is deliberately no environment variable, flag or
debug switch that relaxes the verification: a remote host without a verifiable certificate fails to
connect instead of falling back to an unencrypted session. The driver itself only knows
`disable`, `prefer` and `require`, so `connection.rs` splits `sslmode` and `sslrootcert` off the
connection string, asks the driver for `require`, and implements the verification in the connector.
A local connection keeps the plain session the compose database offers and is rejected if it asks
for an ssl mode that verifies nothing, so a half-secure configuration is never silently accepted.
The rule holds in both directions: a production process that is pointed at `localhost`, a loopback
address or a Unix socket is refused as well, so production cannot fall back to a plaintext local
database.

A deployment shares one database between clients, so migrating it on every start is not
acceptable: a production process only verifies that every migration of `MIGRATIONS` is recorded and
refuses to start otherwise. Applying them is a deliberate step, `WORK_TIME_TRACKER_DB_MIGRATE=true`
in a separately approved job that runs after the release artifacts are built. Only that step reads
the flag: `DbConfig::from_env`, which every application process uses, resolves a production
database as verify-only whatever the environment asks for, and `DbConfig::for_migration` of the
`migrate` entry point is the single place that may authorize applying them. The version of the
running build is reported from the binary, so no client writes into the shared `app_metadata` row;
only the migration step records the release that established the schema.

The connection details are configuration, not code. No host, project reference, user or password is
part of the repository: they are read from `DATABASE_URL` or assembled from `SUPABASE_DB_HOST`,
`SUPABASE_DB_PORT`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_NAME` and
`SUPABASE_DB_ROOT_CERT`, and the release workflow injects them from the secrets of the protected
`production` environment only. Every message that names a connection string passes
`redact_database_url` first.

## 17. The legal texts are versioned content, not layout

The terms of service and the privacy policy are declared as data in
`src/features/legal/legal-documents.ts` and rendered by one `LegalDocumentView`. A wording change
therefore never touches a component, and both pages stay identical in structure and in the
accessibility of their headings.

Each document carries its own version and an ISO day. The day is shown as it is written instead of
being formatted for the locale of the reader: it identifies a revision of a text, not a moment in a
timezone, and every timestamp the application derives from the clock is already timezone dependent
enough. An installed build keeps the revision it was released with, so a user can tell which text
that build includes.

Neither document is stored or synchronised, and the acceptance itself is not persisted. The
registration form requires accepting both texts before it creates an account; after sign-in, the
texts remain reachable from the account menu next to the third-party license notices.

Because decision 16 gives the application two storage modes, both texts name them instead of
promising a single one: desktop development builds, browser development or test runs, and
self-hosted production deployments keep the data in storage controlled by you or the organisation
that deploys the application for you, while a released production build stores it in the hosted
Postgres database in the EU. That is content again, so the distinction lives in the text, not in a
component that would have to know the mode. The texts also state that the authors administer the
production database and may read its contents to fix errors and evaluate usage, because a promise the
deployment cannot keep would be worse than no
promise.

## 18. Archiving retires a project, it never touches its records

A project that is no longer worked on is archived instead of deleted: deletion detaches its entries
(`project_id` becomes `NULL`) and the past reads as "Deleted project", which loses information the
monthly record needs. The `archived` flag only removes the project from the selections that create
time: the tracking picker, the time entry dialog and the quick add of the Time Management and Week
views. It stays on the Projects page with an `archived` marker, keeps its total, and its entries,
reports and exports are unchanged. A selection that already names an archived project — the edit of
an existing entry, the budget of that project — keeps offering it, so an edit cannot silently drop
the booked project.

Archiving is therefore allowed while the timer runs on that project: the running entry is a normal
row and stopping it must not fail because of a configuration change. The card keeps naming the
project until the user stops or switches; the archived project is only gone from the picker list.

An overdue budget follows the same idea. Once the due date has passed or the tracked time exceeds
the budget, selecting or tracking the project shows a status message next to the picker. It names
the reason in text with an icon, never by colour alone, and it never blocks starting, switching or
stopping the timer: recording what actually happened outweighs the plan.
