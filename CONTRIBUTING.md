# Contributing

## Prerequisites

- Node.js 26+
- Rust stable
- [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/)

Install the dependencies once:

```sh
npm ci
```

## Running the applications locally

### Desktop application (Tauri)

```sh
npm run tauri dev
```

Starts the Rust backend and the frontend in a native window. The native backend requires Postgres;
copy `.env.example` to `.env` and start the compose `db` service first (see the README's
"Database backend" section).

### Web application (browser)

```sh
npm run dev
```

Serves the UI at <http://localhost:1420> without the Rust backend. Data is stored in
`localStorage`.

## Quality checks

Run before opening a pull request:

```sh
npm run lint
npm run typecheck
npm run test:coverage
npm run test:e2e
npm run architecture:check
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm run test:coverage` fails below 80 percent statement, branch, function, or line coverage.

## Guidelines

- Only add dependencies with an OSI-approved open-source license.
- Keep documentation concise.
- Domain rules live in `contract/domain-rules.json` and must stay in sync with the Rust backend and
  the browser fallback.
- `drizzle/0000_init.sql` is the baseline migration and stays unchanged. A schema change gets a new
  numbered file in `drizzle/`, is appended to `MIGRATIONS` in `src-tauri/src/postgres_store.rs`
  (which applies it once, inside a transaction, and records it in `schema_migrations`), and comes
  with the matching update in `src/db/schema.ts` and the queries in
  `src-tauri/src/postgres_store.rs`.
- The Rust tests that need a database skip without a reachable `DATABASE_URL`; set
  `REQUIRE_POSTGRES_TESTS=1` (as CI does) to turn that skip into a failure.

## Pull requests

Describe the change and the checks you ran. Keep changes focused on one topic.
