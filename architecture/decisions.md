# Architecture decisions

## 1. Two backends, one contract

The Rust commands (`src-tauri/src/commands.rs`) are the production backend. The browser fallback
(`src/features/storage/local-repository.ts`) exists so that the UI can be developed and tested with
Playwright without a native build. Both implement the same domain rules and would otherwise drift
apart silently.

`contract/domain-rules.json` is the single source of truth for those rules. Every case is executed
twice: by `src-tauri/src/contract.rs` against the Rust models and by
`src/features/storage/domain-rules.contract.test.ts` against the Zod schemas and `findOverlap`. It
covers credential and password validation, project, time entry, budget and settings validation,
normalization, overlap detection, and the shared security limits. A rule that changes on one side
only fails the other suite in CI, so new rules are added to the contract first.

## 2. Structured errors across the IPC boundary

Commands return `AppError` (`src-tauri/src/error.rs`) instead of `String`. The variants
`notSignedIn`, `validation`, `conflict`, `notFound`, `rateLimited`, `database`, and `internal` are
serialized as
`{ "kind": ..., "message": ... }`. The frontend turns them back into the `AppError` class in
`src/lib/errors.ts` and branches on `kind` with `isErrorKind`, never on message text. Messages of
the `database` kind are replaced by the fallback text of the calling view, so infrastructure
details never reach the user interface. `internal` covers failures of the process itself, such as a
key derivation or a poisoned lock; its message is replaced the same way, so a failing KDF is never
reported as a database failure.

## 3. One log file for both sides

Every failed command is written to `<app data>/logs/work-time-tracker.log` by `logging::logged`
(`src-tauri/src/logging.rs`), together with backend panics and setup failures. The frontend sends
its own failures through the `log_client_error` command, so render errors, unhandled rejections and
failed queries end up in the same file. The browser fallback has no file system and logs to the
console instead.

Both sides redact before writing: e-mail addresses, password hashes, values of keys such as
`password` or `token`, and file system paths are replaced by `[redacted]`. The rules are mirrored in
`src-tauri/src/logging.rs` and `src/lib/redact.ts` and every message is clamped to 2,000 characters.
The file is rotated once it passes 512 KiB, and a failing logger never breaks a command.

## 4. Sessions and credentials

Native sessions live in memory and end after 480 idle minutes; every command extends them, a
restart always returns to the login page. `login` and `register` start a session and answer with its
opaque random id (`auth::SessionId`, 32 bytes from the operating system RNG). Sessions are kept in a
map keyed by that id, and every command names the session it acts for instead of reading one ambient
process-global session, so two windows can hold two identities and a session is distinguishable in
an audit. Expired sessions are dropped whenever the map is read, so it stays bounded. The id is a
bearer token for the whole command surface, so the frontend keeps it in a module variable of
`src/features/storage/tauri-repository.ts` and in no storage a page script can reach — neither
`sessionStorage` nor `localStorage` nor a cookie — where an injected script or an open devtools
console could read and replay it. Reloading the window therefore returns to the login page as well;
the abandoned backend session ends with its idle timeout, and restarting the application starts
there because the backend map is empty again. Both storage paths lock an email out for 15 minutes after 5
failed logins. The limits are part of the contract file, so both sides stay equal.

The native counters live in the `login_attempts` table, not in the process: restarting the
application no longer clears a lockout. A login counts its attempt before it verifies the password,
through the single store operation `reserve_login_attempt`: it evicts the counters whose lockout has
been served, counts the attempt and answers the resulting count in one transaction. Checking and
counting separately would let parallel logins all read the same count and verify a password
together, so the table stays bounded and the limit holds under concurrency. A successful login
clears the counter, and a rejected attempt leaves the counter frozen, so a locked out address cannot
extend its own lockout. The browser fallback keeps its counters in memory and is single threaded,
which is consistent with it not being a security boundary.

A login with an unknown email verifies a fixed dummy hash instead of returning early, so both paths
spend the same Argon2 work and the response time does not reveal whether an account exists.

The browser fallback stores an opaque random token in `sessionStorage` and resolves it against a
session record with an expiry. Client-side storage stays fully readable and writable, therefore the
fallback is a development and test tool only, not a security boundary. It is never shipped as the
production path, which is also why it hashes passwords with PBKDF2-SHA256 (the strongest KDF
available in the browser) while the Rust backend uses Argon2id for real credentials.

Both key derivations are pinned instead of using library defaults: Argon2id runs with 19 MiB of
memory, two passes and one lane, PBKDF2-SHA256 with 210,000 iterations, both following the OWASP
recommendation. The numbers live in `contract/domain-rules.json` (`keyDerivation`), so a dependency
update cannot silently change the cost of a hash. Verification still reads the parameters from the
stored hash, so older hashes keep working.

## 5. Postgres connection pool

The native backend talks to Postgres through a small synchronous `r2d2` connection pool. Commands
still execute short transactions, but independent requests do not need to share one process-wide
connection. The pool keeps startup and command code simple while leaving room for background jobs or
report queries to run without blocking unrelated reads.

## 6. Audit trail and timer recovery

Every write of a time entry appends one `time_entry_audits` row with the actor (`user_id`), the timestamp,
and JSON snapshots of the old and the new value. The rows are written inside the same connection as
the change, so a rejected write records nothing, and they are never updated or deleted. The native backend and
the browser fallback both implement it, so the fallback keeps the same evidence.

