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
`notSignedIn`, `validation`, `conflict`, `notFound`, `rateLimited`, and `database` are serialized as
`{ "kind": ..., "message": ... }`. The frontend turns them back into the `AppError` class in
`src/lib/errors.ts` and branches on `kind` with `isErrorKind`, never on message text. Messages of
the `database` kind are replaced by the fallback text of the calling view, so infrastructure
details never reach the user interface.

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
restart always returns to the login page. Both storage paths lock an email out for 15 minutes after 5
failed logins, in memory only. The limits are part of the contract file, so both sides stay equal.

The browser fallback stores an opaque random token in `sessionStorage` and resolves it against a
session record with an expiry. Client-side storage stays fully readable and writable, therefore the
fallback is a development and test tool only, not a security boundary. It is never shipped as the
production path, which is also why it hashes passwords with PBKDF2-SHA256 (210,000 iterations, the
strongest KDF available in the browser) while the Rust backend uses Argon2id for real credentials.

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
