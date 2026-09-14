import { useEffect, useMemo, useState } from 'react'

/**
 * The texts shown under the turning logo while the application waits. They are
 * light-hearted takes on time travel: a wait without a progress bar still feels
 * alive when the screen keeps talking about the clock it is winding up.
 */
export const LOADING_MESSAGES = [
  'Fueling the time machine',
  'Enabling Flux Compensator',
  'Calibrating the chronometer',
  'Winding up the mainspring',
  'Synchronizing parallel timelines',
  'Charging the flux capacitor',
  'Polishing the second hand',
] as const

/** How long a single loading text stays on screen. */
export const LOADING_MESSAGE_INTERVAL_MS = 1_500

/**
 * Cycles `initial` and the loading texts, one every
 * `LOADING_MESSAGE_INTERVAL_MS`, and starts over after the last one. The
 * interval is the only clock, so a test drives it with fake timers instead of
 * waiting one and a half seconds per text.
 */
export function useLoadingMessage(initial: string): string {
  const messages = useMemo<readonly string[]>(() => [initial, ...LOADING_MESSAGES], [initial])
  const [step, setStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setStep((current) => current + 1), LOADING_MESSAGE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  return messages[step % messages.length] ?? initial
}
