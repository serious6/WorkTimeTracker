import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { errorToast, toast } from '@/components/ui/toast-store'
import { useDeleteAccount, useSession } from '@/features/auth/session-queries'
import { dailyTargetMinutes } from '@/features/settings/work-schedule'
import {
  useUpdateWorkSettings,
  useWorkSettingsQuery,
} from '@/features/settings/work-settings-queries'
import {
  BREAK_ORDER_MESSAGE,
  GERMAN_COMPLIANCE_LIMITS,
  INVALID_LIMIT_MESSAGE,
  NO_WORKING_DAY_MESSAGE,
  WEEKDAYS,
  WEEKDAY_LABELS,
  workSettingsSchema,
  type ComplianceLimits,
  type Weekday,
  type WorkSettings,
} from '@/features/settings/work-settings-schema'
import { formatDuration } from '@/lib/date'
import { errorMessage } from '@/lib/errors'

const INVALID_WEEKLY_TARGET_MESSAGE = 'Enter a weekly working time between 1 minute and 168 hours'

const LIMIT_FIELDS: { field: keyof ComplianceLimits; label: string; hint: string }[] = [
  { field: 'breakThresholdMinutes', label: 'Break required after', hint: 'ArbZG § 4' },
  { field: 'requiredBreakMinutes', label: 'Required break', hint: 'ArbZG § 4' },
  { field: 'longBreakThresholdMinutes', label: 'Longer break required after', hint: 'ArbZG § 4' },
  { field: 'requiredLongBreakMinutes', label: 'Required longer break', hint: 'ArbZG § 4' },
  { field: 'minBreakBlockMinutes', label: 'Shortest counting break block', hint: 'ArbZG § 4' },
  { field: 'maxContinuousWorkMinutes', label: 'Maximum work without a break', hint: 'ArbZG § 4' },
  { field: 'maxDailyWorkMinutes', label: 'Maximum daily working time', hint: 'ArbZG § 3' },
  { field: 'minRestMinutes', label: 'Minimum rest between working days', hint: 'ArbZG § 5' },
]

type SettingsError = { path: PropertyKey[]; message: string }

