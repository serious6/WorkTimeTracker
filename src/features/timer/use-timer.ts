import { useCallback, useEffect } from 'react'
import { errorToast, toast } from '@/components/ui/toast-store'
import { entryDurationMs, findRunningEntry } from '@/features/dashboard/metrics'
import { useProjects } from '@/features/projects/project-queries'
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useSwitchRunningTimeEntry,
  useTimeEntries,
  useUpdateTimeEntryNote,
  useUpdateTimeEntry,
} from '@/features/time-entries/time-entry-queries'
import {
  DELETED_PROJECT_NAME,
  FUTURE_START_MESSAGE,
  TIMER_ERROR_MESSAGE,
  type TimeEntry,
} from '@/features/time-entries/time-entry-schema'
import { formatDuration, formatTimeOfDay, MINUTE_MS } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { reconcileSession } from './recover-session'
import { DISCARDED_ENTRY_MESSAGE, DISCARDED_ENTRY_TITLE, roundToMinutes } from './round-duration'
import { useTimerStore } from './timer-store'

export type TimerStatus = {
  running: TimeEntry | undefined
  paused: boolean
  projectId: number | null
  /** Elapsed time of the current session in milliseconds. */
  elapsedMs: number
}

export function useTimer(now: number) {
  const { data: entries = [], isSuccess } = useTimeEntries()
  const { data: projects = [] } = useProjects()
  const session = useTimerStore((state) => state.session)
  const setSession = useTimerStore((state) => state.setSession)
  const recovered = useTimerStore((state) => state.recovered)
  const recover = useTimerStore((state) => state.recover)
  const createEntry = useCreateTimeEntry()
  const updateEntry = useUpdateTimeEntry()
  const updateNote = useUpdateTimeEntryNote()
  const switchEntry = useSwitchRunningTimeEntry()
  const deleteEntry = useDeleteTimeEntry()
  const isPending =
    createEntry.isPending ||
    updateEntry.isPending ||
    updateNote.isPending ||
    switchEntry.isPending ||
    deleteEntry.isPending

  const running = findRunningEntry(entries)

  /** Once per application start the stored entries decide what is running. */
  useEffect(() => {
    if (recovered || !isSuccess) return
    recover(reconcileSession(useTimerStore.getState().session, running))
  }, [isSuccess, recover, recovered, running])

  const paused = Boolean(session?.paused) && !running
  const carriedMs = session?.carriedMs ?? 0
  const status: TimerStatus = {
    running,
    paused,
    projectId: running?.projectId ?? (paused ? (session?.projectId ?? null) : null),
    elapsedMs: carriedMs + (running ? entryDurationMs(running, now) : 0),
  }

  const projectName = useCallback(
    (projectId: number | null) =>
      projects.find((project) => project.id === projectId)?.name ?? DELETED_PROJECT_NAME,
    [projects],
  )

  const closeRunning = useCallback(
    async (entry: TimeEntry, endTime: string) => {
      await updateEntry.mutateAsync({
        id: entry.id,
        input: {
          projectId: entry.projectId,
          startTime: entry.startTime,
          endTime,
          note: entry.note,
        },
      })
      return entryDurationMs(entry, Date.parse(endTime))
    },
    [updateEntry],
  )

  const start = useCallback(
    async (projectId: number, note: string | null = null) => {
      try {
        await createEntry.mutateAsync({
          projectId,
          startTime: new Date().toISOString(),
          endTime: null,
          note,
        })
        setSession({ projectId, carriedMs: 0, paused: false })
        toast('Timer started', `Tracking ${projectName(projectId)}`)
      } catch (error) {
        errorToast(TIMER_ERROR_MESSAGE, errorMessage(error, TIMER_ERROR_MESSAGE))
      }
    },
    [createEntry, projectName, setSession],
  )

  /**
   * Rounds the tracked session to whole minutes once, when it is stopped. The
   * stored entry already carries the rounded value, so no report rounds again.
   * A session that rounds to zero minutes is discarded instead of stored.
   */
  const stop = useCallback(async () => {
    try {
      const stoppedAt = Date.now()
      const minutes = roundToMinutes(
        carriedMs + (running ? entryDurationMs(running, stoppedAt) : 0),
      )
      const projectId = running?.projectId ?? session?.projectId ?? null
      if (running) {
        const remainingMs = minutes * MINUTE_MS - carriedMs
        if (remainingMs > 0) {
          await closeRunning(
            running,
            new Date(Date.parse(running.startTime) + remainingMs).toISOString(),
          )
        } else {
          await deleteEntry.mutateAsync(running.id)
        }
      }
      setSession(null)
      if (minutes === 0) {
        toast(DISCARDED_ENTRY_TITLE, DISCARDED_ENTRY_MESSAGE)
        return
      }
      toast('Timer stopped', `${formatDuration(minutes)} added to ${projectName(projectId)}`)
    } catch (error) {
      errorToast('The timer could not be stopped', errorMessage(error, 'Please try again'))
    }
  }, [carriedMs, closeRunning, deleteEntry, projectName, running, session, setSession])

  const pause = useCallback(async () => {
    if (!running) return
    try {
      const segment = await closeRunning(running, new Date().toISOString())
      setSession({
        projectId: running.projectId,
        carriedMs: carriedMs + segment,
        paused: true,
      })
      toast('Timer paused', projectName(running.projectId))
    } catch (error) {
      errorToast('The timer could not be paused', errorMessage(error, 'Please try again'))
    }
  }, [carriedMs, closeRunning, projectName, running, setSession])

  const resume = useCallback(async () => {
    if (!session) return
    if (session.projectId === null) {
      errorToast(TIMER_ERROR_MESSAGE, 'The original project no longer exists')
      return
    }
    try {
      await createEntry.mutateAsync({
        projectId: session.projectId,
        startTime: new Date().toISOString(),
        endTime: null,
        note: null,
      })
      setSession({ ...session, paused: false })
      toast('Timer resumed', `Tracking ${projectName(session.projectId)}`)
    } catch (error) {
      errorToast(TIMER_ERROR_MESSAGE, errorMessage(error, TIMER_ERROR_MESSAGE))
    }
  }, [createEntry, projectName, session, setSession])

  /** Closes the current interval and starts the next one at the same timestamp. */
  const switchTo = useCallback(
    async (projectId: number) => {
      const timestamp = new Date().toISOString()
      try {
        if (running) {
          await switchEntry.mutateAsync({
            id: running.id,
            input: { projectId, startTime: timestamp, endTime: null, note: null },
          })
        } else {
          await createEntry.mutateAsync({ projectId, startTime: timestamp, endTime: null, note: null })
        }
        setSession({ projectId, carriedMs: 0, paused: false })
        toast(`Switched to ${projectName(projectId)}`)
      } catch (error) {
        errorToast(TIMER_ERROR_MESSAGE, errorMessage(error, TIMER_ERROR_MESSAGE))
      }
    },
    [createEntry, projectName, running, setSession, switchEntry],
  )

  /**
   * Moves the start of the running timer, so a timer that was started too late
   * still records the time that was actually worked. Every derived figure reads
   * the entry, so the metrics follow the correction.
   */
  const correctStart = useCallback(
    async (startTime: Date) => {
      if (!running) return false
      if (startTime.getTime() > Date.now()) {
        errorToast('The start time was not changed', FUTURE_START_MESSAGE)
        return false
      }
      try {
        await updateEntry.mutateAsync({
          id: running.id,
          input: {
            projectId: running.projectId,
            startTime: startTime.toISOString(),
            endTime: null,
            note: running.note,
          },
        })
        toast(
          'Start time updated',
          `${projectName(running.projectId)} now starts at ${formatTimeOfDay(startTime)}`,
        )
        return true
      } catch (error) {
        errorToast('The start time was not changed', errorMessage(error, 'Please try again'))
        return false
      }
    },
    [projectName, running, updateEntry],
  )

  const setNote = useCallback(
    async (note: string) => {
      if (!running) return
      await updateNote.mutateAsync({ id: running.id, note: note.trim() || null })
    },
    [running, updateNote],
  )

  return { status, isPending, start, stop, pause, resume, switchTo, correctStart, setNote }
}
