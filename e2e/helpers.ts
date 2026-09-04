import { expect, type Page } from '@playwright/test'
import { SESSION_TIMEOUT_MINUTES } from '../src/features/auth/security-policy'

export function dialog(page: Page) {
  return page.getByRole('dialog')
}

export function trackingCard(page: Page) {
  return page.getByRole('region', { name: 'Currently Tracking' })
}

export function dateKey(inDays: number) {
  const date = new Date()
  date.setDate(date.getDate() + inDays)
  return date.toISOString().slice(0, 10)
}

export async function createProject(page: Page, name: string) {
  const createButton = trackingCard(page).getByRole('button', { name: 'Create project' })
  if (!(await createButton.isVisible())) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Dashboard' }).click()
    await expectHeading(page, 'Dashboard')
  }
  if (await createButton.isVisible()) {
    await createButton.click()
  } else {
    await trackingCard(page).getByRole('button', { name: 'Select a project' }).click()
    await page.getByRole('button', { name: 'Create project' }).click()
  }
  await dialog(page).getByLabel('Name').fill(name)
  await dialog(page).getByRole('button', { name: 'Create project' }).click()
  await expect(dialog(page)).toBeHidden()
}

export async function addEntry(page: Page, project: string, start: string, end: string) {
  await page.getByRole('button', { name: 'Add time entry' }).click()
  await dialog(page).getByLabel('Project').selectOption({ label: project })
  await dialog(page).getByLabel('Start time').fill(start)
  await dialog(page).getByLabel('End time').fill(end)
  await dialog(page).getByRole('button', { name: 'Add entry' }).click()
}

export async function gotoPage(page: Page, item: string, heading = item) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: item }).click()
  await expectHeading(page, heading)
}

export async function expectHeading(page: Page, heading: string | RegExp) {
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
}

export async function markAbsence(
  page: Page,
  {
    type,
    firstDay,
    lastDay = firstDay,
  }: { type: 'vacation' | 'sick' | 'unpaid' | 'halfDay'; firstDay: string; lastDay?: string },
) {
  await page.getByRole('button', { name: 'Mark absence' }).click()
  await dialog(page).getByLabel('Absence type').selectOption(type)
  await dialog(page).getByLabel('First day').fill(firstDay)
  await dialog(page).getByLabel('Last day').fill(lastDay)
  await dialog(page).getByRole('button', { name: 'Mark absence' }).click()
}

export async function createBudget(
  page: Page,
  { project, budgetHours, dueDate }: { project: string; budgetHours: string; dueDate: string },
) {
  await page.getByRole('button', { name: 'Create budget' }).click()
  await dialog(page).getByLabel('Project').selectOption({ label: project })
  await dialog(page).getByLabel('Budget (hours)').fill(budgetHours)
  await dialog(page).getByLabel('Due date').fill(dueDate)
  await dialog(page).getByRole('button', { name: 'Create budget' }).click()
}

export async function addOvertime(
  page: Page,
  {
    kind,
    overtime,
    effectiveDate,
    note,
  }: { kind: 'opening' | 'balance' | 'adjustment'; overtime: string; effectiveDate?: string; note?: string },
) {
  await page.getByRole('button', { name: 'Set overtime', exact: true }).click()
  await dialog(page).getByLabel('Overtime type').selectOption(kind)
  await dialog(page).getByLabel('Overtime', { exact: true }).fill(overtime)
  if (effectiveDate) await dialog(page).getByLabel('Effective date').fill(effectiveDate)
  if (note) await dialog(page).getByLabel('Note (optional)').fill(note)
  await dialog(page).getByRole('button', { name: 'Set overtime' }).click()
}

export async function downloadText(page: Page, button: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button }).click(),
  ])
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('latin1')
}

export const PASSWORD = 'Str0ng-Passphrase!!x'
const PASSWORD_HASH =
  'pbkdf2-sha256$210000$d29yay10aW1lLXRlc3QtMQ==$9WatE7lxQeDr47my/+676IM7dG0Neb4WKkD3V/MVUZw='

export async function startSignedInSession(page: Page, email = 'first@example.com') {
  await page.addInitScript(
    ({ accountEmail, passwordHash, sessionTimeoutMinutes }) => {
      const now = Date.now()
      const createdAt = new Date(now).toISOString()
      const user = { id: 1, email: accountEmail, createdAt, passwordHash }
      const token = 'test-session-1'
      localStorage.setItem('work-time-tracker.users', JSON.stringify([user]))
      localStorage.setItem(
        'work-time-tracker.1.security-audits',
        JSON.stringify([
          {
            id: 1,
            entity: 'user',
            entityId: 1,
            action: 'user.registered',
            actor: accountEmail,
            oldValue: null,
            newValue: JSON.stringify({ email: accountEmail }),
            recordedAt: createdAt,
          },
        ]),
      )
      localStorage.setItem(
        'work-time-tracker.sessions',
        JSON.stringify({
          [token]: { userId: 1, startedAt: now, expiresAt: now + sessionTimeoutMinutes * 60_000 },
        }),
      )
      sessionStorage.setItem('work-time-tracker.session', token)
    },
    { accountEmail: email, passwordHash: PASSWORD_HASH, sessionTimeoutMinutes: SESSION_TIMEOUT_MINUTES },
  )
  await page.goto('/')
  await expectHeading(page, 'Dashboard')
}

export async function register(page: Page, email: string, password = PASSWORD) {
  await page.getByRole('button', { name: 'Register' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Register' }).click()
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
}

export async function openAccountMenu(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click()
}

/**
 * Ages the stored session of the browser fallback: `idle` moves its expiry into
 * the past, `lifetime` backdates its start beyond any absolute maximum lifetime
 * while the expiry stays untouched, so a session that is in use also ends.
 */
export async function ageSession(page: Page, reason: 'idle' | 'lifetime') {
  await page.evaluate((kind) => {
    const key = 'work-time-tracker.sessions'
    const sessions = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<
      string,
      { startedAt: number; expiresAt: number }
    >
    const aYearAgo = Date.now() - 365 * 24 * 60 * 60_000
    for (const session of Object.values(sessions)) {
      if (kind === 'idle') session.expiresAt = Date.now() - 1
      else session.startedAt = aYearAgo
    }
    localStorage.setItem(key, JSON.stringify(sessions))
  }, reason)
}
