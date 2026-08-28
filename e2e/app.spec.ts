import { expect, test, type Page } from '@playwright/test'

function dialog(page: Page) {
  return page.getByRole('dialog')
}

function trackingCard(page: Page) {
  return page.getByRole('region', { name: 'Currently Tracking' })
}

function dateKey(inDays: number) {
  const date = new Date()
  date.setDate(date.getDate() + inDays)
  return date.toISOString().slice(0, 10)
}

async function createProject(page: Page, name: string) {
  await trackingCard(page).getByRole('button', { name: 'Create project' }).click()
  await dialog(page).getByLabel('Name').fill(name)
  await dialog(page).getByRole('button', { name: 'Create project' }).click()
  await expect(dialog(page)).toBeHidden()
}

async function addEntry(page: Page, project: string, start: string, end: string) {
  await page.getByRole('button', { name: 'Add time entry' }).click()
  await dialog(page).getByLabel('Project').selectOption({ label: project })
  await dialog(page).getByLabel('Start time').fill(start)
  await dialog(page).getByLabel('End time').fill(end)
  await dialog(page).getByRole('button', { name: 'Add entry' }).click()
}

const PASSWORD = 'Str0ng-Passphrase!!x'

async function register(page: Page, email: string, password = PASSWORD) {
  await page.getByRole('button', { name: 'Register' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Register' }).click()
}

async function login(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
}

async function openAccountMenu(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await register(page, 'first@example.com')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test('registers a new account and signs it in directly', async ({ page }) => {
  await expect(page.getByText('first@example.com')).toBeVisible()
})

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
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test('discards the input when the registration is cancelled', async ({ page }) => {
  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Logout' }).click()
  await page.getByRole('button', { name: 'Register' }).click()
  await page.getByLabel('Email').fill('second@example.com')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect(page.getByRole('heading', { name: 'Sign in to TimeTrack' })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue('')
})

test('rejects an email that is already registered', async ({ page }) => {
  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Switch User' }).click()
  await register(page, 'first@example.com')

  await expect(page.getByRole('alert')).toContainText('An account with this email already exists')
})

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

test('shows the dashboard with empty states', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await expect(page.getByText('Local data')).toBeVisible()
  await expect(page.getByText('Tracked Today', { exact: true })).toBeVisible()
  await expect(page.getByText('No time tracked today')).toBeVisible()
  await expect(page.getByText('Create your first project to start tracking.')).toBeVisible()
})

test('tracks time with the timer and updates the metrics', async ({ page }) => {
  await createProject(page, 'Website Redesign')

  await page.getByRole('button', { name: 'Select a project' }).click()
  await page.getByRole('option', { name: 'Website Redesign' }).click()
  await trackingCard(page).getByRole('button', { name: 'Start timer' }).click()

  await expect(page.getByText('Timer started')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop timer' })).toBeVisible()
  await expect(page.getByLabel('Elapsed time')).toBeVisible()

  await page.getByRole('button', { name: 'Stop timer' }).click()
  await expect(page.getByText('Timer stopped')).toBeVisible()
  await expect(trackingCard(page).getByRole('button', { name: 'Start timer' })).toBeVisible()
})

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

test('does not show budgets on the dashboard', async ({ page }) => {
  await expect(page.getByText('Project budget')).toBeHidden()
})
