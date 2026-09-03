# UI and design principles

Binding for every UI change, referenced from [`../CONTRIBUTING.md`](../CONTRIBUTING.md) and
[`../AGENTS.md`](../AGENTS.md). Record the resulting state in [`ui-audit.md`](ui-audit.md).

Reuse before inventing: `Button`, `Card`, `Dialog`, `ConfirmDialog`, `Menu`, `Input`, `Select`,
`Textarea`, `Checkbox`, `Progress` and `Toaster` in `src/components/ui/` are the only sanctioned
patterns. Colours come from the tokens in `src/index.css`; spacing, radius and typography come from
the Tailwind scale. Arbitrary values such as `p-[13px]` need a justification in the pull request.

1. **Hierarchy** — one `<h1 className="text-2xl font-bold tracking-tight">` per view, no skipped
   levels, card titles as `CardTitle`, primary metrics as `text-2xl`/`text-3xl font-semibold
   tabular-nums` (`kpi-cards.tsx`). Never fake a heading with a styled `<p>`.
2. **Progressive disclosure** — optional inputs stay behind a section or dialog, as the custom range
   inputs in `time-by-project-card.tsx`. No flat forms holding every setting of a screen.
3. **Consistency** — one pattern per job; a deviation needs a comment explaining why. No one-off
   markup such as `<button className="rounded-md bg-blue-500 …">`.
4. **Contrast** — `variant="destructive"` is reserved for deleting data (plus the timer stop
   button); everything else uses `outline`, `ghost` or `subtle`. Never several emphasised actions
   per card.
5. **Accessibility** — WCAG 2.2 AA: 4.5:1 for body text, 3:1 for large text and interactive
   boundaries; verify token changes with a contrast checker and record the numbers in
   `ui-audit.md`. Icon-only controls get an `aria-label`, decorative icons and colour dots get
   `aria-hidden`, collapsed navigation labels stay in the accessibility tree via
   `sr-only lg:not-sr-only`. State is readable without colour. Never hide a label with `hidden` or
   remove the focus ring.
6. **Proximity** — start, pause and stop form one control group (`currently-tracking-card.tsx`);
   delete sits behind the row `Menu` or a separate icon slot guarded by `ConfirmDialog`, never next
   to save.
7. **Alignment** — `space-y-5` for page sections, `gap-4`/`gap-5` for card grids, `Card` for
   grouping, `tabular-nums` for every number read in a column.

## Laws of UX

Adopted laws from [lawsofux.com](https://lawsofux.com) are binding; rejected ones must not be
reintroduced.

| Law | How it is applied |
| --- | --- |
| Jakob's Law | Sidebar navigation, start/stop at the top of the dashboard, reverse chronological entry list (`time-entry-list.tsx`). |
| Fitts's Law | The primary start/stop control uses the largest `Button` size; every control keeps a 40×40 px hit area (`size="sm"` and `size="inline"` extend their box with a transparent pseudo element). |
| Hick's Law | Options grouped into `Card` sections; ranges chosen from one `Select` instead of many toggles. |
| Miller's Law | At most four KPI cards per row, further metrics chunked into labelled cards. |
| Law of Proximity | See principle 6. |
| Law of Common Region | `Card`/`CardHeader`/`CardContent` instead of ad-hoc spacing. |
| Law of Similarity / Uniform Connectedness | A `Button` variant always means the same thing; row triggers always look like rows. |
| Aesthetic-Usability Effect | One spacing scale, one radius (`--radius`), one type scale. |
| Doherty Threshold | Timer and entry controls show a pending state immediately; mutations report through `toast`. |
| Peak-End Rule | Stopping and saving confirm with a toast naming the tracked duration. |
| Goal-Gradient Effect | `Progress` bars for the daily target, the weekly target and every budget. |
| Postel's Law | Time fields accept `9`, `0900`, `09:00` and `9.5h`; invalid input is reported inline, never silently corrected. |
| Von Restorff Effect | Only the active timer combines the `success` accent with a `success` card border. |
| Serial Position Effect | Dashboard and Time Entries open the sidebar, Settings closes it, rare views sit in the middle (`app-sidebar.tsx`). |
| Tesler's Law | Complexity lives in `contract/domain-rules.json` and the backend, not in user-facing options. |

Considered, needing judgement: the dashboard shows the running timer permanently but sends no
reminders or badges (Zeigarnik); charts stay plain (Prägnanz); chunking applies to settings and
reports, small forms stay flat; hints avoid banner styling so they are not skipped as advertising;
remove elements that do not earn their place, but never at the cost of discoverability (Occam).

Rejected: variable reward and optimising for time spent in the app, skipping documentation because
users will not read it, artificial delays, and persuasion through cognitive bias such as scarcity,
social proof or anchoring.
