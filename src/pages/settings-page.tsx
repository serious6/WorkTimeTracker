import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { errorToast, toast } from '@/components/ui/toast-store'
import { dailyTargetMinutes } from '@/features/settings/work-schedule'
import {
  useUpdateWorkSettings,
  useWorkSettingsQuery,
} from '@/features/settings/work-settings-queries'
import {
  DEFAULT_WORK_SETTINGS,
  NO_WORKING_DAY_MESSAGE,
  WEEKDAYS,
  WEEKDAY_LABELS,
  workSettingsSchema,
  type Weekday,
  type WorkSettings,
} from '@/features/settings/work-settings-schema'
import { formatDuration } from '@/lib/date'
import { errorMessage } from '@/lib/errors'

const INVALID_WEEKLY_TARGET_MESSAGE = 'Enter a weekly working time between 1 minute and 168 hours'

/**
 * Form over all general settings. Further settings are added as fields of the
 * matching section, or as an additional section, without changing the
 * loading, validation and saving flow around them.
 */
function GeneralSettingsForm({ settings }: { settings: WorkSettings }) {
  const updateSettings = useUpdateWorkSettings()
  const [weeklyHours, setWeeklyHours] = useState(`${settings.weeklyTargetMinutes / 60}`)
  const [workingDays, setWorkingDays] = useState<Weekday[]>(settings.workingDays)
  const [weekStartsOn, setWeekStartsOn] = useState(settings.weekStartsOn)
  const [error, setError] = useState<string>()

  const dailyTarget = dailyTargetMinutes({
    weeklyTargetMinutes: Math.round(Number(weeklyHours) * 60),
    workingDays,
    weekStartsOn,
  })

  function toggleWorkingDay(day: Weekday, selected: boolean) {
    setWorkingDays((current) =>
      WEEKDAYS.filter((candidate) =>
        candidate === day ? selected : current.includes(candidate),
      ),
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = workSettingsSchema.safeParse({
      weeklyTargetMinutes: Math.round(Number(weeklyHours) * 60),
      workingDays,
      weekStartsOn,
    })
    if (!result.success) {
      const issue = result.error.issues[0]
      setError(issue?.path[0] === 'workingDays' ? NO_WORKING_DAY_MESSAGE : INVALID_WEEKLY_TARGET_MESSAGE)
      return
    }
    setError(undefined)
    updateSettings.mutate(result.data, {
      onSuccess: () => toast('Settings saved', 'Work schedule updated'),
      onError: (failure) =>
        errorToast('Settings not saved', errorMessage(failure, 'The settings could not be saved.')),
    })
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>Work schedule</CardTitle>
        </CardHeader>
        <CardContent className="max-w-md space-y-4">
          <label className="block space-y-1 text-sm font-medium">
            Weekly working time (hours)
            <Input
              max="168"
              min="0.5"
              name="weeklyTargetHours"
              onChange={(event) => setWeeklyHours(event.target.value)}
              step="0.5"
              type="number"
              value={weeklyHours}
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Working days</legend>
            {WEEKDAYS.map((day) => (
              <label className="flex items-center gap-2 text-sm" key={day}>
                <input
                  checked={workingDays.includes(day)}
                  className="size-4 accent-primary"
                  onChange={(event) => toggleWorkingDay(day, event.target.checked)}
                  type="checkbox"
                />
                {WEEKDAY_LABELS[day]}
              </label>
            ))}
          </fieldset>
          <p className="text-sm text-muted-foreground">
            Daily target:{' '}
            {dailyTarget > 0 ? `${formatDuration(dailyTarget)} per working day` : 'not scheduled'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
        </CardHeader>
        <CardContent className="max-w-md">
          <label className="block space-y-1 text-sm font-medium">
            Week starts on
            <Select
              name="weekStartsOn"
              onChange={(event) => setWeekStartsOn(event.target.value as WorkSettings['weekStartsOn'])}
              value={weekStartsOn}
            >
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </Select>
          </label>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={updateSettings.isPending} type="submit">
        Save settings
      </Button>
    </form>
  )
}

export function SettingsPage() {
  const { data, isError, isPending } = useWorkSettingsQuery()

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          General settings used for targets, progress and overtime.
        </p>
      </header>

      {isError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          The settings could not be loaded. The defaults are shown until the database is available.
        </p>
      )}

      {!isPending || isError ? (
        <GeneralSettingsForm
          key={JSON.stringify(data ?? DEFAULT_WORK_SETTINGS)}
          settings={data ?? DEFAULT_WORK_SETTINGS}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Loading settings…</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Local data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            All projects, time entries and settings are stored locally on this device. Nothing is sent
            to a cloud service.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
