import { Suspense, lazy, useState } from 'react'
import { useNavigationStore } from '@/app/navigation'
import { AppFooter } from '@/components/layout/app-footer'
import { AppHeader } from '@/components/layout/app-header'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toast'
import { useSession } from '@/features/auth/session-queries'

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

function App() {
  const view = useNavigationStore((state) => state.view)
  const { data: user, isPending } = useSession()
  const [registering, setRegistering] = useState(false)
  const [registrationLegalView, setRegistrationLegalView] = useState<'privacy' | 'terms' | null>(null)
  const Page = pages[view]

  if (isPending) return null

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
              <Suspense fallback={null}>
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
        <Suspense fallback={null}>
          {registering ? (
            <UserCreationPage
              onCancel={() => {
                setRegistrationLegalView(null)
                setRegistering(false)
              }}
              onShowPrivacy={() => setRegistrationLegalView('privacy')}
              onShowTerms={() => setRegistrationLegalView('terms')}
              onSuccess={() => {
                setRegistrationLegalView(null)
                setRegistering(false)
              }}
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
            <Suspense fallback={null}>
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
