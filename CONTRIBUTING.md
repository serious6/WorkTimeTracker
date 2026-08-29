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

Starts the Rust backend and the frontend in a native window. Data is stored in a local SQLite
database.

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
npm test
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
- Schema changes need a versioned migration in `drizzle/` plus the matching update in
  `src/db/schema.ts` and `src-tauri/src/database.rs`.

## Pull requests

Describe the change and the checks you ran. Keep changes focused on one topic.
