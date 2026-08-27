import { useCallback } from 'react'
import { errorToast, toast } from '@/components/ui/toast-store'
import { entryDurationMs, findRunningEntry } from '@/features/dashboard/metrics'
import { useProjects } from '@/features/projects/project-queries'
import {
  useCreateTimeEntry,
  useSwitchRunningTimeEntry,
  useTimeEntries,
  useUpdateTimeEntryNote,
  useUpdateTimeEntry,
} from '@/features/time-entries/time-entry-queries'
import {
  DELETED_PROJECT_NAME,
  TIMER_ERROR_MESSAGE,
  type TimeEntry,
} from '@/features/time-entries/time-entry-schema'
import { formatDuration } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { useTimerStore } from './timer-store'

export type TimerStatus = {
  running: TimeEntry | undefined
  paused: boolean
  projectId: number | null
  /** Elapsed time of the current session in milliseconds. */
  elapsedMs: number
}

export function useTimer(now: number) {
  const { data: entries = [] } = useTimeEntries()
  const { data: projects = [] } = useProjects()
  const session = useTimerStore((state) => state.session)
  const setSession = useTimerStore((state) => state.setSession)
  const createEntry = useCreateTimeEntry()
  const updateEntry = useUpdateTimeEntry()
  const updateNote = useUpdateTimeEntryNote()
  const switchEntry = useSwitchRunningTimeEntry()

  const running = findRunningEntry(entries)
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

  const stop = useCallback(async () => {
    try {
      const total = running
        ? carriedMs + (await closeRunning(running, new Date().toISOString()))
        : carriedMs
      const projectId = running?.projectId ?? session?.projectId ?? null
      setSession(null)
      toast(
        'Timer stopped',
        `${formatDuration(total / 60_000)} added to ${projectName(projectId)}`,
      )
    } catch (error) {
      errorToast('The timer could not be stopped', errorMessage(error, 'Please try again'))
    }
  }, [carriedMs, closeRunning, projectName, running, session, setSession])

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

  const setNote = useCallback(
    async (note: string) => {
      if (!running) return
      await updateNote.mutateAsync({ id: running.id, note: note.trim() || null })
    },
    [running, updateNote],
  )

  return { status, start, stop, pause, resume, switchTo, setNote }
}
