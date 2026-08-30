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
an audit. Expired sessions are dropped whenever the map is read, so it stays bounded. The frontend
keeps the id in `sessionStorage` of the webview: reloading the window keeps the session, restarting
the application starts at the login page because the backend map is empty again. Both storage paths lock an email out for 15 minutes after 5
failed logins. The limits are part of the contract file, so both sides stay equal.

The native counters live in the `login_attempts` table, not in the process: restarting the
application no longer clears a lockout. Every check and every recorded failure first deletes the
counters whose lockout has been served, so the table stays bounded no matter how many addresses are
tried. The browser fallback keeps its counters in memory, which is consistent with it not being a
security boundary.

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

Two tests keep the list honest. One fails when a hand written `#[tauri::command]` is not declared
public, the other fails when a command registered in `tauri::generate_handler!` is neither generated
by the macro nor public.

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

The calendar reads only the six weeks of its grid. The dashboard, the week view and the reports keep
the bounded default on purpose: the cumulative balance and the budget progress count every day since
the first tracked entry, so a window would change the number they show.

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
