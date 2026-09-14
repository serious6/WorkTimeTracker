/**
 * The texts shown under the turning logo while the application waits. They are
 * light-hearted takes on time travel: a wait without a progress bar still feels
 * alive when the screen keeps talking about the clock it is winding up.
 *
 * They live outside the React tree because the boot screen of `index.html`
 * cycles them before React exists.
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
 * The text of a loading step: `initial` first, then the loading texts, starting
 * over after the last one.
 */
export function loadingMessageAt(initial: string, step: number): string {
  const messages = [initial, ...LOADING_MESSAGES]
  return messages[step % messages.length]
}
