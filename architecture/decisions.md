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

## 3. Sessions and credentials

Native sessions live in memory and end after 480 idle minutes; every command extends them, a
restart always returns to the login page. Both backends lock an email out for 15 minutes after 5
failed logins, in memory only. The limits are part of the contract file, so both sides stay equal.

The browser fallback stores an opaque random token in `sessionStorage` and resolves it against a
session record with an expiry, so the signed in account cannot be changed by editing a user id.
Client-side storage stays fully readable and writable, therefore the fallback is a development and
test tool only. It is never shipped as the production path, which is also why it hashes passwords
with PBKDF2-SHA256 (210,000 iterations, the strongest KDF available in the browser) while the Rust
backend uses Argon2id for real credentials.

## 4. One mutex around SQLite

`Database(pub Mutex<Connection>)` serializes every database access of the application. For a local,
single-user desktop app with short-lived commands this is intentional: it keeps transactions simple
and rules out concurrent writer errors of SQLite. The tradeoff is that commands cannot run in
parallel, so a slow query blocks the whole application.

Revisit the decision when any of these becomes true: commands run long enough to be noticed,
background jobs write while the user works, or reports read large ranges. A connection pool with
SQLite in WAL mode, or a reader connection next to a single writer, is the expected next step.
