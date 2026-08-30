import {
  BarChart3,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  Clock,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShieldCheck,
  Timer,
  PanelLeftClose,
  PanelLeftOpen,
  Wallet,
} from 'lucide-react'
import { useNavigationStore, type View } from '@/app/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Serial Position Effect: Dashboard and Time Entries open the grouped navigation,
 * while Settings keeps its final slot where users expect it (Jakob's Law).
 */
const groups: {
  label?: string
  items: { view: View; label: string; icon: typeof LayoutDashboard }[]
}[] = [
  {
    label: 'Track',
    items: [
      { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { view: 'time-entries', label: 'Time Entries', icon: ListChecks },
      { view: 'time-management', label: 'Time Management', icon: Timer },
    ],
  },
  {
    label: 'Review',
    items: [
      { view: 'week', label: 'Week', icon: CalendarRange },
      { view: 'calendar', label: 'Calendar', icon: CalendarDays },
      { view: 'reports', label: 'Reports', icon: BarChart3 },
      { view: 'working-time', label: 'Working Time', icon: ShieldCheck },
    ],
  },
  {
    label: 'Manage',
    items: [
      { view: 'projects', label: 'Projects', icon: FolderKanban },
      { view: 'budgets', label: 'Budgets', icon: Wallet },
      { view: 'absences', label: 'Absences', icon: CalendarOff },
    ],
  },
  { items: [{ view: 'settings', label: 'Settings', icon: Settings }] },
]

export function AppSidebar() {
  const view = useNavigationStore((state) => state.view)
  const navigate = useNavigationStore((state) => state.navigate)
  const sidebarExpanded = useNavigationStore((state) => state.sidebarExpanded)
  const toggleSidebar = useNavigationStore((state) => state.toggleSidebar)

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col justify-between border-r border-border bg-sidebar py-4 transition-[width]',
        sidebarExpanded ? 'w-56' : 'w-16',
      )}
    >
      <div>
        <div className="flex items-center gap-2 px-3 pb-6">
          <Clock aria-hidden className="size-6 text-primary" />
          <span className={cn('text-lg font-semibold', !sidebarExpanded && 'sr-only')}>TimeTrack</span>
          <Button
            aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className="ml-auto shrink-0"
            onClick={toggleSidebar}
            size="icon"
            variant="ghost"
          >
            {sidebarExpanded ? (
              <PanelLeftClose aria-hidden className="size-4" />
            ) : (
              <PanelLeftOpen aria-hidden className="size-4" />
            )}
          </Button>
        </div>
        <nav aria-label="Main" className="px-2">
          <ul>
            {groups.flatMap((group, groupIndex) => [
              group.label && (
                <li
                  className={cn(
                    'mb-1 border-t border-border pt-3 first:border-t-0 first:pt-0',
                    !sidebarExpanded && 'h-3',
                  )}
                  key={group.label}
                  role="presentation"
                >
                  <h2 className={cn('px-3 text-xs font-medium text-muted-foreground', !sidebarExpanded && 'sr-only')}>
                    {group.label}
                  </h2>
                </li>
              ),
              ...group.items.map((item) => (
                <li className={cn(groupIndex > 0 && !group.label && 'mt-3')} key={item.view}>
                  <Button
                    aria-current={view === item.view ? 'page' : undefined}
                    className={cn(
                      'flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                      view === item.view && 'bg-primary/15 text-primary',
                    )}
                    onClick={() => navigate(item.view)}
                    variant="ghost"
                  >
                    <item.icon aria-hidden className="size-4 shrink-0" />
                    <span className={cn(!sidebarExpanded && 'sr-only')}>{item.label}</span>
                  </Button>
                </li>
              )),
            ])}
          </ul>
        </nav>
      </div>

      <div className="mx-2 rounded-lg border border-border p-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <span aria-hidden className="size-2 rounded-full bg-success" />
          <span className={cn(!sidebarExpanded && 'sr-only')}>Local data</span>
        </p>
        {sidebarExpanded && <p className="pt-1">All data is stored locally on this device.</p>}
      </div>
    </aside>
  )
}
