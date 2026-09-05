---
name: code-review
description: Review checklist for every WorkTimeTracker code review, including PR reviews, requested reviews, and local/staged diffs across frontend, Rust backend, contracts, migrations, tests, and docs.
---

# Code review

Apply this checklist to **every** code review in this repository. Project constraints, layout, and
commands are in [`AGENTS.md`](../../../AGENTS.md); this skill only adds what a reviewer checks.

## Process

1. **Scope** — read the diff, the linked issue, and
   [`architecture/decisions.md`](../../../architecture/decisions.md). Decide which dimensions apply
   and name every skipped dimension with a reason.
2. **Verify the claim** — derive the intended behaviour from title, description, and tests, then
   confirm the diff delivers exactly that, no more.
3. **Dimension pass** — walk the dimensions below in order.
4. **Evidence** — every finding cites `file:line` and states the concrete risk. No location, no
   finding.
5. **Severity** — `blocker` (correctness, security, data loss, contract divergence), `major`
   (architecture, missing tests), `minor` (readability), `nit` (style, explicitly optional).
6. **Verification** — state which applicable quality checks from
   [`docs/development.md`](../../../docs/development.md#quality-checks) were run or still need to
   run.
7. **Verdict** — approve, request changes, or comment, using the output template.

## Dimensions

### 1. Correctness - frontend

- Timestamps stay canonical UTC ISO 8601 with milliseconds; days, weeks, and durations are derived
  with `src/lib/date.ts` helpers. No fixed timezone, no DST-naive arithmetic on `DAY_MS`.
- Timer transitions (start, pause, resume, stop, switch) keep the invariants: a running entry has
  `end_time` NULL, and entries of one user never overlap (`src/features/timer/`).
- Derived values stay derived: overtime beyond the explicit records in `src/features/overtime/`, and
  the daily target derived from the weekly target in `src/features/settings/`, are never persisted.
- The UI kit in `src/components/ui/` is reused; a new one-off component needs a justification.
- Feature logic lives in `src/features/<name>/`, views stay one component per file in `src/pages/`.
- The Tauri repository and the browser fallback in `src/features/storage/` behave identically for
  the changed behaviour.

### 2. Correctness - backend

- Validation in `src-tauri/src/models.rs` is extended, not bypassed.
- Rules stay single-sourced in `contract/domain-rules.json` and are asserted by
  `src-tauri/src/contract.rs` and `src/features/storage/domain-rules.contract.test.ts`.
- Break, daily maximum, and rest period limits are enforced where entries are written
  (`src-tauri/src/postgres_store.rs`, `src/features/compliance/compliance-rules.ts`).
- Commands in `src-tauri/src/commands.rs` use `authed_command!`, return `Result` with the typed
  `AppError` from `src-tauri/src/error.rs`, and never `unwrap`/`expect` on a request path.
- Every query is scoped by the session user id.
- A schema change updates `drizzle/0000_init.sql`, `MIGRATIONS` in `src-tauri/src/postgres_store.rs`,
  `src/db/schema.ts`, and `docs/data-model.md` together.

### 3. Readability - KISS, DRY, YAGNI

- Simplest solution that satisfies the requirement; no speculative abstraction, no configuration
  knob without a caller.
- Duplication inside one bounded context is a finding. Frontend/backend duplication of a rule that
  `contract/domain-rules.json` owns and both sides assert is **intentional** and not a finding.
- Framework-free helpers belong in `src/lib/`; naming and placement follow
  [`docs/development.md`](../../../docs/development.md#repository-layout).
- Functions stay small and single-purpose; deep nesting and boolean parameter flags are flagged.
- Comments explain why, never restate the code.

### 4. Architecture

- Behaviour that changes a recorded decision needs a new or updated entry in
  `architecture/decisions.md`; new components, containers, or relations update
  `architecture/work-time-tracker.c4` (`npm run architecture:check`).
- Layering holds: `src/pages/` → `src/features/` → `src/lib/`, `src/db/`. No page reaches into
  another feature's internals; `src/lib/` imports neither React nor `@tauri-apps/api`.
- Offline-first: no network call other than the configured Postgres connection.
- Cross-platform: no OS-specific path handling or assumptions.

### 5. Security

- `src-tauri/src/auth.rs`: hashing parameters from the contract, session handling intact, no
  credential or hash in a log line.
- Secrets stay in the environment; `POSTGRES_PASSWORD` and `DATABASE_URL` are never committed or
  logged.
- Logging goes through `src/lib/logger.ts` and `src-tauri/src/logging.rs`, with redaction mirrored in
  `src/lib/redact.ts`; tracked time content, emails, tokens, and file paths are redacted.
- SQL is parameterised in `src-tauri/src/postgres_store.rs`; no string-built query.
- Tauri capabilities and permissions under `src-tauri/` stay minimal; no new command without an auth
  check.
- `resolveDevServerHost` in `vite.config.ts` keeps `127.0.0.1` as its default, and the `csp` in
  `src-tauri/tauri.conf.json` is not widened.

### 6. Performance

- Dashboard, week view, and per-project aggregation stay linear in the number of entries and are not
  recomputed per render; memoise where it is measurable.
- Queries are bounded by date range and by the list limits in `contract/domain-rules.json`.
- Exports in `src/features/compliance/` batch rather than materialising a whole history.
- No blocking work on the Tauri main thread; long-running commands are async.
- Startup and timer tick cost are not regressed.

### 7. Dependencies

- A new npm or crate dependency states what it replaces, its maintenance status, and its transitive
  count; the standard library or an existing helper wins over a micro-dependency.
- OSI-approved licence, `npm run licenses:generate` re-run and `src/data/licenses.json` committed.
- `package-lock.json` or `Cargo.lock` updated in the same change, without unrelated churn.
- No dependency that implies a runtime network call.

### 8. Tests

- Frontend tests sit next to the subject as `<name>.test.ts(x)` under `src/`, script tests as
  `scripts/<name>.test.mjs`, Rust tests as `#[cfg(test)]` modules with helpers from
  `src-tauri/src/test_support.rs`.
- E2E specs are `e2e/<topic>.spec.ts`, reuse `e2e/helpers.ts`, and are listed in
  `docs/e2e-test-cases.md`.
- A bugfix ships a regression test that fails without the fix; no existing test is weakened or
  deleted.
- Domain edge cases: DST transitions, midnight-crossing entries, overlapping entries, a running timer
  across an app restart, month boundaries in exports.
- Tests mock the clock and do not depend on timezone or test order; coverage stays at or above the
  `npm run test:coverage` gate.

### 9. Documentation precision

- No new file when `AGENTS.md`, `CONTRIBUTING.md`, `docs/`, or `architecture/decisions.md` is the
  right home; no agent-generated summary, changelog, or plan artefact is left in the repository.
- Docs are short and factual: no marketing, no restating code, no duplicated table of contents, no
  content copied out of `AGENTS.md` instead of linked.
- Behaviour docs change in the same commit; `docs/data-model.md`, `docs/e2e-test-cases.md`, or
  `docs/ui-principles.md` left stale by the diff is a finding.

### 10. Claim and implementation consistency

- Title and description match the diff; unrelated changes are called out.
- Command names, doc comments, and error messages describe what the code does.
- Dead code, a feature flag with a single branch, and a TODO without an issue reference are flagged.

### Additional criteria

- **Accessibility**: keyboard operation, focus handling, and labelled timer controls per
  `docs/ui-principles.md`; contrast comes from the tokens in `src/index.css`, not raw colours.
- **Locale**: dates, times, and durations are formatted through `src/lib/date.ts`, so the format
  stays consistent and DST-safe; no ad-hoc format string, no second UI language in shared components.
- **Migration safety**: migrations are forward-only and non-destructive by default, because the
  user's database is theirs and we cannot inspect it.
- **Audit trail**: writes to entries, projects, budgets, absences, overtime, and settings append
  audit rows atomically in the mutation paths (`src/features/storage/local-repository.ts`,
  `src-tauri/src/postgres_store.rs`) per `architecture/decisions.md`; a write path that bypasses
  it is a blocker.
- **User-facing errors**: surfaced through `src/lib/errors.ts` by `AppError.kind`, never by message
  text, and never leaking a connection string or a stack trace.

## Output template

```text
## Summary
<what the change does, two sentences>

## Verdict
approve | request changes | comment

## Blockers
- <file:line> - <risk>

## Major
- <file:line> - <risk>

## Minor / Nits
- <file:line> - <risk> (optional)

## Skipped dimensions
- <dimension> - <reason>

## Verification
<commands run or still required>
```

The review itself obeys the documentation-precision rule: findings only, no restated diff.
