# End-to-end test cases

Every Playwright test in [`e2e/app.spec.ts`](../e2e/app.spec.ts),
[`e2e/timer-rounding.spec.ts`](../e2e/timer-rounding.spec.ts) and the focused page/journey specs
(`calendar`, `week`, `projects`, `absences`, `overtime`, `reports-settings`, `licenses`,
`persistence`) covers one use case as a complete click path. The marker in the first column is
repeated as a comment above the matching test (`#<number>`, `E<number>`, `C<number>`, `W<number>`,
`P<number>`, `A<number>`, `O<number>`, `R<number>`, `S<number>`, `L<number>`, `X<number>`), so a
test and its specification can always be matched in both directions.

Run the suite with `npm run test:e2e`. Every test starts from the shared `test.beforeEach` setup,
which registers `first@example.com` and waits for the dashboard, so the tests are independent of
each other and of their execution order.

| #  | Test (`e2e/app.spec.ts`) | Given | When | Then |
|----|--------------------------|-------|------|------|
| 1  | `registers a new account and signs it in directly` | No user is signed in | The user registers with an e-mail address and a password | The user is signed in and the dashboard shows the e-mail address |
| 2  | `shows the login page when no user is signed in` | The user is signed in | The user signs out and enters a wrong password | "Email or password is incorrect" appears; the correct password signs the user in and the dashboard appears |
| 3  | `validates the password policy while typing and blocks weak passwords` | The registration form is open | The user types a password that is too short and tries to register | The policy checklist marks the unmet criteria and "does not meet the policy" appears; a strong password completes the registration |
| 4  | `discards the input when the registration is cancelled` | The registration form is open with an e-mail address entered | The user clicks "Cancel" | The login page is shown and the e-mail field is empty |
| 5  | `rejects an email that is already registered` | The e-mail address is already registered | The user registers again with the same address | "An account with this email already exists" appears |
| 6  | `keeps the data of every user separate` | User A has created a project | User B registers and the test switches back to user A | The project of user A is invisible for user B and still visible for user A |
| 7  | `shows the dashboard with empty states` | A new user without projects and time entries | The dashboard is opened | The empty states ("No time tracked today", "Create your first project to start tracking.") are shown |
| 8  | `tracks time with the timer and updates the metrics` | A project exists and is selected | The user starts and immediately stops the timer, then tracks an hour and stops again | "Timer discarded" appears for the session below half a minute and nothing is stored; the corrected hour is saved with "Timer stopped" and the button changes accordingly |
| 9  | `adds, edits and deletes a manual time entry` | A project exists | The user adds a manual entry, edits the end time and deletes it | The total duration is updated and the entry disappears after the deletion |
| 10 | `records every change of a time entry in the change history` | A time entry was created and edited | The user opens "Time Entries" → "Change History" | The history lists "Created" and "Edited" with the changed field and the user |
| 11 | `corrects the start of a running timer retroactively` | A timer is running | The user corrects the start time retroactively | "Start time updated" appears, the elapsed time changes and the history shows the change |
| 12 | `rejects overlapping entries and invalid times` | A time entry already exists | The user tries to add an overlapping or an invalid entry | "End time must be later than start time" and "This time overlaps with another time entry" appear |
| 13 | `navigates between days and views` | The dashboard is open | The user navigates to "Previous day", "Today", "Projects" and "Settings" | Each view is shown with its heading |
| 14 | `configures the weekly working time and the working days` | The settings page is open | The user changes the working days and hours and saves | Zero working days are rejected, saving succeeds, the values survive a reload and the dashboard shows the new target |
| 15 | `quick-adds time on the time management page` | A project exists | The user uses the quick buttons (15 min, 1 hour) and the custom dialog | The time is added, an invalid duration is rejected and the entry can be deleted |
| 16 | `manages a project budget and reports its consumption and forecast` | A project with a time entry exists | The user creates a budget, checks the validation, reviews the consumption in the report and deletes the budget | Zero hours and a past due date are rejected, the progress is correct and the budget is gone after the deletion |
| 17 | `does not show budgets on the dashboard` | A budget may exist | The dashboard is shown | "Project budget" is not shown on the dashboard |
| 18 | `records a break and warns about the working time limits` | Two time entries with a gap exist | The user checks "Working Time" and records the break afterwards | The warning about the minimum break disappears while the daily maximum warning remains |
| 19 | `restores the German working time limits in the settings` | The settings contain a changed daily maximum | The user clicks "Restore German defaults" | The value returns to 600 and the button is disabled afterwards |
| 20 | `keeps the overtime balance unchanged across a marked vacation range` | Working time and working days are configured and a project exists | The user tracks time and then marks a vacation across several days | The balance stays at "+0h 00m" and the hint about the neutralised target appears |
| 21 | `replaces an absence only after an explicit confirmation` | An absence (vacation) exists on a day | The user tries to record another absence (sick leave) on the same day | The conflict message appears, only "Replace existing absences" replaces it and it can be deleted afterwards |
| 22 | `adds an explicit overtime record on top of the tracked time` | Working time is configured and the tracked time matches the target, so the automatic overtime is zero | The user opens "Overtime" from the menu, is rejected with an invalid value and then saves an opening balance of 2h 30m | The balance is split into "+0h 00m" automatic and "+2h 30m" explicit, the record is listed as "Manual" and the dashboard shows "+2h 30m" |

