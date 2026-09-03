# UI audit

Audit of the interface against the principles and Laws of UX documented in
[`CONTRIBUTING.md`](../CONTRIBUTING.md). Findings marked **fixed** were addressed in the same change
as this document; findings marked **accepted** are conscious decisions and must not be "fixed"
silently later.

## Design tokens and contrast

The app ships a single dark theme (`color-scheme: dark` in `src/index.css`); there is no light
theme to verify. Ratios below are computed from the `oklch` token values against the surface they
are used on (WCAG 2.x relative luminance, sRGB).

| Foreground | Surface | Ratio | Requirement | Result |
| --- | --- | --- | --- | --- |
| `foreground` | `background` / `card` | 17.02 / 15.77 | 4.5:1 | pass |
| `muted-foreground` | `background` / `card` / `muted` | 7.43 / 6.89 / 5.86 | 4.5:1 | pass |
| `primary` (text, icons) | `card` / `background` | 4.77 / 5.15 | 4.5:1 | pass |
| `primary-foreground` | `primary-strong` (filled button) | 5.35 | 4.5:1 | pass, **fixed** (was 3.51 on `primary`) |
| `primary-foreground` | `destructive-strong` (filled button) | 5.68 | 4.5:1 | pass, **fixed** (was 4.52) |
| `destructive` (text) | `card` / `background` | 4.74 / 5.12 | 4.5:1 | pass, **fixed** (was 3.70 / 4.00) |
| `success` / `warning` (text) | `card` | 7.67 / 8.99 | 4.5:1 | pass |
| `input` (field boundary) | `background` / `card` | 3.47 / 3.22 | 3:1 | pass, **fixed** (was 1.40 / 1.30) |
| `ring` (focus indicator) | `background` / `card` | 5.15 / 4.77 | 3:1 | pass |
| `border` (card and divider lines) | `card` | 1.30 | – | **accepted**: decorative container edges, no state or component boundary depends on them |

Fixes: `--primary-strong` and `--destructive-strong` were added as the surfaces of filled buttons so
the accent tokens can stay bright enough to be readable as text; `--destructive` was lightened for
its text role and `--input` for the boundary role. No hue changed, so the palette is unchanged.

## Cross-cutting findings

| Area | Principle / Law | Finding | Fix |
| --- | --- | --- | --- |
| `components/ui/button.tsx` | Fitts's Law | `size="icon"` was 36×36 px and `size="sm"` 32 px high | **fixed**: icon buttons are 40×40 px; `sm` and the new `inline` size extend their hit area with a transparent pseudo element |
| `components/ui/button.tsx` | Consistency | inline text actions had no variant, so cards used hand-written markup | **fixed**: added the `link` variant and `inline` size |
| `components/ui/menu.tsx` | Fitts's Law | 36×36 px trigger | **fixed**: 40×40 px |
| `components/ui/dialog.tsx` | Accessibility, Consistency | modal behavior was inline and left the application reachable behind it | **fixed**: dialogs are portalled, inert the app root (with an `aria-hidden` fallback), trap and restore focus, lock body scroll, and close on `Esc`, close button, or a backdrop click |
| `components/ui/input.tsx` | Consistency | no shared checkbox, so option lists styled their own | **fixed**: added `Checkbox` |
| `components/ui/input.tsx` | Accessibility | `Input`/`Select`/`Textarea`/`Checkbox` were bare `className` wrappers: no generated `id`, no `aria-invalid`/`aria-describedby`, so validation errors were never announced | **fixed**: added a `Field` wrapper (`label`/`hint`/`error`) that generates the id with `useId()`, links `htmlFor`/`aria-describedby` and announces the error with `role="alert"`; `Checkbox` gained an optional `label` that renders a 40 px hit-area row. See "Field pattern" below. |
| `components/ui/input.tsx` | Consistency | `Select` is a native `<select>` while the rest of the kit is custom-styled, and the deviation was undocumented | **accepted**, now documented: native `<select>` keeps the OS picker on mobile and free keyboard behaviour; see the comment above `Select` in `input.tsx` |
| `components/ui/toast.tsx` | Accessibility, Peak-End | toasts already render in an `aria-live="polite"` region with `role="status"` | no change |
| All icons | Accessibility | most decorative `lucide` icons are not marked `aria-hidden` | **accepted**: they carry no accessible name, so assistive technology ignores them; new code follows the rule in `CONTRIBUTING.md` |
| Row triggers | Consistency | clickable list rows and grid cells used one-off `<button>` markup | **fixed**: they use the shared `Button` ghost variant with a 40 px minimum target |
| In-card range selects | Consistency, Fitts's Law | `time-by-project-card.tsx` and `weekly-summary-card.tsx` shrank the shared field to 32 px | **fixed**: they use the shared field height |
| `recent-projects-card.tsx` | Consistency | hand-written link button in the card header | **fixed**: `Button variant="link" size="inline"` |
| `project-dialog.tsx` | Fitts's Law | 28 px colour swatches sitting 8 px apart | **fixed**: 40 px hit area, gap widened so the areas do not overlap |

