import { useEffect, useState } from 'react'
import { useNavigationStore } from '@/app/navigation'
import { AppFooter } from '@/components/layout/app-footer'
import { AppHeader } from '@/components/layout/app-header'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Toaster } from '@/components/ui/toast'
import { LoginPage } from '@/features/auth/login-page'
import { useSession } from '@/features/auth/session-queries'
import { UserCreationPage } from '@/features/auth/user-creation-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { BudgetsPage } from '@/pages/budgets-page'
import { CalendarPage } from '@/pages/calendar-page'
import { ProjectsPage } from '@/pages/projects-page'
import { ReportsPage } from '@/pages/reports-page'
import { SettingsPage } from '@/pages/settings-page'
import { TimeEntriesPage } from '@/pages/time-entries-page'
import { TimeManagementPage } from '@/pages/time-management-page'

const pages = {
  dashboard: DashboardPage,
  projects: ProjectsPage,
  'time-entries': TimeEntriesPage,
  'time-management': TimeManagementPage,
  budgets: BudgetsPage,
  reports: ReportsPage,
  calendar: CalendarPage,
  settings: SettingsPage,
}

function App() {
  const view = useNavigationStore((state) => state.view)
  const { data: user, isPending } = useSession()
  const [registering, setRegistering] = useState(false)
  const Page = pages[view]

  useEffect(() => {
    if (user) setRegistering(false)
  }, [user])

  if (isPending) return null

  if (!user) {
    return (
      <>
        {registering ? (
          <UserCreationPage onCancel={() => setRegistering(false)} />
        ) : (
          <LoginPage onRegister={() => setRegistering(true)} />
        )}
        <Toaster />
      </>
    )
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} />
        <main className="min-w-0 flex-1 p-5 lg:p-6">
          <Page />
        </main>
        <AppFooter />
      </div>
      <Toaster />
    </div>
  )
}

export default App
