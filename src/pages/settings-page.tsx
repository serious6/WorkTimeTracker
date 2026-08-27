import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { toast } from '@/components/ui/toast-store'
import { useUpdateWorkSettings, useWorkSettings } from '@/features/settings/work-settings-queries'
import { workSettingsSchema } from '@/features/settings/work-settings-schema'

export function SettingsPage() {
  const settings = useWorkSettings()
  const updateSettings = useUpdateWorkSettings()
  const [error, setError] = useState<string>()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = workSettingsSchema.safeParse({
      dailyTargetMinutes: Number(form.get('dailyTargetHours')) * 60,
      weeklyTargetMinutes: Number(form.get('weeklyTargetHours')) * 60,
      weekStartsOn: form.get('weekStartsOn'),
    })
    if (!result.success) {
      setError('Enter valid daily and weekly targets.')
      return
    }
    setError(undefined)
    updateSettings.mutate(result.data, {
      onSuccess: () => toast('Settings saved', 'Targets updated'),
    })
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Work targets used for overtime calculations.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Work targets</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="max-w-md space-y-4" onSubmit={submit}>
            <label className="block space-y-1 text-sm font-medium">
              Daily target (hours)
              <Input
                defaultValue={settings.dailyTargetMinutes / 60}
                key={settings.dailyTargetMinutes}
                min="0.5"
                name="dailyTargetHours"
                step="0.5"
                type="number"
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Weekly target (hours)
              <Input
                defaultValue={settings.weeklyTargetMinutes / 60}
                key={settings.weeklyTargetMinutes}
                min="0.5"
                name="weeklyTargetHours"
                step="0.5"
                type="number"
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Week starts on
              <Select
                defaultValue={settings.weekStartsOn}
                key={settings.weekStartsOn}
                name="weekStartsOn"
              >
                <option value="monday">Monday</option>
                <option value="sunday">Sunday</option>
              </Select>
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button disabled={updateSettings.isPending} type="submit">
              Save settings
            </Button>
          </form>
        </CardContent>
      </Card>

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