### Field pattern (`components/ui/input.tsx`)

`Field` wraps one `Input`/`Select`/`Textarea` child with a linked `label`, an optional `hint` and
an optional `error`:

```tsx
<Field error={error} label="Duration">
  <Input name="duration" onChange={...} value={values.duration} />
</Field>
```

- The control id is generated with `useId()` unless the child already has one; `label` gets a
  matching `htmlFor` so `getByLabelText` finds the control.
- `hint` renders as muted text linked through `aria-describedby`; it is replaced by `error` while
  the field is invalid so only one message is read at a time.
- `error` sets `aria-invalid="true"` on the control, appends the error paragraph's id to
  `aria-describedby`, and renders the message with `role="alert"` so screen readers announce it
  immediately. The `destructive` border and ring tokens apply automatically through the
  `aria-invalid:` Tailwind variant on the shared field classes — no extra prop needed on the
  control.
- `Field` clones its child, so `Input`/`Select`/`Textarea` stay usable standalone; the wrapper is
  additive.
- `Checkbox` takes an optional `label` instead, rendering the control and text together in a
  ≥40 px row (`min-h-10`), matching the working-day checkboxes on the Settings page.

Migrated: the quick-add and custom-duration fields on Time Management, the manual entry dialog on
Time Entries (including per-field zod error routing instead of one banner for every issue), the
login and registration forms, and the Settings work-schedule fields.

## Per-view audit

### Dashboard (`features/dashboard/dashboard-page.tsx`)

- Hierarchy: one `h1`, KPI values in `text-3xl`, captions in `text-xs`. The "Currently Tracking"
  label was a styled `<p>` — **fixed**, it is an `h2` now.
- Von Restorff: the running timer is the only element combining the `success` accent with a
  `success` card border — **fixed** by adding the border; the accent alone was shared with the
  overtime KPI.
- Accessibility: the running state was conveyed by the green elapsed time only — **fixed**, the card
  names `Running`/`Paused` in text.
- Goal-Gradient: daily target had a progress bar, the weekly total did not — **fixed**.
- Fitts's Law: start/stop use the largest button size in the first card; all other timer buttons are ≥40 px.
- Miller's Law: four KPI cards plus five labelled cards, all chunked; no flat wall of numbers.
- Doherty Threshold: the timer ticks locally through `use-ticker`; controls show an immediate pending
  state while React Query mutations complete, followed by toast feedback.
- Proximity: correct-start, stop, pause/resume form one group; deleting an entry lives in the row
  `Menu`, not next to them.

### Week (`pages/week-page.tsx`)

- Hierarchy and alignment: one `h1`, `space-y-5` sections, KPI grid and day cards use the shared
  gap scale.
- Miller's Law: metrics are grouped into "Overtime / balance", "Forecast", "Cumulative balance" and
  "Secondary stats" cards instead of one table.
- Accessibility: week navigation buttons are icon-only but labelled (`Previous week`, `Next week`)
  and now 40×40 px.
- Consistency: day cells use the shared `Button` ghost variant.

### Projects (`pages/projects-page.tsx`)

- Proximity and Contrast: edit and delete sat next to each other with identical styling —
  **fixed**, delete is separated (`ml-2`) and uses the destructive tone.
- Accessibility: both icon actions are labelled per project (`Edit Alpha`, `Delete Alpha`), deletion
  is confirmed through `ConfirmDialog`.
- Consistency: the project-name row trigger uses the shared `Button` ghost variant.

### Time Entries (`pages/time-entries-page.tsx`, `features/time-entries/`)

- Jakob's Law: reverse chronological list grouped per day, one card per day.
- Accessibility: play/pause and the row menu are labelled; destructive actions live inside the
  `Menu`, so they cannot be hit by accident.
- Serial Position Effect: the view moved to the second sidebar slot — **fixed** (see Sidebar).
- Postel's Law: manual start/end fields normalise `9`, `0900`, `09:00` and `9.5h`, while invalid
  values produce an inline error.
- Accessibility: `TimeEntryDialog` routes each zod issue to the `Field` of the field it names
  (`startTime`, `endTime`, `projectId`, …) — **fixed**, so the message sits next to the control it
  describes and is announced through it, instead of one shared banner for every issue.

### Time Management (`pages/time-management-page.tsx`)

- Postel's Law: the quick-add duration field accepts `2h 45m`, `90m`, `1.5h` and similar formats
  (`parseDurationMinutes`) and previews the parsed value before saving; invalid input produces the
  inline `DURATION_ERROR_MESSAGE` instead of a silent correction.
- Accessibility: the project and date fields in the quick-add row and the duration and date fields
  in the custom-duration dialog use `Field` — **fixed**, `DURATION_ERROR_MESSAGE` is now linked via
  `aria-describedby` and announced (`role="alert"`) instead of only being visible text.
- Progressive disclosure: the custom duration lives in a dialog, the common presets stay on the page.
- Tesler's Law: free-slot placement (`findFreeSlot`) resolves overlaps instead of asking the user.

