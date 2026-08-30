import { useEffect, useState } from 'react'

/**
 * Wall clock in milliseconds, refreshed every second while `enabled`. Timers are
 * throttled while the window is hidden and stop while the system sleeps, so the
 * clock is read again as soon as the application is visible or focused.
 */
export function useTicker(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    const tick = () => setNow(Date.now())
    const interval = setInterval(tick, 1_000)
    globalThis.document?.addEventListener('visibilitychange', tick)
    globalThis.addEventListener?.('focus', tick)
    return () => {
      clearInterval(interval)
      globalThis.document?.removeEventListener('visibilitychange', tick)
      globalThis.removeEventListener?.('focus', tick)
    }
  }, [enabled])

  return now
}
