import { useEffect, useState } from 'react'
import { LOADING_MESSAGE_INTERVAL_MS, loadingMessageAt } from '@/lib/loading-messages'

/**
 * Cycles `initial` and the loading texts, one every
 * `LOADING_MESSAGE_INTERVAL_MS`, and starts over after the last one. The
 * interval is the only clock, so a test drives it with fake timers instead of
 * waiting one and a half seconds per text.
 */
export function useLoadingMessage(initial: string): string {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setStep((current) => current + 1), LOADING_MESSAGE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  return loadingMessageAt(initial, step)
}
