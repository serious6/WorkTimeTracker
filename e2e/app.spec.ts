import { expect, test, type Page } from '@playwright/test'
import {
  addEntry,
  ageSession,
  createProject,
  dateKey,
  dialog,
  login,
  openAccountMenu,
  PASSWORD,
  register,
  trackingCard,
} from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await register(page, 'first@example.com')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

// #1 in docs/e2e-test-cases.md
test('registers a new account and signs it in directly', async ({ page }) => {
  await expect(page.getByText('first@example.com')).toBeVisible()
})

// #2 in docs/e2e-test-cases.md
test('shows the login page when no user is signed in', async ({ page }) => {
  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Logout' }).click()

  await expect(page.getByRole('heading', { name: 'Sign in to TimeTrack' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Register' })).toBeVisible()

  await login(page, 'first@example.com', 'wrong-password')
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect')
  await expect(page.getByRole('heading', { name: 'Sign in to TimeTrack' })).toBeVisible()

  await login(page, 'first@example.com')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

// #3 in docs/e2e-test-cases.md
test('validates the password policy while typing and blocks weak passwords', async ({ page }) => {
  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Logout' }).click()
  await page.getByRole('button', { name: 'Register' }).click()

  const policy = page.getByRole('list', { name: 'Password policy' })
  await expect(policy.getByText('At least 20 characters')).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill('short')
  await expect(policy.getByRole('listitem').filter({ hasText: 'not met' })).toHaveCount(3)

  await page.getByLabel('Email').fill('second@example.com')
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page.getByRole('alert')).toContainText('does not meet the policy')

  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await expect(policy.getByRole('listitem').filter({ hasText: 'not met' })).toHaveCount(0)
  await page.getByLabel('I accept the Terms of Service').check()
  await page.getByLabel('I accept the Privacy Policy').check()
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

// #24 in docs/e2e-test-cases.md
test('blocks registration until both legal texts are accepted', async ({ page }) => {
  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Logout' }).click()
  await page.getByRole('button', { name: 'Register' }).click()
  await page.getByLabel('Email').fill('legal@example.com')
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)

  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page.getByRole('alert')).toContainText('You must accept the terms of service')

  await page.getByLabel('I accept the Terms of Service').check()
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page.getByRole('alert')).toContainText('You must accept the privacy policy')

  await page.getByLabel('I accept the Privacy Policy').check()
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

// #4 in docs/e2e-test-cases.md
test('discards the input when the registration is cancelled', async ({ page }) => {
  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Logout' }).click()
  await page.getByRole('button', { name: 'Register' }).click()
  await page.getByLabel('Email').fill('second@example.com')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect(page.getByRole('heading', { name: 'Sign in to TimeTrack' })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue('')
})

// #5 in docs/e2e-test-cases.md
test('rejects an email that is already registered', async ({ page }) => {
  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Switch User' }).click()
  await register(page, 'first@example.com')

  await expect(page.getByRole('alert')).toContainText('An account with this email already exists')
})

// #6 in docs/e2e-test-cases.md
test('keeps the data of every user separate', async ({ page }) => {
  await createProject(page, 'Website Redesign')

  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Switch User' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to TimeTrack' })).toBeVisible()
  await register(page, 'second@example.com')

  await expect(page.getByText('Create your first project to start tracking.')).toBeVisible()
  await page.getByRole('button', { name: 'Projects' }).click()
  await expect(page.getByText('Website Redesign')).toBeHidden()

  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Switch User' }).click()
  await login(page, 'first@example.com')
  await page.getByRole('button', { name: 'Projects' }).click()
  await expect(page.getByText('Website Redesign')).toBeVisible()
})

// #7 in docs/e2e-test-cases.md
test('shows the dashboard with empty states', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await expect(page.getByText('Data storage')).toBeVisible()
  await expect(page.getByText('Tracked Today', { exact: true })).toBeVisible()
  await expect(page.getByText('No time tracked today')).toBeVisible()
  await expect(page.getByText('Create your first project to start tracking.')).toBeVisible()
})

// #8 in docs/e2e-test-cases.md
test('tracks time with the timer and updates the metrics', async ({ page }) => {
  await createProject(page, 'Website Redesign')

  await page.getByRole('button', { name: 'Select a project' }).click()
  await page.getByRole('option', { name: 'Website Redesign' }).click()
  await trackingCard(page).getByRole('button', { name: 'Start timer' }).click()

  await expect(page.getByText('Timer started')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop timer' })).toBeVisible()
  await expect(page.getByLabel('Elapsed time')).toBeVisible()

  // Stopped right away the session rounds to zero minutes, so nothing is stored.
  await page.getByRole('button', { name: 'Stop timer' }).click()
  await expect(page.getByText('Timer discarded')).toBeVisible()
  await expect(trackingCard(page).getByRole('button', { name: 'Start timer' })).toBeVisible()
  await expect(page.getByText('No time tracked today')).toBeVisible()

  await trackingCard(page).getByRole('button', { name: 'Start timer' }).click()
  await expect(page.getByRole('button', { name: 'Stop timer' })).toBeVisible()

  // An hour earlier, date and time, so the correction holds across midnight.
  const earlier = await page.evaluate(() => {
    const target = new Date(Date.now() - 60 * 60_000)
    const pad = (value: number) => `${value}`.padStart(2, '0')
    return {
      date: `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`,
      time: `${pad(target.getHours())}:${pad(target.getMinutes())}`,
    }
  })
  await page.getByRole('button', { name: 'Correct start time' }).click()
  await dialog(page).getByLabel('Start date').fill(earlier.date)
  await dialog(page).getByLabel('Start time').fill(earlier.time)
  await dialog(page).getByRole('button', { name: 'Save start time' }).click()
  await expect(page.getByText('Start time updated')).toBeVisible()

  await page.getByRole('button', { name: 'Stop timer' }).click()
  await expect(page.getByText('Timer stopped')).toBeVisible()
  await expect(trackingCard(page).getByRole('button', { name: 'Start timer' })).toBeVisible()
})

// #9 in docs/e2e-test-cases.md
test('adds, edits and deletes a manual time entry', async ({ page }) => {
  await createProject(page, 'Mobile App')

  await page.getByRole('button', { name: 'Add time entry' }).click()
  await dialog(page).getByLabel('Project').selectOption({ label: 'Mobile App' })
  await dialog(page).getByLabel('Start time').fill('09:00')
  await dialog(page).getByLabel('End time').fill('11:30')
  await expect(dialog(page).getByLabel('Duration')).toHaveValue('2h 30m')
  await dialog(page).getByRole('button', { name: 'Add entry' }).click()

  await expect(page.getByText('Total: 2h 30m')).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Mobile App' }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await dialog(page).getByLabel('End time').fill('12:00')
  await dialog(page).getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByText('Entry updated')).toBeVisible()
  await expect(page.getByText('Total: 3h 00m')).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Mobile App' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await dialog(page).getByRole('button', { name: 'Delete entry' }).click()
  await expect(page.getByText('Entry deleted', { exact: true })).toBeVisible()
  await expect(page.getByText('No time tracked today')).toBeVisible()
})

// #10 in docs/e2e-test-cases.md
test('records every change of a time entry in the change history', async ({ page }) => {
  await createProject(page, 'Mobile App')
  await addEntry(page, 'Mobile App', '09:00', '11:30')
  await expect(dialog(page)).toBeHidden()

  await page.getByRole('button', { name: 'Actions for Mobile App' }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await dialog(page).getByLabel('End time').fill('12:00')
  await dialog(page).getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByText('Entry updated')).toBeVisible()

  await page.getByRole('button', { name: 'Time Entries' }).click()
  const history = page.getByRole('region', { name: 'Change History' })
  await expect(history.getByText('Edited', { exact: true })).toBeVisible()
  await expect(history.getByText('Created', { exact: true })).toBeVisible()
  await expect(history.getByText(/^End: /)).toBeVisible()
  await expect(history.getByText('first@example.com').first()).toBeVisible()
})

// #11 in docs/e2e-test-cases.md
test('corrects the start of a running timer retroactively', async ({ page }) => {
  await createProject(page, 'Mobile App')

  await page.getByRole('button', { name: 'Select a project' }).click()
  await page.getByRole('option', { name: 'Mobile App' }).click()
  await trackingCard(page).getByRole('button', { name: 'Start timer' }).click()
  await expect(page.getByText('Timer started')).toBeVisible()
  const elapsed = page.getByLabel('Elapsed time')
  await expect(elapsed).toBeVisible()

  // An hour earlier, clamped to midnight so the correction never lands in the future.
  const earlier = await page.evaluate(() => {
    const now = new Date()
    const target = now.getHours() > 0 ? new Date(now.getTime() - 60 * 60_000) : now
    return `${`${target.getHours()}`.padStart(2, '0')}:00`
  })

  await page.getByRole('button', { name: 'Correct start time' }).click()
  await dialog(page).getByLabel('Start time').fill(earlier)
  await dialog(page).getByRole('button', { name: 'Save start time' }).click()
  await expect(page.getByText('Start time updated')).toBeVisible()
  await expect(elapsed).not.toHaveText('00:00:00')

  await page.getByRole('button', { name: 'Time Entries' }).click()
  const history = page.getByRole('region', { name: 'Change History' })
  await expect(history.getByText('Edited', { exact: true })).toBeVisible()
  await expect(history.getByText(/^Start: /)).toBeVisible()
})

// #12 in docs/e2e-test-cases.md
test('rejects overlapping entries and invalid times', async ({ page }) => {
  await createProject(page, 'Research')

  await addEntry(page, 'Research', '09:00', '10:00')
  await expect(dialog(page)).toBeHidden()

  await addEntry(page, 'Research', '11:00', '10:30')
  await expect(page.getByText('End time must be later than start time')).toBeVisible()

  await dialog(page).getByLabel('Start time').fill('09:30')
  await dialog(page).getByLabel('End time').fill('10:30')
  await dialog(page).getByRole('button', { name: 'Add entry' }).click()
  await expect(page.getByText('This time overlaps with another time entry')).toBeVisible()
})

// #13 in docs/e2e-test-cases.md
test('navigates between days and views', async ({ page }) => {
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByText('No time tracked today')).toBeVisible()
  await page.getByRole('button', { name: 'Today' }).click()

  await page.getByRole('button', { name: 'Projects' }).click()
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Work schedule' })).toBeVisible()
  await expect(page.getByRole('contentinfo')).toContainText('Build with ❤️ in Hamburg')
})

// #14 in docs/e2e-test-cases.md
test('configures the weekly working time and the working days', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  const weeklyHours = page.getByLabel('Weekly working time (hours)')
  await expect(weeklyHours).toHaveValue('40')
  await expect(page.getByText('Daily target: 8h 00m per working day')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Monday' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Saturday' })).not.toBeChecked()

  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
    await page.getByRole('checkbox', { name: day }).uncheck()
  }
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Select at least one working day')).toBeVisible()

  await page.getByRole('checkbox', { name: 'Monday' }).check()
  await page.getByRole('checkbox', { name: 'Saturday' }).check()
  await weeklyHours.fill('20')
  await expect(page.getByText('Daily target: 10h 00m per working day')).toBeVisible()
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByLabel('Weekly working time (hours)')).toHaveValue('20')
  await expect(page.getByRole('checkbox', { name: 'Saturday' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Friday' })).not.toBeChecked()

  await page.getByRole('button', { name: 'Dashboard' }).click()
  await expect(page.getByText('of 20h 00m')).toBeVisible()
})

// #15 in docs/e2e-test-cases.md
test('quick-adds time on the time management page', async ({ page }) => {
  await createProject(page, 'Support')

  await page.getByRole('button', { name: 'Time Management' }).click()
  await expect(page.getByRole('heading', { name: 'Time Management' })).toBeVisible()
  await expect(page.getByRole('button', { name: '15 min' })).toBeDisabled()

  await page.getByLabel('Project').selectOption({ label: 'Support' })
  const dateInput = page.getByLabel('Date')
  await dateInput.fill('')
  await page.getByRole('button', { name: '15 min' }).click()
  await expect(page.getByText('0h 15m added to Support')).toBeVisible()
  await expect(dateInput).not.toHaveValue('')
  await page.getByRole('button', { name: '1 hour' }).click()
  await expect(page.getByText('1h 00m added to Support')).toBeVisible()
  await expect(page.getByText('Total: 1h 15m')).toBeVisible()

  await page.getByRole('button', { name: 'Custom' }).click()
  await dialog(page).getByLabel('Duration').fill('nonsense')
  await dialog(page).getByRole('button', { name: 'Add time' }).click()
  await expect(dialog(page).getByText('Enter a duration such as 2h 45m, 90m or 1.5h')).toBeVisible()

  await dialog(page).getByLabel('Duration').fill('2h 45m')
  await dialog(page).getByLabel('Date').fill('2020-01-02')
  await dialog(page).getByLabel('Note').fill('Offline work')
  await dialog(page).getByRole('button', { name: 'Add time' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(page.getByText('2h 45m added to Support')).toBeVisible()
  await expect(dateInput).toHaveValue('2020-01-02')
  await expect(page.getByText('Total: 2h 45m')).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Support' }).first().click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await dialog(page).getByRole('button', { name: 'Delete entry' }).click()
  await expect(page.getByText('Total: 0h 00m')).toBeVisible()

  await page.getByRole('button', { name: 'Dashboard' }).click()
  await expect(page.getByText('1h 15m').first()).toBeVisible()
})

// #16 in docs/e2e-test-cases.md
test('manages a project budget and reports its consumption and forecast', async ({ page }) => {
  await createProject(page, 'Budgeted Project')
  await addEntry(page, 'Budgeted Project', '09:00', '11:00')

  await page.getByRole('button', { name: 'Budgets' }).click()
  await expect(page.getByRole('heading', { name: 'Budgets', exact: true })).toBeVisible()
  await expect(page.getByText('No budgets yet.')).toBeVisible()

  await page.getByRole('button', { name: 'Create budget' }).click()
  await dialog(page).getByLabel('Project').selectOption({ label: 'Budgeted Project' })
  await dialog(page).getByLabel('Budget (hours)').fill('0')
  await dialog(page).getByLabel('Due date').fill(dateKey(30))
  await dialog(page).getByRole('button', { name: 'Create budget' }).click()
  await expect(page.getByText('Budget must be greater than zero hours')).toBeVisible()

  await dialog(page).getByLabel('Budget (hours)').fill('10')
  await dialog(page).getByLabel('Due date').fill('2020-01-01')
  await dialog(page).getByRole('button', { name: 'Create budget' }).click()
  await expect(page.getByText('Due date must be today or later')).toBeVisible()

  await dialog(page).getByLabel('Due date').fill(dateKey(30))
  await dialog(page).getByRole('button', { name: 'Create budget' }).click()
  await expect(dialog(page)).toBeHidden()

  await page.getByRole('button', { name: 'Reports' }).click()
  await expect(page.getByText('Select a project to see its budget.')).toBeVisible()
  await page.getByLabel('Budget project').selectOption({ label: 'Budgeted Project' })
  await expect(page.getByRole('progressbar', { name: 'Budget consumption' })).toBeVisible()
  await expect(page.getByText('2h 00m', { exact: true })).toBeVisible()
  await expect(page.getByText('20%', { exact: true })).toBeVisible()
  await expect(page.getByText('Forecast')).toBeVisible()

  await page.getByRole('button', { name: 'Budgets' }).click()
  await page.getByRole('button', { name: 'Delete budget for Budgeted Project' }).click()
  await dialog(page).getByRole('button', { name: 'Delete budget' }).click()
  await expect(page.getByText('Budget deleted')).toBeVisible()

  await page.getByRole('button', { name: 'Reports' }).click()
  await page.getByLabel('Budget project').selectOption({ label: 'Budgeted Project' })
  await expect(page.getByText('No budget is defined for this project.')).toBeVisible()
})

// #17 in docs/e2e-test-cases.md
test('does not show budgets on the dashboard', async ({ page }) => {
  await expect(page.getByText('Project budget')).toBeHidden()
})

// #18 in docs/e2e-test-cases.md
test('records a break and warns about the working time limits', async ({ page }) => {
  await createProject(page, 'Compliance')
  await addEntry(page, 'Compliance', '07:00', '12:00')
  await expect(dialog(page)).toBeHidden()
  await addEntry(page, 'Compliance', '12:45', '18:00')
  await expect(dialog(page)).toBeHidden()

  await page.getByRole('button', { name: 'Working Time' }).click()
  await expect(page.getByText(/at least 0h 45m are required/)).toBeVisible()
  await expect(page.getByText(/the daily maximum is 10h 00m/)).toBeVisible()

  await page.getByRole('button', { name: 'Dashboard' }).click()
  await page.getByRole('button', { name: 'Add time entry' }).click()
  await dialog(page).getByLabel('Entry type').selectOption('break')
  await expect(dialog(page).getByLabel('Project')).toBeDisabled()
  await dialog(page).getByLabel('Start time').fill('12:00')
  await dialog(page).getByLabel('End time').fill('12:45')
  await dialog(page).getByRole('button', { name: 'Add entry' }).click()
  await expect(dialog(page)).toBeHidden()

  await page.getByRole('button', { name: 'Working Time' }).click()
  await expect(page.getByText(/at least 0h 45m are required/)).toBeHidden()
  await expect(page.getByText(/the daily maximum is 10h 00m/)).toBeVisible()
})

// #19 in docs/e2e-test-cases.md
test('restores the German working time limits in the settings', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  const dailyMaximum = page.getByLabel('Maximum daily working time')
  await dailyMaximum.fill('480')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Work schedule updated')).toBeVisible()

  await page.getByRole('button', { name: 'Restore German defaults' }).click()
  await expect(dailyMaximum).toHaveValue('600')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('button', { name: 'Restore German defaults' })).toBeDisabled()
})

function cumulativeBalance(page: Page) {
  return page.getByRole('button').filter({ hasText: 'Carried into this day' }).locator('p').first()
}

async function selectDate(page: Page, inDays: number) {
  await page.getByLabel('Selected date').fill(dateKey(inDays))
}

// #20 in docs/e2e-test-cases.md
test('keeps the overtime balance unchanged across a marked vacation range', async ({ page }) => {
  // Every weekday counts, so the assertions do not depend on today's weekday.
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Weekly working time (hours)').fill('42')
  for (const day of ['Saturday', 'Sunday']) {
    await page.getByLabel(day, { exact: true }).check()
  }
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Work schedule updated')).toBeVisible()

  await page.getByRole('button', { name: 'Dashboard' }).click()
  await createProject(page, 'Vacation Check')
  await selectDate(page, -6)
  await addEntry(page, 'Vacation Check', '08:00', '14:00')
  await expect(dialog(page)).toBeHidden()
  await expect(cumulativeBalance(page)).toHaveText('+0h 00m')

  // The six untracked days since then are pure undertime.
  await page.getByRole('button', { name: 'Today' }).click()
  await expect(cumulativeBalance(page)).toHaveText('-36h 00m')

  await page.getByRole('button', { name: 'Absences' }).click()
  await page.getByRole('button', { name: 'Mark absence' }).click()
  await dialog(page).getByLabel('Absence type').selectOption('vacation')
  await dialog(page).getByLabel('First day').fill(dateKey(-5))
  await dialog(page).getByLabel('Last day').fill(dateKey(0))
  await dialog(page).getByRole('button', { name: 'Mark absence' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(page.getByText('6 days recorded, 36h 00m of target neutralised.')).toBeVisible()

  await page.getByRole('button', { name: 'Dashboard' }).click()
  await expect(cumulativeBalance(page)).toHaveText('+0h 00m')
  await expect(page.getByText('on this day, so it carries no working time target.')).toBeVisible()
})

// #21 in docs/e2e-test-cases.md
test('replaces an absence only after an explicit confirmation', async ({ page }) => {
  await page.getByRole('button', { name: 'Absences' }).click()
  await page.getByRole('button', { name: 'Mark absence' }).click()
  await dialog(page).getByLabel('Absence type').selectOption('vacation')
  await dialog(page).getByLabel('First day').fill(dateKey(1))
  await dialog(page).getByLabel('Last day').fill(dateKey(1))
  await dialog(page).getByRole('button', { name: 'Mark absence' }).click()
  await expect(dialog(page)).toBeHidden()

  await page.getByRole('button', { name: 'Mark absence' }).click()
  await dialog(page).getByLabel('Absence type').selectOption('sick')
  await dialog(page).getByLabel('First day').fill(dateKey(1))
  await dialog(page).getByLabel('Last day').fill(dateKey(1))
  await dialog(page).getByRole('button', { name: 'Mark absence' }).click()
  await expect(dialog(page).getByText('1 day already carries an absence')).toBeVisible()

  await dialog(page).getByRole('button', { name: 'Replace existing absences' }).click()
  await dialog(page).getByRole('button', { name: 'Mark absence' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(page.getByText('1 day recorded', { exact: false })).toBeVisible()
  await expect(page.getByText('Sick leave', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: `Delete absence on ${dateKey(1)}` }).click()
  await dialog(page).getByRole('button', { name: 'Delete absence' }).click()
  await expect(page.getByText('Absence deleted')).toBeVisible()
  await expect(page.getByText('No absences yet.', { exact: false })).toBeVisible()
})

// #22 in docs/e2e-test-cases.md
test('adds an explicit overtime record on top of the tracked time', async ({ page }) => {
  // Every weekday counts, so the assertions do not depend on today's weekday.
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Weekly working time (hours)').fill('42')
  for (const day of ['Saturday', 'Sunday']) {
    await page.getByLabel(day, { exact: true }).check()
  }
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Work schedule updated')).toBeVisible()

  await page.getByRole('button', { name: 'Dashboard' }).click()
  await createProject(page, 'Balance Check')
  await addEntry(page, 'Balance Check', '08:00', '14:00')
  await expect(dialog(page)).toBeHidden()
  await expect(cumulativeBalance(page)).toHaveText('+0h 00m')

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Overtime' }).click()
  await expect(page.getByRole('heading', { name: 'Overtime', exact: true })).toBeVisible()
  await expect(page.getByTestId('overtime-balance')).toHaveText('+0h 00m')

  await page.getByRole('button', { name: 'Set overtime', exact: true }).click()
  await dialog(page).getByLabel('Overtime type').selectOption('opening')
  await dialog(page).getByLabel('Overtime', { exact: true }).fill('nonsense')
  await dialog(page).getByRole('button', { name: 'Set overtime' }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('Enter a duration')

  await dialog(page).getByLabel('Overtime', { exact: true }).fill('2h 30m')
  await dialog(page).getByRole('button', { name: 'Set overtime' }).click()
  await expect(dialog(page)).toBeHidden()

  await expect(page.getByTestId('overtime-explicit')).toHaveText('+2h 30m')
  await expect(page.getByTestId('overtime-automatic')).toHaveText('+0h 00m')
  await expect(page.getByTestId('overtime-balance')).toHaveText('+2h 30m')
  await expect(page.getByTestId('overtime-records').getByText('Manual')).toBeVisible()

  await page.getByRole('button', { name: 'Dashboard' }).click()
  await expect(cumulativeBalance(page)).toHaveText('+2h 30m')
})

// #23 in docs/e2e-test-cases.md
test('returns to the login page when the session expires', async ({ page }) => {
  await createProject(page, 'Session Project')

  await ageSession(page, 'idle')
  // Audit Trails reads records the dashboard never loads, so the expired
  // session is noticed on the request instead of served from the cache.
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Audit Trails' })
    .click()
  await expect(page.getByRole('heading', { name: 'Sign in to TimeTrack' })).toBeVisible()

  // Signing in again continues on the view the expiry interrupted.
  await login(page, 'first@example.com')
  await expect(page.getByRole('heading', { name: 'Audit Trails', level: 1 })).toBeVisible()

  // The session was used a moment ago, so only its absolute lifetime ends it.
  // The dialog carries unsaved input, which the rejected submit does not store.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Projects' }).click()
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Create project' }).click()
  await dialog(page).getByLabel('Name').fill('Unsaved Project')
  await ageSession(page, 'lifetime')
  await dialog(page).getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to TimeTrack' })).toBeVisible()

  await login(page, 'first@example.com')
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Session Project', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Unsaved Project', exact: true })).toBeHidden()
})
