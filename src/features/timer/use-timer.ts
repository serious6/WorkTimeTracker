import { useCallback, useEffect } from 'react'
import { errorToast, toast } from '@/components/ui/toast-store'
import { useDashboardStore } from '@/features/dashboard/dashboard-store'
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
  FUTURE_DAY_MESSAGE,
  FUTURE_START_MESSAGE,
  TIMER_ERROR_MESSAGE,
  type TimeEntry,
} from '@/features/time-entries/time-entry-schema'
import { formatDuration, formatTimeOfDay, isFutureDay, MINUTE_MS } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { logInfo, reportError } from '@/lib/logger'
import { reconcileSession } from './recover-session'
import {
  DISCARDED_ENTRY_MESSAGE,
  DISCARDED_ENTRY_TITLE,
  MAX_ROUNDING_MS,
  roundedEnd,
  roundedStart,
  roundToMinutes,
} from './round-duration'
import { useTimerStore, type TimerSession, withSegment } from './timer-store'

/**
 * Elapsed time of the running segment. Its stored start may lie up to
 * MAX_ROUNDING_MS after the moment the timer was started, because the session
 * before it rounded up past the clock, so the wall-clock time since the start
 * counts whenever it is longer. Only that much is corrected: a session that
 * survived a restart carries a start of its own, and an unbounded correction
 * would book time it never tracked.
 */
function runningMs(
  running: TimeEntry | undefined,
  session: TimerSession | null,
  atMs: number,
): number {
  if (!running) return 0
  const trackedMs = entryDurationMs(running, atMs)
  const startedAtMs = session?.startedAtMs
  if (startedAtMs === undefined) return trackedMs
  return Math.min(Math.max(trackedMs, atMs - startedAtMs), trackedMs + MAX_ROUNDING_MS)
}

export type TimerStatus = {
  running: TimeEntry | undefined
  paused: boolean
  projectId: number | null
  /** Elapsed time of the current session in milliseconds. */
  elapsedMs: number
}

/**
 * The stored entries of the session, oldest first, so stopping can round the
 * whole session. A running entry always belongs to it, even when the session
 * was recovered without its segment ids.
 */
function sessionSegments(
  entries: TimeEntry[],
  segmentIds: number[],
  running: TimeEntry | undefined,
): TimeEntry[] {
  const ids = running ? withSegment(segmentIds, running.id) : segmentIds
  return entries
    .filter((entry) => ids.includes(entry.id))
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
}

/**
 * The moment from which the time before `startMs` is free of other entries, so
 * a rounded up segment can grow into the past instead of into the future.
 */
function freeSince(entries: TimeEntry[], sessionIds: number[], startMs: number): number {
  return entries.reduce((free, entry) => {
    if (!entry.endTime || sessionIds.includes(entry.id)) return free
    const endMs = Date.parse(entry.endTime)
    return endMs <= startMs && endMs > free ? endMs : free
  }, Number.NEGATIVE_INFINITY)
}

/**
 * The moment a new entry begins. Rounding up stores whole minutes, so the last
 * entry can still end a few seconds ahead of the clock when the rounding did
 * not fit into the past. Tracking then continues at that end instead of being
 * rejected as an overlap.
 */
function trackingStart(entries: TimeEntry[], now = Date.now()): string {
  const reach = now + MAX_ROUNDING_MS
  const startMs = entries.reduce((latest, entry) => {
    const endMs = entry.endTime ? Date.parse(entry.endTime) : 0
    return endMs > latest && endMs <= reach ? endMs : latest
  }, now)
  return new Date(startMs).toISOString()
}

