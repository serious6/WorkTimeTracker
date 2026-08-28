import { useNavigationStore } from '@/app/navigation'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Toaster } from '@/components/ui/toast'
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
  const Page = pages[view]

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      <main className="min-w-0 flex-1 p-5 lg:p-6">
        <Page />
      </main>
      <Toaster />
    </div>
  )
}

export default App
