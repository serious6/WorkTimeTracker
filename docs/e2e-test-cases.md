# End-to-end test cases

Every Playwright test in [`e2e/app.spec.ts`](../e2e/app.spec.ts) covers one use case as a complete
click path. The table below describes each case in Given/When/Then form. The number in the first
column is repeated as a `#<number>` marker in the comment above the matching test, so a test and its
specification can always be matched in both directions.

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

## Conventions

- Helpers such as `createProject`, `addEntry`, `dialog`, `register`, `login`, `openAccountMenu`,
  `selectDate` and `dateKey` are reused instead of duplicating steps; new helpers follow the same
  naming and structure.
- Locators are role based and accessible (`getByRole`, `getByLabel`, `getByText`).
- Tests wait for observable state (`expect(...)`) instead of fixed timeouts.