The running timer is the time entry without an end time, never a client-side clock. On start the
stored entries decide what is running (`reconcileSession`), so a restart, a crash or a system sleep
cannot lose tracked time; the persisted session only carries the closed segments of a paused timer.
A running timer can be moved to the time work actually started (`correctStart`); the entry itself is
rewritten, so every derived figure and the audit trail follow.

Stopping the timer rounds the tracked session to whole minutes, half up on the seconds part
(`roundToMinutes`). The rounding happens once, and the stored end time already carries the rounded
value, so no report or export rounds a second time. A session that rounds to zero minutes, that is
one shorter than 30 seconds, is discarded instead of stored and the user is told so.

## 7. The repository is resolved on use, not at module load

`src/features/storage/index.ts` exposes `getRepository()` instead of a `repository` constant. The
backend is chosen on the first call and cached, so tests can replace it with `setRepository()` and
restore the default with `setRepository(null)` instead of mocking the module.

The browser fallback is only reachable through `createLocalRepository()`, which throws outside a
development or test build (`import.meta.env`). The dead branch also lets the bundler drop the
fallback from a production desktop build, so the code that is explicitly not a security boundary is
neither shipped nor constructible there.

## 8. Authentication is the default of a command, not a convention

Commands are written with the `authed_command!` macro in `src-tauri/src/commands.rs`. It adds the
log frame and the lookup of the signed in user, and only then runs the body, which receives the user
id as a binding. Authorisation can no longer be forgotten by leaving a line out: a command that runs
without a session has to be written by hand and named in `commands::PUBLIC_COMMANDS`
(`register`, `login`, `logout`, `current_session`, `get_app_version`, `log_client_error`).

Two tests keep the list honest. Both read the declaration of a function instead of matching a name
as a substring, so a hand written `pub async fn` is seen too. One fails when the hand written
`#[tauri::command]` functions are not exactly `PUBLIC_COMMANDS`, the other fails when a command
registered in `tauri::generate_handler!` is neither generated by an `authed_command!` invocation nor
public.

Input validation that belongs to the domain stays in `models.rs`: `SaveAbsence::validate_range`
holds the rule that a saved range is not empty, is valid per day and never repeats a day, instead of
the command spelling it out.

## 9. List commands answer a bounded window

`list_time_entries`, `list_time_entry_audits`, `list_audit_log` and `list_absences` take an optional
range: `from` inclusive, `to` exclusive, plus a `limit`. The filter is pushed into SQL, so a query
costs what the view shows instead of the whole account history. Without a range a command still
answers at most `DEFAULT_LIST_LIMIT` rows, newest first, and the combined audit log stays at
`AUDIT_LOG_LIMIT`. All three numbers live in `contract/domain-rules.json`, so
`src/features/storage/list-range.ts` and `src-tauri/src/models.rs` cannot drift apart.

The calendar reads only the six weeks of its grid, as timestamps for the entries and as date keys
for the absences, so a time zone east or west of UTC cannot lose an entry at the edge of the grid.

The views whose numbers span the account (the cumulative balance, the budget progress, the monthly
export) name no window. `listAllPages` in `src/features/storage/list-range.ts` then reads the whole
history page by page, each page a bounded query for the newest rows before the oldest row already
read. Every request stays bounded while no calculation is silently based on a truncated page.

## 10. `contract/entities.json` is the authority for the entity shapes

The same entities used to be described in four places: the Drizzle schema (`src/db/schema.ts`), the
SQL migrations in `drizzle/`, the Rust models (`src-tauri/src/models.rs`) and the Zod schemas under
`src/features/*`. Rust owns all runtime SQL, so nothing forced the four to agree.

`contract/entities.json` now names the fields, their types and their nullability for every entity
that crosses the IPC boundary, and both sides are checked against it:

- `serializes_the_models_of_the_entity_contract` in `src-tauri/src/contract.rs` serializes a sample
  of every model and compares the field names, types and nulls.
- `src/features/storage/entities.contract.test.ts` compares the Zod schemas with the same file and
  asserts that only the declared fields accept `null`.

A field added or renamed on one side only fails one of the two suites. `drizzle/*.sql` stays the
migration history of the database and `src/db/schema.ts` its typed description; neither is consulted
at runtime, and neither may add a field to an entity without the contract naming it.

## 11. Consolidate the unreleased database schema into one baseline

WorkTimeTracker has not shipped a release, so no deployed database needs an incremental upgrade
path. The complete Postgres schema therefore lives in `drizzle/0000_init.sql`, and
`PostgresStore` registers that single migration.

This makes a fresh installation reproducible without retaining pre-release migration history.

## 12. The dev server is loopback only, LAN access is an opt-in

The dev server used to start with `--host 0.0.0.0` from `beforeDevCommand`, which offered the
unauthenticated UI and the source maps to every host on the network for the whole development
session. `vite.config.ts` now resolves the bind address in `resolveDevServerHost` and defaults to
`127.0.0.1`.

Testing on a physical device is the one case that needs more, and it uses the variable the Tauri CLI
already sets for `tauri android dev --host`: `TAURI_DEV_HOST=<address>` binds the dev server to that
address. Nothing else in the repository binds a wildcard address, apart from the container image,
whose port `compose.yaml` publishes on `127.0.0.1` only.

## 13. The webview executes no inline code

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

## 14. Local Postgres for development, a remote database only for a production build

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
