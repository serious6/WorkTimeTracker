import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TimeEntry } from '../time-entry-schema'

export function WorkWeekChart({ entries }: { entries: TimeEntry[] }) {
  const data = entries.reduce<Array<{ day: string; hours: number }>>((days, entry) => {
    const day = new Date(entry.startedAt).toLocaleDateString(undefined, { weekday: 'short' })
    const current = days.find((item) => item.day === day)
    if (current) current.hours += entry.durationMinutes / 60
    else days.push({ day, hours: entry.durationMinutes / 60 })
    return days
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>This week</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {data.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Add an entry to see your weekly chart.
          </div>
        ) : (
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" />
              <YAxis unit="h" />
              <Tooltip />
              <Bar dataKey="hours" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