## Rounding of a stopped timer

The tests in [`e2e/timer-rounding.spec.ts`](../e2e/timer-rounding.spec.ts) cover the rounding of a
tracked session to whole minutes. They never wait for real time: the clock is installed with
`page.clock.install`, frozen with `page.clock.pauseAt` once the application has loaded and then moved
with `page.clock.fastForward`, so every elapsed session is exact to the second and the suite stays
fast. Every test registers `first@example.com`, creates the project `Website Redesign` and starts the
timer on it.

| #  | Elapsed time | When | Then |
|----|--------------|------|------|
| E1 | 00:00:10 | The timer is stopped | "Timer discarded" appears, no entry is listed and the day total stays "0h 00m" |
| E2 | 00:00:29 | The timer is stopped | "Timer discarded" appears, no entry is listed and the day total stays "0h 00m" |
| E3 | 00:00:30 | The timer is stopped | "0h 01m added to Website Redesign" appears and the entry is stored with 00:01:00 |
| E4 | 00:00:59 | The timer is stopped | The entry is stored with 0h 01m |
| E5 | 00:01:10 | The timer is stopped | The entry is stored with 0h 01m |
| E6 | 00:01:30 | The timer is stopped | The entry is stored with 0h 02m |
| E7 | 00:01:59 | The timer is stopped | The entry is stored with 0h 02m |
| E8 | 00:59:45 | The timer is stopped | The entry is stored with 1h 00m |
| E9 | 02:30:30 | The timer is stopped | The entry is stored with 2h 31m |

| #   | Test (`e2e/timer-rounding.spec.ts`) | Given | When | Then |
|-----|-------------------------------------|-------|------|------|
| E10 | `E10: sums the segments of a paused session before rounding` | A timer runs for 40 seconds and is paused | The user resumes it, tracks another 40 seconds and stops it | Both segments are summed to 1m 20s before the rounding, so "0h 01m" is added once |
| E11 | `E11: rounds the session that is stopped after a project switch` | A timer runs for two minutes on the first project | The user switches to a second project, tracks 1m 30s and stops the timer | The switch closes the first segment with its two minutes and the stopped session of the second project is rounded to "0h 02m" |
| E12 | `E12: keeps a discarded session out of every total` | A timer ran for 29 seconds and was stopped | The user opens the dashboard, "Time Entries" and "Reports" | The session is nowhere: "No time tracked today", "No time entries yet." and "No time tracked this week." |
| E13 | `E13: shows the rounded duration in every view` | A session of 2h 30m 30s was stopped | The user opens "Time Entries", "Reports" and "Working Time" and exports the month | Every view shows the same rounded 2h 31m and both the downloaded CSV and PDF contain 02:31 |
| E14 | `E14: keeps the rounded duration after a reload` | A session of 1m 30s was stopped | The user reloads the application | The stored entry still shows 00:02:00, so the rounding is persisted and not only formatted |

## Calendar

| #  | Test (`e2e/calendar.spec.ts`) | Given | When | Then |
|----|-------------------------------|-------|------|------|
| C1 | `C1: calendar shows six-week grid, tracked/absence days and opens the filtered day list` | A project has tracked time and an absence on the same day | The user opens Calendar and clicks that day | The calendar shows 42 day cells with out-of-month cells de-emphasised, the day shows duration + absence label, and Time Entries opens filtered to that day |

## Week

| #  | Test (`e2e/week.spec.ts`) | Given | When | Then |
|----|---------------------------|-------|------|------|
| W1 | `W1: week navigation updates subtitle and week number` | Week view is open | The user goes to previous week and back to this week | The subtitle (date range + KW number) changes with navigation and restores on return |
| W2 | `W2: quick add updates day delta, week progress and month overview metrics` | A project exists in the current week | The user quick-adds 15 min, 1 hour and a custom duration on one day | Day delta, week totals/progress and month-to-date metrics all update consistently |