### Budgets (`pages/budgets-page.tsx`)

- Goal-Gradient: the list showed budget and due date only — **fixed**, every row now shows a
  `Progress` bar with tracked time and consumption percentage.
- Accessibility: the over-budget state is not colour-only, the row spells out `exceeded`; each
  progress bar is labelled per project.
- Proximity and Contrast: delete separated from edit — **fixed** as on Projects.

### Reports (`pages/reports-page.tsx`)

- Law of Prägnanz: plain bar chart and a project list, no decorative chart styling.
- Hick's Law: the view is scoped to the current week and offers exactly one choice, the project of
  the budget card; no filter row competes with the chart.
- Accessibility: the chart is summarised as text in the card header (total, target, overtime) and
  the project list repeats every value, so the chart is not the only source of the data. The budget
  select is labelled `Budget project`.
- Goal-Gradient: the budget card shows consumption and the forecast at the due date as progress.

### Calendar (`pages/calendar-page.tsx`)

- Alignment: seven column grid with the shared gap scale.
- Accessibility: day cells are labelled row triggers; the tracked amount is text, not only a colour
  intensity.

### Working Time (`pages/working-time-page.tsx`)

- Accessibility: compliance state uses icon plus text (`ShieldCheck` + "No … issues",
  `AlertTriangle` + the rule message), never colour alone.
- Tesler's Law: ArbZG rules are evaluated in `features/compliance`, the user only picks a month.

### Audit Trails (`pages/audit-trails-page.tsx`)

- Read-only by design: the view renders the append-only trails of time entries, absences and
  overtime and offers no create, edit or delete action, so compliance evidence cannot be changed
  from the interface.
- Hick's Law: two filters only — a period (Today, Last 3/7/14 days, Last month, Always; default
  Last 7 days) and a multi-select of the trail types, where no selection reads as "all types".
- Tesler's Law: the period is sent to the repositories as a `ListRange`, so the window is applied
  where the records are read instead of after a full read.
- Hierarchy: every row leads with the trail type, the action and a summary; changed fields and the
  actor with the timestamp follow as secondary text.
- Empty and error state are both handled as text callouts ("No audit records for the selected
  filters.", "The audit trails could not be loaded.").
- Privacy: the queries are scoped to the signed-in user by the backend; the view has no control to
  select another user.

### Settings (`pages/settings-page.tsx`)

- Consistency: the working-day checkboxes were raw `<input type="checkbox">` — **fixed**, they use
  the shared `Checkbox` and sit in 40 px high rows; they now use `Checkbox`'s `label` prop instead
  of a hand-wrapped `<label>`.
- Hick's Law and Chunking: work schedule, calendar and working-time limits are three `Card`
  sections instead of one long form.
- Progressive disclosure: German defaults are restorable with one action, so the limits do not have
  to be understood to use the app.
- Hierarchy: the load-error block is a text callout, deliberately not styled like a banner
  (Selective Attention).

### Login and user creation (`features/auth/`)

- Hierarchy: each page renders a single `h1` inside the auth card; the heading is `text-lg` because
  the card is the whole page.
- Accessibility: password rules are a checklist with icon and text per rule, not a colour-coded bar;
  the email/password fields use `Field` — **fixed**, so a validation error is linked to its field
  via `aria-describedby`/`aria-invalid` and announced (`role="alert"`), not only visible text below
  the form.
- Progressive disclosure: registration is a separate page reached from the login page, so first-time
  use is not blocked by extra fields.

### Third-party licenses (`pages/licenses-page.tsx`)

- Hierarchy: `h1` plus `h2` sections wired to their `section` with `aria-labelledby`.

### Sidebar, header, footer (`components/layout/`)

- Accessibility: the sidebar defaults to its labelled, expanded state and has a persisted, labelled
  40 px expand/collapse control. Collapsed labels remain `sr-only`, including the "Local data"
  notice, and group labels remain accessible headings.
- Navigation: all 13 destinations are list items in one labelled navigation list, so their set size
  and position are exposed. Track, Review, Manage and Audit headings chunk related views; the
  settings item remains last and ungrouped.
- Keyboard: a visible-on-focus "Skip to main content" link is the first app control and moves focus
  to the focusable main landmark.
- Fitts's Law: nav items and the rail control keep a 40 px minimum height.
- Serial Position Effect: Dashboard and Time Entries open the Track group, while Settings keeps the
  final position where users expect it (Jakob's Law).
- Header: the account menu trigger is icon-only but labelled `Account menu`; logout is marked
  destructive inside the menu instead of being a bare header button.

## Responsive behaviour

Verified in Chromium at 1440 px, 1024 px and 768 px: every top-level view renders without horizontal
overflow (`scrollWidth === clientWidth`) and keeps exactly one level-1 heading. The collapsed sidebar
keeps all 13 navigation names in the accessibility tree and all controls remain at least 40 px high;
the only control whose painted box is smaller than 40 px is the inline "View all" link, whose
transparent hit area was verified by clicking 6 px above its visible box.
