import { useQuery } from '@tanstack/react-query'
import { Clock3 } from 'lucide-react'
import { TimeEntryForm } from '@/features/time-entries/components/time-entry-form'
import { WorkWeekChart } from '@/features/time-entries/components/work-week-chart'
import { listTimeEntries, timeEntryKeys } from '@/features/time-entries/time-entry-api'
import { useTimerStore } from '@/features/timer/timer-store'

function App() {
  const { data: entries = [], isError } = useQuery({
    queryKey: timeEntryKeys.all,
    queryFn: listTimeEntries,
  })
  const { startedAt, start, stop } = useTimerStore()

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Open-source desktop app</p>
          <h1 className="text-3xl font-bold tracking-tight">WorkTimeTracker</h1>
          <p className="text-muted-foreground">Track focused work without sending data to a cloud service.</p>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          onClick={startedAt ? stop : start}
          type="button"
        >
          <Clock3 className="size-4" />
          {startedAt ? 'Stop timer' : 'Start timer'}
        </button>
      </header>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <WorkWeekChart entries={entries} />
        <TimeEntryForm />
      </section>

      {isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          The local database could not be loaded.
        </p>
      )}
    </main>
  )
}

export default App