## Projects

| #  | Test (`e2e/projects.spec.ts`) | Given | When | Then |
|----|-------------------------------|-------|------|------|
| P1 | `P1: projects page supports CRUD with confirm flow and project total` | A project with tracked time exists | The user edits the project, cancels deletion once, then confirms deletion | Name/description/color update, total duration is shown, cancel keeps the project, confirm removes it |
| P2 | `P2: deleted project entries stay usable and project links open filtered entries` | A project has a time entry | The user opens Time Entries from the project link and later deletes the project | Time Entries opens pre-filtered to that project; after deletion the entry still exists and is shown as "Deleted project" |

## Absences

| #  | Test (`e2e/absences.spec.ts`) | Given | When | Then |
|----|-------------------------------|-------|------|------|
| A1 | `A1: absences page supports CRUD, summary updates and audit trail updates` | All weekdays are configured and absences are empty | The user creates a range, edits one day to half day, cancels one deletion, then confirms it | CRUD works from Absences page, summary updates including half-day neutralisation, and audit trail shows Created/Updated/Deleted |

## Overtime

| #  | Test (`e2e/overtime.spec.ts`) | Given | When | Then |
|----|-------------------------------|-------|------|------|
| O1 | `O1: overtime origin filter, audit trail and cross-page balance stay consistent` | Automatic overtime is neutral and an explicit overtime record is added | The user filters by origin, edits the record, checks dashboard/reports balance, then deletes it | Origin filter narrows records, audit trail shows create/update/delete, and cumulative balance matches across pages |

## Reports and Settings

| #  | Test (`e2e/reports-settings.spec.ts`) | Given | When | Then |
|----|---------------------------------------|-------|------|------|
| R1 | `R1: reports react to tracked time and budget project selection` | Two projects and budgets exist, one has tracked time | The user opens Reports, selects/switches budget projects and adds more tracked time | Week totals react to new time; budget consumption + forecast render and update by selected project |
| R2 | `R2: opening reports after using a project link keeps that project pre-selected` | A project has a budget | The user opens Time Entries from a project link and then opens Reports | The same project remains selected in the budget project selector on Reports |
| S1 | `S1: week start and compliance validations are enforced and settings survive reload` | Settings page is open | The user switches week start, triggers break-order + invalid-limit validation, then reloads | Week start is reflected in Week/Calendar/Reports, invalid settings are blocked with messages, and saved settings persist after reload |

## Licenses

| #  | Test (`e2e/licenses.spec.ts`) | Given | When | Then |
|----|-------------------------------|-------|------|------|
| L1 | `L1: licenses page is reachable and expands package notices with license text` | The user is signed in | The user opens Licenses from the account menu (while on Settings/footer area) and expands a package | The npm and Rust sections show counts, and expanded package details show license text |

## Cross-cutting journeys

| #  | Test (`e2e/persistence.spec.ts`) | Given | When | Then |
|----|----------------------------------|-------|------|------|
| X1 | `X1: project, entries, absence and settings persist across reload while staying signed in` | A user created project/time/absence/settings data | The user reloads | Data remains available and the user stays signed in |
| X2 | `X2: absences, overtime, budgets and settings stay isolated per user` | User A created absences/overtime/budgets/settings | User B signs in, then the test switches back to user A | User B cannot see user A data; user A still sees own data |
| X3 | `X3: pausing and resuming from the entry list continues the running timer` | A running timer exists | The user pauses and resumes from Time Entries list controls | The running timer continues and is visible again on Dashboard |
| X4 | `X4: monthly exports include tracked rows in CSV and PDF` | A monthly tracked entry exists | The user exports monthly record from Working Time | CSV and PDF exports contain the expected tracked duration row |
| X5 | `X5: empty-state pages stay stable and switch to first values after data creation` | Calendar/Week/Budgets/Absences/Overtime/Reports have no data | The user visits each page, then creates first values and revisits | Empty states render without crashes and each page shows first-value content afterwards |

## Conventions

- Helpers such as `createProject`, `addEntry`, `dialog`, `register`, `login`, `openAccountMenu`,
  `trackingCard`, `dateKey`, `gotoPage`, `expectHeading`, `markAbsence`, `createBudget`,
  `addOvertime` and `downloadText` live in [`e2e/helpers.ts`](../e2e/helpers.ts) and are reused by
  every spec instead of duplicating steps; new helpers follow the same naming and structure.
- Locators are role based and accessible (`getByRole`, `getByLabel`, `getByText`).
- Tests wait for observable state (`expect(...)`) instead of fixed timeouts. Elapsed time is
  simulated with `page.clock`, never by waiting for real seconds.
