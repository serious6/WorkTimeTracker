const MAX_EMAIL_LENGTH = 254
const PLAUSIBLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/** Checks the shared login/register e-mail plausibility rules. */
export function isPlausibleEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LENGTH && PLAUSIBLE_EMAIL_PATTERN.test(value)
}
