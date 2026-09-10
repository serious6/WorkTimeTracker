import { Suspense, lazy, useState } from 'react'
import { useNavigationStore } from '@/app/navigation'
import { AppFooter } from '@/components/layout/app-footer'
import { AppHeader } from '@/components/layout/app-header'
import { AppLoading } from '@/components/layout/app-loading'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { StartupError } from '@/components/layout/startup-error'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toast'
import { useSession } from '@/features/auth/session-queries'
import { useRetryStartup, useStartupStatus } from '@/features/startup/startup-queries'
import { errorMessage } from '@/lib/errors'

const LoginPage = lazy(() =>
  import('@/features/auth/login-page').then((module) => ({ default: module.LoginPage })),
)
const UserCreationPage = lazy(() =>
  import('@/features/auth/user-creation-page').then((module) => ({
    default: module.UserCreationPage,
  })),
)

const pages = {
  dashboard: lazy(() =>
    import('@/features/dashboard/dashboard-page').then((module) => ({
      default: module.DashboardPage,
    })),
  ),
  week: lazy(() => import('@/pages/week-page').then((module) => ({ default: module.WeekPage }))),
  projects: lazy(() =>
    import('@/pages/projects-page').then((module) => ({ default: module.ProjectsPage })),
  ),
  'time-entries': lazy(() =>
    import('@/pages/time-entries-page').then((module) => ({ default: module.TimeEntriesPage })),
  ),
  'time-management': lazy(() =>
    import('@/pages/time-management-page').then((module) => ({
      default: module.TimeManagementPage,
    })),
  ),
  budgets: lazy(() =>
    import('@/pages/budgets-page').then((module) => ({ default: module.BudgetsPage })),
  ),
  reports: lazy(() =>
    import('@/pages/reports-page').then((module) => ({ default: module.ReportsPage })),
  ),
  'working-time': lazy(() =>
    import('@/pages/working-time-page').then((module) => ({ default: module.WorkingTimePage })),
  ),
  'note-templates': lazy(() =>
    import('@/pages/note-templates-page').then((module) => ({
      default: module.NoteTemplatesPage,
    })),
  ),
  absences: lazy(() =>
    import('@/pages/absences-page').then((module) => ({ default: module.AbsencesPage })),
  ),
  overtime: lazy(() =>
    import('@/pages/overtime-page').then((module) => ({ default: module.OvertimePage })),
  ),
  calendar: lazy(() =>
    import('@/pages/calendar-page').then((module) => ({ default: module.CalendarPage })),
  ),
  'audit-trails': lazy(() =>
    import('@/pages/audit-trails-page').then((module) => ({ default: module.AuditTrailsPage })),
  ),
  settings: lazy(() =>
    import('@/pages/settings-page').then((module) => ({ default: module.SettingsPage })),
  ),
  licenses: lazy(() =>
    import('@/pages/licenses-page').then((module) => ({ default: module.LicensesPage })),
  ),
  terms: lazy(() => import('@/pages/terms-page').then((module) => ({ default: module.TermsPage }))),
  privacy: lazy(() =>
    import('@/pages/privacy-page').then((module) => ({ default: module.PrivacyPage })),
  ),
}

const STARTUP_FAILED_TITLE = 'WorkTimeTracker could not start'
const STARTUP_FALLBACK_MESSAGE =
  'The application could not be started. See the log file for details.'
const NOT_READY_TITLE = 'WorkTimeTracker is not ready'
const NOT_READY_MESSAGE = 'The application could not read its data. Its database may be unavailable.'

function App() {
  const view = useNavigationStore((state) => state.view)
  const startup = useStartupStatus()
  const retryStartup = useRetryStartup()
  const { data: user, isPending, error: sessionError, refetch: refetchSession } = useSession()
  const [registering, setRegistering] = useState(false)
  const [registrationLegalView, setRegistrationLegalView] = useState<'privacy' | 'terms' | null>(null)
  const Page = pages[view]

  function closeRegistration() {
    setRegistrationLegalView(null)
    setRegistering(false)
  }

  if (startup.isPending) return <AppLoading />

  // A failed start is shown as the content of the window, so a missing database
  // is neither a blank window nor a dialog the user has to dismiss first.
  const startupFailure = startup.error
    ? errorMessage(startup.error, STARTUP_FALLBACK_MESSAGE)
    : startup.data?.status === 'failed'
      ? startup.data.message
      : null

  if (startupFailure) {
    return (
      <StartupError
        actionLabel={retryStartup.isPending ? 'Retrying…' : 'Retry'}
        busy={retryStartup.isPending}
        message={startupFailure}
        onAction={() => retryStartup.mutate()}
        title={STARTUP_FAILED_TITLE}
      />
    )
  }

  if (isPending) return <AppLoading />

  // The backend started, but reading the session failed anyway; without this the
  // user would silently land on the login page and fail there again.
  if (sessionError) {
    return (
      <StartupError
        actionLabel="Try again"
        message={errorMessage(sessionError, NOT_READY_MESSAGE)}
        onAction={() => void refetchSession()}
        title={NOT_READY_TITLE}
      />
    )
  }

  if (!user) {
    if (registrationLegalView) {
      const LegalPage = pages[registrationLegalView]
      return (
        <>
          <main className="min-h-screen bg-background p-5 text-foreground lg:p-6">
            <div className="mx-auto max-w-4xl space-y-4">
              <Button onClick={() => setRegistrationLegalView(null)} variant="outline">
                Back to registration
              </Button>
              <Suspense fallback={<AppLoading message="Loading…" />}>
                <LegalPage />
              </Suspense>
            </div>
          </main>
          <Toaster />
        </>
      )
    }

    return (
      <>
        <Suspense fallback={<AppLoading message="Loading…" />}>
          {registering ? (
            <UserCreationPage
              onCancel={closeRegistration}
              onShowPrivacy={() => setRegistrationLegalView('privacy')}
              onShowTerms={() => setRegistrationLegalView('terms')}
              onSuccess={closeRegistration}
            />
          ) : (
            <LoginPage onRegister={() => setRegistering(true)} />
          )}
        </Suspense>
        <Toaster />
      </>
    )
  }

  return (
    <>
      <a
        className="fixed left-4 top-4 z-50 inline-flex h-10 -translate-y-[calc(100%+1rem)] items-center rounded-md bg-primary-strong px-4 text-sm font-medium text-primary-foreground focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        href="#main-content"
        onClick={() => document.getElementById('main-content')?.focus()}
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen bg-background text-foreground">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader user={user} />
          <main className="min-w-0 flex-1 p-5 lg:p-6" id="main-content" tabIndex={-1}>
            <Suspense fallback={<AppLoading message="Loading…" />}>
              <Page />
            </Suspense>
          </main>
          <AppFooter />
        </div>
        <Toaster />
      </div>
    </>
  )
}

export default App
