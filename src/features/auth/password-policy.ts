export const MIN_PASSWORD_LENGTH = 20
export const MIN_PASSWORD_SPECIAL_CHARACTERS = 2

const SPECIAL_CHARACTERS = /[^\p{L}\p{N}\s]/gu

export type PasswordRule = {
  id: 'length' | 'uppercase' | 'lowercase' | 'special'
  label: string
  satisfied: boolean
}

/**
 * Password policy of the application. The user creation page shows the rules
 * while typing and the same rules are enforced again by the Rust commands.
 */
export function passwordRules(password: string): PasswordRule[] {
  return [
    {
      id: 'length',
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      satisfied: [...password].length >= MIN_PASSWORD_LENGTH,
    },
    {
      id: 'uppercase',
      label: 'At least one uppercase letter',
      satisfied: /\p{Lu}/u.test(password),
    },
    {
      id: 'lowercase',
      label: 'At least one lowercase letter',
      satisfied: /\p{Ll}/u.test(password),
    },
    {
      id: 'special',
      label: `At least ${MIN_PASSWORD_SPECIAL_CHARACTERS} special characters`,
      satisfied:
        (password.match(SPECIAL_CHARACTERS)?.length ?? 0) >= MIN_PASSWORD_SPECIAL_CHARACTERS,
    },
  ]
}

export function isPasswordCompliant(password: string): boolean {
  return passwordRules(password).every((rule) => rule.satisfied)
}
