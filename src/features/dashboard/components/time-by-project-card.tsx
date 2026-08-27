import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import type { Project } from '@/features/projects/project-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { formatDuration, toDateKey } from '@/lib/date'
import type { WeekStart } from '@/lib/date'
import { entriesInRange, projectTotals } from '../metrics'
import { RANGE_LABELS, resolveRange, type RangeKey } from '../ranges'

export function TimeByProjectCard({
  entries,
  projects,
  referenceDate,
  weekStartsOn,
  now,
  onSelectProject,
}: {
  entries: TimeEntry[]
  projects: Project[]
  referenceDate: Date
  weekStartsOn: WeekStart
  now: number
  onSelectProject: (projectId: number | null) => void
}) {
  const [range, setRange] = useState<RangeKey>('today')
  const [custom, setCustom] = useState({ from: toDateKey(referenceDate), to: toDateKey(referenceDate) })

  const totals = projectTotals(
    entriesInRange(entries, resolveRange(range, referenceDate, weekStartsOn, custom)),
    projects,
    now,
  )
  const total = totals.reduce((sum, item) => sum + item.minutes, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time by Project</CardTitle>
        <Select
          aria-label="Chart range"
          className="h-8 w-32 text-xs"
          onChange={(event) => setRange(event.target.value as RangeKey)}
          value={range}
        >
          {Object.entries(RANGE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        {range === 'custom' && (
          <div className="flex gap-2">
            <Input
              aria-label="Range start"
              onChange={(event) => setCustom((current) => ({ ...current, from: event.target.value }))}
              type="date"
              value={custom.from}
            />
            <Input
              aria-label="Range end"
              onChange={(event) => setCustom((current) => ({ ...current, to: event.target.value }))}
              type="date"
              value={custom.to}
            />
          </div>
        )}

        {totals.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No time tracked yet</p>
        ) : (
          <div className="flex flex-col items-center gap-4 lg:flex-row">
            <div className="relative size-40 shrink-0">
              <ResponsiveContainer height="100%" width="100%">
                <PieChart>
                  <Pie
                    data={totals}
                    dataKey="minutes"
                    innerRadius={52}
                    nameKey="name"
                    onClick={(item: { payload?: { projectId: number | null } }) =>
                      onSelectProject(item.payload?.projectId ?? null)
                    }
                    outerRadius={76}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {totals.map((item) => (
                      <Cell cursor="pointer" fill={item.color} key={`${item.projectId}`} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '0.5rem',
                      fontSize: '0.75rem',
                    }}
                    formatter={(value, name) => {
                      const item = totals.find((candidate) => candidate.name === name)
                      return [`${formatDuration(Number(value))} (${item?.percentage ?? 0}%)`, String(name)]
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-sm font-semibold tabular-nums">{formatDuration(total)}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </div>

            <ul className="w-full space-y-2">
              {totals.map((item) => (
                <li key={`${item.projectId}`}>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelectProject(item.projectId)}
                    type="button"
                  >
                    <span
                      aria-hidden
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatDuration(item.minutes)} ({item.percentage}%)
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
