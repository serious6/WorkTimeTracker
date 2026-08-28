import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDashboardStore } from '../dashboard-store'

export function DateNavigation() {
  const selectedDate = useDashboardStore((state) => state.selectedDate)
  const setSelectedDate = useDashboardStore((state) => state.setSelectedDate)
  const shiftSelectedDate = useDashboardStore((state) => state.shiftSelectedDate)
  const goToToday = useDashboardStore((state) => state.goToToday)

  return (
    <div className="flex items-center gap-2">
      <Button aria-label="Previous day" onClick={() => shiftSelectedDate(-1)} size="icon" variant="outline">
        <ChevronLeft className="size-4" />
      </Button>
      <div className="relative">
        <CalendarRange className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Selected date"
          className="w-48 pl-9"
          onChange={(event) => event.target.value && setSelectedDate(event.target.value)}
          type="date"
          value={selectedDate}
        />
      </div>
      <Button aria-label="Next day" onClick={() => shiftSelectedDate(1)} size="icon" variant="outline">
        <ChevronRight className="size-4" />
      </Button>
      <Button onClick={goToToday} variant="outline">
        Today
      </Button>
    </div>
  )
}