export function useTimer(now: number) {
  const { data: entries = [], isSuccess } = useTimeEntries()
  const { data: projects = [] } = useProjects()
  const selectedDate = useDashboardStore((state) => state.selectedDate)
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
  /**
   * A timer always records the moment it runs in, so it only works on a day
   * that has happened. While a later day is selected, tracking is refused
   * instead of writing time onto a day that lies ahead.
   */
  const futureDay = isFutureDay(selectedDate, new Date(now))

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
    elapsedMs: carriedMs + runningMs(running, session, now),
  }

  const projectName = useCallback(
    (projectId: number | null) =>
      projects.find((project) => project.id === projectId)?.name ?? DELETED_PROJECT_NAME,
    [projects],
  )

  const closeSegment = useCallback(
    async (entry: TimeEntry, endTime: string, startTime = entry.startTime) => {
      await updateEntry.mutateAsync({
        id: entry.id,
        input: {
          projectId: entry.projectId,
          startTime,
          endTime,
          note: entry.note,
        },
      })
      return entryDurationMs({ ...entry, startTime }, Date.parse(endTime))
    },
    [updateEntry],
  )

  const start = useCallback(
    async (projectId: number, note: string | null = null) => {
      if (futureDay) {
        void logInfo('timer', 'start refused on a day that lies ahead')
        errorToast('The timer was not started', FUTURE_DAY_MESSAGE)
        return
      }
      try {
        const entry = await createEntry.mutateAsync({
          projectId,
          startTime: trackingStart(entries),
          endTime: null,
          note,
        })
        setSession({
          projectId,
          carriedMs: 0,
          startedAtMs: Date.now(),
          segmentIds: [entry.id],
          paused: false,
        })
        toast('Timer started', `Tracking ${projectName(projectId)}`)
      } catch (error) {
        reportError('timer', error)
        errorToast(TIMER_ERROR_MESSAGE, errorMessage(error, TIMER_ERROR_MESSAGE))
      }
    },
    [createEntry, entries, futureDay, projectName, setSession],
  )

  /**
   * Rounds the tracked session to whole minutes once, when it is stopped. Every
   * segment of the session is trimmed to the rounded total, so the stored
   * entries already carry the rounded value and no report rounds again. A
   * session that rounds to zero minutes is discarded instead of stored.
   */
  const stop = useCallback(async () => {
    try {
      const stoppedAt = Date.now()
      const elapsedMs = carriedMs + runningMs(running, session, stoppedAt)
      const minutes = roundToMinutes(elapsedMs)
      const projectId = running?.projectId ?? session?.projectId ?? null
      const segments = sessionSegments(entries, session?.segmentIds ?? [], running)
      void logInfo(
        'timer',
        `stop elapsedMs=${elapsedMs} minutes=${minutes} segments=${segments.length}`,
      )
      /**
       * Nothing to trim while time was tracked means the session is lost. The
       * stop ends it, but reports the loss instead of a stored duration.
       */
      if (segments.length === 0 && minutes > 0) {
        reportError('timer', new Error(`stop found no segments for ${minutes} rounded minutes`))
        setSession(null)
        errorToast('The timer could not be stopped', 'The tracked time was not found')
        return
      }
      const sessionIds = segments.map((segment) => segment.id)
      let remainingMs = minutes * MINUTE_MS
      let closedAtMs = Number.NEGATIVE_INFINITY
      for (const [index, segment] of segments.entries()) {
        const durationMs = entryDurationMs(segment, stoppedAt)
        /** The last segment absorbs the rounding, the earlier ones keep their time. */
        const keptMs = index === segments.length - 1 ? remainingMs : Math.min(durationMs, remainingMs)
        remainingMs -= keptMs
        if (keptMs <= 0) {
          void logInfo('timer', `stop discards segment ${segment.id} durationMs=${durationMs}`)
          await deleteEntry.mutateAsync(segment.id)
          continue
        }
        const startMs = Date.parse(segment.startTime)
        /**
         * The rounding of the last segment may reach past the stop, so the
         * segment is placed where it does not book time ahead of the clock.
         */
        const keptStartMs = roundedStart(
          startMs,
          keptMs,
          stoppedAt,
          Math.max(freeSince(entries, sessionIds, startMs), closedAtMs),
        )
        closedAtMs = roundedEnd(keptStartMs, keptMs, stoppedAt)
        if (keptStartMs !== startMs || keptMs !== durationMs || segment.endTime === null) {
          await closeSegment(
            segment,
            new Date(closedAtMs).toISOString(),
            new Date(keptStartMs).toISOString(),
          )
        }
      }
      setSession(null)
      if (minutes === 0) {
        void logInfo('timer', `stop discarded the session elapsedMs=${elapsedMs}`)
        toast(DISCARDED_ENTRY_TITLE, DISCARDED_ENTRY_MESSAGE)
        return
      }
      toast('Timer stopped', `${formatDuration(minutes)} added to ${projectName(projectId)}`)
    } catch (error) {
      reportError('timer', error)
      errorToast('The timer could not be stopped', errorMessage(error, 'Please try again'))
    }
  }, [carriedMs, closeSegment, deleteEntry, entries, projectName, running, session, setSession])

  const pause = useCallback(async () => {
    if (!running) return
    try {
      const segment = await closeSegment(running, new Date().toISOString())
      setSession({
        projectId: running.projectId,
        carriedMs: carriedMs + segment,
        segmentIds: withSegment(session?.segmentIds, running.id),
        paused: true,
      })
      toast('Timer paused', projectName(running.projectId))
    } catch (error) {
      reportError('timer', error)
      errorToast('The timer could not be paused', errorMessage(error, 'Please try again'))
    }
  }, [carriedMs, closeSegment, projectName, running, session, setSession])

  const resume = useCallback(async () => {
    if (!session) return
    if (futureDay) {
      void logInfo('timer', 'resume refused on a day that lies ahead')
      errorToast('The timer was not resumed', FUTURE_DAY_MESSAGE)
      return
    }
    if (session.projectId === null) {
      void logInfo('timer', 'resume refused because the session has no project')
      errorToast(TIMER_ERROR_MESSAGE, 'The original project no longer exists')
      return
    }
    try {
      const entry = await createEntry.mutateAsync({
        projectId: session.projectId,
        startTime: new Date().toISOString(),
        endTime: null,
        note: null,
      })
      setSession({
        ...session,
        startedAtMs: Date.now(),
        segmentIds: withSegment(session.segmentIds, entry.id),
        paused: false,
      })
      toast('Timer resumed', `Tracking ${projectName(session.projectId)}`)
    } catch (error) {
      reportError('timer', error)
      errorToast(TIMER_ERROR_MESSAGE, errorMessage(error, TIMER_ERROR_MESSAGE))
    }
  }, [createEntry, futureDay, projectName, session, setSession])

  /** Closes the current interval and starts the next one at the same timestamp. */
  const switchTo = useCallback(
    async (projectId: number) => {
      if (futureDay) {
        void logInfo('timer', 'switch refused on a day that lies ahead')
        errorToast('The project was not switched', FUTURE_DAY_MESSAGE)
        return
      }
      const timestamp = running ? new Date().toISOString() : trackingStart(entries)
      try {
        const entry = running
          ? await switchEntry.mutateAsync({
              id: running.id,
              input: { projectId, startTime: timestamp, endTime: null, note: null },
            })
          : await createEntry.mutateAsync({ projectId, startTime: timestamp, endTime: null, note: null })
        setSession({
          projectId,
          carriedMs: 0,
          startedAtMs: Date.now(),
          segmentIds: [entry.id],
          paused: false,
        })
        toast(`Switched to ${projectName(projectId)}`)
      } catch (error) {
        reportError('timer', error)
        errorToast(TIMER_ERROR_MESSAGE, errorMessage(error, TIMER_ERROR_MESSAGE))
      }
    },
    [createEntry, entries, futureDay, projectName, running, setSession, switchEntry],
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
        reportError('timer', error)
        errorToast('The start time was not changed', errorMessage(error, 'Please try again'))
        return false
      }
    },
    [projectName, running, updateEntry],
  )

  const setNote = useCallback(
    async (note: string) => {
      if (!running) return
      try {
        await updateNote.mutateAsync({ id: running.id, note: note.trim() || null })
      } catch (error) {
        /** The note is saved on blur, so a failure has no caller that could report it. */
        reportError('timer', error)
        errorToast('The note was not saved', errorMessage(error, 'Please try again'))
      }
    },
    [running, updateNote],
  )

  return { status, isPending, futureDay, start, stop, pause, resume, switchTo, correctStart, setNote }
}