function settingsErrorMessage(path: PropertyKey[], message: string): string {
  if (path[0] === 'workingDays') return NO_WORKING_DAY_MESSAGE
  if (path[0] === 'complianceLimits') {
    return message === BREAK_ORDER_MESSAGE ? BREAK_ORDER_MESSAGE : INVALID_LIMIT_MESSAGE
  }
  return INVALID_WEEKLY_TARGET_MESSAGE
}

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
  const [limits, setLimits] = useState<Record<keyof ComplianceLimits, string>>(() =>
    Object.fromEntries(
      LIMIT_FIELDS.map(({ field }) => [field, `${settings.complianceLimits[field]}`]),
    ) as Record<keyof ComplianceLimits, string>,
  )
  const [error, setError] = useState<SettingsError>()

  const dailyTarget = dailyTargetMinutes({
    weeklyTargetMinutes: Math.round(Number(weeklyHours) * 60),
    workingDays,
  })

  const isGermanDefault = LIMIT_FIELDS.every(
    ({ field }) => Number(limits[field]) === GERMAN_COMPLIANCE_LIMITS[field],
  )

  function restoreGermanLimits() {
    setLimits(
      Object.fromEntries(
        LIMIT_FIELDS.map(({ field }) => [field, `${GERMAN_COMPLIANCE_LIMITS[field]}`]),
      ) as Record<keyof ComplianceLimits, string>,
    )
  }

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
      complianceLimits: limits,
    })
    if (!result.success) {
      const issue = result.error.issues[0]
      if (issue) {
        setError({
          path: issue.path,
          message: settingsErrorMessage(issue.path, issue.message),
        })
      }
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
          <Field
            error={error?.path[0] === 'weeklyTargetMinutes' ? error.message : undefined}
            label="Weekly working time (hours)"
          >
            <Input
              max="168"
              min="0"
              name="weeklyTargetHours"
              onChange={(event) => setWeeklyHours(event.target.value)}
              step="any"
              type="number"
              value={weeklyHours}
            />
          </Field>
          <fieldset
            aria-describedby={error?.path[0] === 'workingDays' ? 'working-days-error' : undefined}
            aria-invalid={error?.path[0] === 'workingDays' ? true : undefined}
            className="space-y-2"
          >
            <legend className="text-sm font-medium">Working days</legend>
            {WEEKDAYS.map((day) => (
              <Checkbox
                checked={workingDays.includes(day)}
                key={day}
                label={WEEKDAY_LABELS[day]}
                onChange={(event) => toggleWorkingDay(day, event.target.checked)}
              />
            ))}
            {error?.path[0] === 'workingDays' && (
              <p className="text-sm text-destructive" id="working-days-error" role="alert">
                {error.message}
              </p>
            )}
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
          <Field label="Week starts on">
            <Select
              name="weekStartsOn"
              onChange={(event) => setWeekStartsOn(event.target.value as WorkSettings['weekStartsOn'])}
              value={weekStartsOn}
            >
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Working time limits</CardTitle>
          <Button
            disabled={isGermanDefault}
            onClick={restoreGermanLimits}
            type="button"
            variant="outline"
          >
            Restore German defaults
          </Button>
        </CardHeader>
        <CardContent
          aria-describedby={
            error?.path[0] === 'complianceLimits' && error.path.length === 1
              ? 'compliance-limits-error'
              : undefined
          }
          aria-invalid={
            error?.path[0] === 'complianceLimits' && error.path.length === 1 ? true : undefined
          }
          className="max-w-md space-y-4"
        >
          <p className="text-sm text-muted-foreground">
            Limits behind the compliance warnings, in minutes. The defaults follow the German
            Arbeitszeitgesetz.
          </p>
          {LIMIT_FIELDS.map(({ field, label, hint }) => (
            <Field
              error={
                error?.path[0] === 'complianceLimits' && error.path[1] === field
                  ? error.message
                  : undefined
              }
              key={field}
              label={
                <>
                  {label} <span className="font-normal text-muted-foreground">({hint})</span>
                </>
              }
            >
              <Input
                max="1440"
                min="1"
                name={field}
                onChange={(event) =>
                  setLimits((current) => ({ ...current, [field]: event.target.value }))
                }
                step="1"
                type="number"
                value={limits[field]}
              />
            </Field>
          ))}
          {error?.path[0] === 'complianceLimits' && error.path.length === 1 && (
            <p className="text-sm text-destructive" id="compliance-limits-error" role="alert">
              {error.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Button disabled={updateSettings.isPending} type="submit">
        Save settings
      </Button>
    </form>
  )
}

/**
 * Erasure of the account (GDPR Art. 17). The deletion is immediate and takes
 * every record of the account with it, the audit trails included, so it is
 * separated from the rest of the settings and asks for the e-mail of the
 * signed-in account before it is offered at all. The comparison trims and
 * ignores case, the way the login normalises an address.
 */
function DangerZone({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const deleteAccount = useDeleteAccount()

  const confirmed = confirmation.trim().toLowerCase() === email.trim().toLowerCase()

  function close() {
    setOpen(false)
    setConfirmation('')
  }

  // mutateAsync, because the successful deletion ends the session and unmounts
  // this page before mutate() would run its callbacks.
  async function confirm() {
    if (!confirmed) return
    try {
      await deleteAccount.mutateAsync()
      close()
      toast('Account deleted', 'Your account and all of its data were deleted.')
    } catch (failure) {
      errorToast(
        'Account not deleted',
        errorMessage(failure, 'The account could not be deleted. Nothing was deleted.'),
      )
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Deleting your account removes it and all of its data from this device and the database,
          including every audit trail. This cannot be undone.
        </p>
        <Button onClick={() => setOpen(true)} variant="destructive">
          Delete account
        </Button>
      </CardContent>

      <Dialog
        description="This deletes your account immediately and permanently. It cannot be undone."
        onClose={close}
        open={open}
        title="Delete account?"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            All projects, time entries, absences, overtime records and settings of this account are
            deleted, together with every audit trail of it. Nothing is kept and nothing can be
            restored.
          </p>
          <Field label={`Type ${email} to confirm`}>
            <Input
              autoComplete="off"
              name="deleteAccountConfirmation"
              onChange={(event) => setConfirmation(event.target.value)}
              type="email"
              value={confirmation}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={close} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!confirmed || deleteAccount.isPending}
              onClick={confirm}
              variant="destructive"
            >
              Delete account
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  )
}

export function SettingsPage() {
  const { data, isError, isPending, isFetching, refetch } = useWorkSettingsQuery()
  const { data: user } = useSession()

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          General settings used for targets, progress and overtime.
        </p>
      </header>

      {isError ? (
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <p>
            The settings could not be loaded. They cannot be edited until the database is available,
            so the stored values are not overwritten.
          </p>
          <Button disabled={isFetching} onClick={() => void refetch()} variant="outline">
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading settings…</p>
      ) : (
        <GeneralSettingsForm key={JSON.stringify(data)} settings={data} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Where your data is stored</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            All projects, time entries and settings are stored in the database this build is
            configured for: a local or self-hosted build keeps them on your own machine, the released
            production build keeps them in the hosted database in the European Union that the authors
            administer and may review to fix errors and evaluate usage. The application collects no
            telemetry and sends nothing to an analytics service. The privacy policy describes both
            cases.
          </p>
        </CardContent>
      </Card>

      {user && <DangerZone email={user.email} />}
    </div>
  )
}
