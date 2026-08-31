export const MAX_EMAIL_LENGTH = 254
const PLAUSIBLE_EMAIL_PATTERN =
  /^[^\p{White_Space}@]+@[^\p{White_Space}@.]+(\.[^\p{White_Space}@.]+)+$/u
const textEncoder = new TextEncoder()

/** Checks the shared login/register e-mail plausibility rules. */
export function isPlausibleEmail(value: string): boolean {
  return (
    textEncoder.encode(value).byteLength <= MAX_EMAIL_LENGTH &&
    PLAUSIBLE_EMAIL_PATTERN.test(value)
  )
}
