import { useState } from 'react'
import { useNavigationStore } from '@/app/navigation'
import { ProjectDialog } from '@/features/projects/components/project-dialog'
import { useProjects } from '@/features/projects/project-queries'
import {
  scheduledMinutesInRange,
  targetMinutesForDay,
} from '@/features/settings/work-schedule'
import { useWorkSettings } from '@/features/settings/work-settings-queries'
import { TimeEntryDialog } from '@/features/time-entries/components/time-entry-dialog'
import { useTimeEntries } from '@/features/time-entries/time-entry-queries'
import { useTicker } from '@/features/timer/use-ticker'
import { useTimer } from '@/features/timer/use-timer'
import { formatDay, startOfWeek } from '@/lib/date'
import { cumulativeBalance } from './balance'
import { CumulativeBalanceCard } from './components/cumulative-balance-card'
import { CurrentlyTrackingCard } from './components/currently-tracking-card'
import { DateNavigation } from './components/date-navigation'
import { DayEntriesCard } from './components/day-entries-card'
import { KpiCards } from './components/kpi-cards'
import { OvertimeOverviewCard } from './components/overtime-overview-card'
import { RecentProjectsCard } from './components/recent-projects-card'
import { TimeByProjectCard } from './components/time-by-project-card'
import { WeeklySummaryCard } from './components/weekly-summary-card'
import { useSelectedDate } from './dashboard-store'
import { dayRange, entriesInRange, totalMinutes, weekRange } from './metrics'
import { useKeyboardShortcuts } from './use-keyboard-shortcuts'

export function DashboardPage() {
  const selectedDate = useSelectedDate()
  const settings = useWorkSettings()
  const { data: entries = [], isError } = useTimeEntries()
  const { data: projects = [] } = useProjects()
  const navigate = useNavigationStore((state) => state.navigate)

  const now = useTicker(true)
  const timer = useTimer(now)

  const [entryDialogOpen, setEntryDialogOpen] = useState(false)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const todayRange = dayRange(selectedDate)
  const selectedWeekRange = weekRange(selectedDate, settings.weekStartsOn)
  const dayEntries = entriesInRange(entries, todayRange, now)
  const weekEntries = entriesInRange(entries, selectedWeekRange, now)
  const trackedTodayMinutes = totalMinutes(dayEntries, now, todayRange)
  const trackedWeekMinutes = totalMinutes(weekEntries, now, selectedWeekRange)
  const dailyTargetMinutes = targetMinutesForDay(settings, selectedDate)
  const weeklyTargetMinutes = scheduledMinutesInRange(settings, selectedWeekRange)
  const balance = cumulativeBalance({ entries, settings, throughDate: selectedDate, now })

  function toggleTimer() {
    if (timer.status.running) void timer.stop()
    else if (timer.status.paused) void timer.resume()
    else setPickerOpen(true)
  }

  useKeyboardShortcuts({
    onAddEntry: () => setEntryDialogOpen(true),
    onProjectSearch: () => setPickerOpen(true),
    onToggleTimer: toggleTimer,
  })

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of your work time and productivity. {formatDay(selectedDate)}
          </p>
        </div>
        <DateNavigation />
      </header>

      {isError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          The local database could not be loaded.
        </p>
      )}

      <KpiCards
        dailyTargetMinutes={dailyTargetMinutes}
        trackedTodayMinutes={trackedTodayMinutes}
        trackedWeekMinutes={trackedWeekMinutes}
        weeklyTargetMinutes={weeklyTargetMinutes}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <CurrentlyTrackingCard
            onCreateProject={() => setProjectDialogOpen(true)}
            onPickerOpenChange={setPickerOpen}
            pickerOpen={pickerOpen}
            projects={projects}
            timer={timer}
          />
          <DayEntriesCard
            entries={dayEntries}
            now={now}
            onAddEntry={() => setEntryDialogOpen(true)}
            onPause={() => void timer.pause()}
            onPlay={(projectId) => void timer.switchTo(projectId)}
            onStartTimer={() => setPickerOpen(true)}
            projects={projects}
            title="Today's Entries"
          />
        </div>

        <div className="space-y-5">
          <TimeByProjectCard
            entries={entries}
            now={now}
            onSelectProject={(projectId) => navigate('time-entries', { projectFilter: projectId })}
            projects={projects}
            referenceDate={selectedDate}
            weekStartsOn={settings.weekStartsOn}
          />
          <OvertimeOverviewCard
            dailyTargetMinutes={dailyTargetMinutes}
            onOpenDay={() => navigate('time-entries', { dateFilter: selectedDate })}
            onOpenWeek={() => navigate('reports')}
            selectedDate={selectedDate}
            trackedTodayMinutes={trackedTodayMinutes}
            trackedWeekMinutes={trackedWeekMinutes}
            weekStart={startOfWeek(selectedDate, settings.weekStartsOn)}
            weeklyTargetMinutes={weeklyTargetMinutes}
          />
          <CumulativeBalanceCard balance={balance} onOpenWeek={() => navigate('week')} />
          <RecentProjectsCard
            entries={entries}
            now={now}
            onSelectProject={(projectId) => navigate('time-entries', { projectFilter: projectId })}
            onViewAll={() => navigate('projects')}
            projects={projects}
          />
          <WeeklySummaryCard
            entries={entries}
            now={now}
            onOpenReports={() => navigate('week')}
            referenceDate={selectedDate}
            weekStartsOn={settings.weekStartsOn}
          />
        </div>
      </div>

      <TimeEntryDialog
        date={selectedDate}
        onClose={() => setEntryDialogOpen(false)}
        open={entryDialogOpen}
      />
      <ProjectDialog onClose={() => setProjectDialogOpen(false)} open={projectDialogOpen} />
    </div>
  )
}
