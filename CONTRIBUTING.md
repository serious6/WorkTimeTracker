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

`npm run test:e2e` builds the app in the `test-e2e` mode and serves the build with `vite preview`,
which is faster and more stable than running the tests against the dev server.

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

## UI and design principles

These principles are binding for every UI change. The current state of the interface is
documented in [`docs/ui-audit.md`](docs/ui-audit.md); update it when a view changes noticeably.

Reuse before inventing: `Button`, `Card`, `Dialog`, `ConfirmDialog`, `Menu`, `Input`, `Select`,
`Textarea`, `Checkbox`, `Progress` and `Toaster` in `src/components/ui/` are the only sanctioned
patterns. Colours come from the tokens in `src/index.css` (`background`, `card`, `sidebar`,
`primary`, `primary-strong`, `muted`, `border`, `input`, `ring`, `success`, `warning`,
`destructive`, `destructive-strong`); spacing, radius and typography come from the Tailwind scale.

### 1. Hierarchy

The running timer and the totals of the day are the reason the app is opened, so they have to be
read first. Every view starts with exactly one `<h1 className="text-2xl font-bold tracking-tight">`
and heading levels are never skipped.

- Do: render the page title as `h1`, card titles as `CardTitle` (`h2`), and the primary metric in
  `text-2xl`/`text-3xl font-semibold tabular-nums` as in `kpi-cards.tsx`.
- Don't: give a secondary caption the same weight and size as the metric it explains, or fake a
  heading with a styled `<p>`.

### 2. Progressive disclosure

Time tracking is simple, its rules are not. Advanced options stay hidden until they are needed.

- Do: keep optional inputs behind a section or a dialog, like the custom range inputs in
  `time-by-project-card.tsx` that only appear for the `custom` range.
- Don't: put every setting of a screen into one flat form.

### 3. Consistency

One pattern per job. A deviation needs a comment that explains why.

- Do: use `Button` with its variants, `Dialog`/`ConfirmDialog` for modals and `Input`/`Select`/
  `Textarea`/`Checkbox` for fields.
- Don't: write one-off markup such as `<button className="rounded-md bg-blue-500 …">`.

### 4. Contrast

High contrast is a signal, not decoration.

- Do: reserve `variant="destructive"` for deleting data and use `outline`, `ghost` or `subtle`
  for everything else; the timer stop button is the one routine action that earns it.
- Don't: colour several actions of the same card as destructive or primary.

### 5. Accessibility

WCAG 2.2 AA is the baseline: 4.5:1 for body text, 3:1 for large text and the boundaries of
interactive elements. Verify token changes with a contrast checker and record the numbers in
`docs/ui-audit.md`.

- Do: give icon-only controls an `aria-label` (`aria-label="Stop timer"`), mark decorative icons
  and colour dots `aria-hidden`, and keep labels of collapsed navigation items in the accessibility
  tree with `sr-only lg:not-sr-only`.
- Do: keep state readable without colour — the timer card names `Running`/`Paused` next to the
  green accent.
- Don't: hide a label with `hidden`, remove the focus ring, or rely on a coloured dot alone.

### 6. Proximity

Related controls belong together, dangerous ones do not.

- Do: keep start, pause and stop in one control group as in `currently-tracking-card.tsx`, and move
  delete behind the row `Menu` or into a separate icon slot guarded by `ConfirmDialog`.
- Don't: place a delete button next to a save button without separation.

### 7. Alignment

Consistent alignment makes related information easier to scan and compare.

- Do: use `space-y-5` for page sections, `gap-4`/`gap-5` for card grids, `Card` for grouping and
  `tabular-nums` for every number that is read in a column.
- Don't: use arbitrary values such as `p-[13px]` or `mt-[7px]`; if the scale does not fit, explain
  why in the pull request.

### Laws of UX

The decisions below follow [lawsofux.com](https://lawsofux.com). Adopted laws are binding,
considered laws need judgement, rejected laws must not be reintroduced.

#### Adopted

| Law | Why here | How it is applied |
| --- | --- | --- |
| Jakob's Law | Users arrive from Toggl, Clockify or Harvest. | Sidebar navigation, a start/stop control at the top of the dashboard and a reverse chronological entry list (`time-entry-list.tsx`). |
| Fitts's Law | Starting and stopping is the most frequent action. | The primary start/stop control uses the largest `Button` size in the first dashboard card; every interactive control keeps a 40×40 px hit area (`size="sm"` and `size="inline"` extend their box with a transparent pseudo element). |
| Hick's Law | Settings, budgets and reports offer many options. | Options are grouped into `Card` sections; ranges are chosen from one `Select` instead of many toggles. |
| Miller's Law | Dashboard and reports carry many numbers. | Four KPI cards per row at most, further metrics chunked into labelled cards. |
| Law of Proximity | See principle 6. | Timer controls are one group; deleting is separated. |
| Law of Common Region | Cards are the grouping device. | Use `Card`/`CardHeader`/`CardContent` instead of ad-hoc spacing. |
| Law of Similarity / Uniform Connectedness | Reinforces principle 3. | A `Button` variant always means the same thing; row triggers always look like rows. |
| Aesthetic-Usability Effect | Polish raises trust in the tracked data. | One spacing scale, one radius (`--radius`), one type scale. |
| Doherty Threshold | Timer ticks and storage reads. | Timer and entry controls show a pending state immediately while writes complete, then mutations report through `toast`. |
| Peak-End Rule | Stopping the timer is the emotional peak. | Stopping and saving confirm with a toast that names the tracked duration. |
| Goal-Gradient Effect | Daily and weekly targets, project budgets. | `Progress` bars for the daily target, the weekly target and every budget instead of raw totals. |
| Postel's Law | Manual time entry. | Time fields accept `9`, `0900`, `09:00` and decimal hours such as `9.5h`; invalid input is reported inline instead of silently corrected. |
| Von Restorff Effect | The running timer must stand out. | Only the active timer combines the `success` accent with a `success` card border. |
| Serial Position Effect | Sidebar order. | Dashboard and Time Entries open the list, Settings closes it, rarely used views sit in the middle (`app-sidebar.tsx`). |
| Tesler's Law | Rounding, overtime and break rules are complex. | The complexity lives in `contract/domain-rules.json` and the backend, not in user-facing options. |

#### Considered

| Law | Rationale |
| --- | --- |
| Zeigarnik Effect | A running timer is an open loop, so the dashboard shows it permanently — but no reminders, badges or nagging. |
| Law of Prägnanz | Reports use plain bar and donut shapes; no decorative chart styling. |
| Chunking | Applied to settings and reports; small forms stay flat. |
| Selective Attention | Hints avoid banner styling so they are not skipped as advertising. |
| Occam's Razor | Remove elements that do not earn their place, but never at the cost of discoverability. |

#### Rejected

| Law | Why it must not be used |
| --- | --- |
| Flow and variable reward | This is a utility tool; we do not optimise for time spent in the app. |
| Paradox of the Active User | Not an excuse to skip documentation — we document, but never block first use. |
| Parkinson's Law and artificial delays | An interaction is never slowed down to feel more substantial. |
| Persuasion through cognitive bias (scarcity, social proof, anchoring) | A local-first personal tool has nothing to sell. |

## Pull requests

Describe the change and the checks you ran. Keep changes focused on one topic.
