import { useEffect, useState } from 'react'

/** Wall clock in milliseconds, refreshed every second while `enabled`. */
export function useTicker(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    const interval = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(interval)
  }, [enabled])

  return now
}
