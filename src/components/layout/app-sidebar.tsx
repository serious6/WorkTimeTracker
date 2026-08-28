import {
  BarChart3,
  CalendarDays,
  Clock,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Settings,
  Timer,
  Wallet,
} from 'lucide-react'
import { useNavigationStore, type View } from '@/app/navigation'
import { cn } from '@/lib/utils'

const items: { view: View; label: string; icon: typeof LayoutDashboard }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'projects', label: 'Projects', icon: FolderKanban },
  { view: 'time-entries', label: 'Time Entries', icon: ListChecks },
  { view: 'time-management', label: 'Time Management', icon: Timer },
  { view: 'budgets', label: 'Budgets', icon: Wallet },
  { view: 'reports', label: 'Reports', icon: BarChart3 },
  { view: 'calendar', label: 'Calendar', icon: CalendarDays },
  { view: 'settings', label: 'Settings', icon: Settings },
]

export function AppSidebar() {
  const view = useNavigationStore((state) => state.view)
  const navigate = useNavigationStore((state) => state.navigate)

  return (
    <aside className="flex w-16 shrink-0 flex-col justify-between border-r border-border bg-sidebar py-4 lg:w-56">
      <div>
        <div className="flex items-center gap-2 px-3 pb-6 lg:px-4">
          <Clock className="size-6 text-primary" />
          <span className="hidden text-lg font-semibold lg:inline">TimeTrack</span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1 px-2">
          {items.map((item) => (
            <button
              aria-current={view === item.view ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                view === item.view && 'bg-primary/15 text-primary',
              )}
              key={item.view}
              onClick={() => navigate(item.view)}
              type="button"
            >
              <item.icon className="size-4 shrink-0" />
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="mx-2 rounded-lg border border-border p-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <span aria-hidden className="size-2 rounded-full bg-success" />
          <span className="hidden lg:inline">Local data</span>
        </p>
        <p className="hidden pt-1 lg:block">All data is stored locally on this device.</p>
      </div>
    </aside>
  )
}
