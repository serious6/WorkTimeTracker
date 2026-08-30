import { Suspense, lazy, useState } from 'react'
import { useNavigationStore } from '@/app/navigation'
import { AppFooter } from '@/components/layout/app-footer'
import { AppHeader } from '@/components/layout/app-header'
import { AppSidebar } from '@/components/layout/app-sidebar'
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
  calendar: lazy(() =>
    import('@/pages/calendar-page').then((module) => ({ default: module.CalendarPage })),
  ),
  settings: lazy(() =>
    import('@/pages/settings-page').then((module) => ({ default: module.SettingsPage })),
  ),
  licenses: lazy(() =>
    import('@/pages/licenses-page').then((module) => ({ default: module.LicensesPage })),
  ),
}

function App() {
  const view = useNavigationStore((state) => state.view)
  const { data: user, isPending } = useSession()
  const [registering, setRegistering] = useState(false)
  const Page = pages[view]

  if (isPending) return null

  if (!user) {
    return (
      <>
        <Suspense fallback={null}>
          {registering ? (
            <UserCreationPage
              onCancel={() => setRegistering(false)}
              onSuccess={() => setRegistering(false)}
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
        className="sr-only fixed left-4 top-4 z-50 inline-flex h-10 items-center rounded-md bg-primary-strong px-4 text-sm font-medium text-primary-foreground focus:not-sr-only focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
