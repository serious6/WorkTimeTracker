import { Check, X } from 'lucide-react'
import { passwordRules } from '../password-policy'

/** Live feedback for the password policy while the user types. */
export function PasswordPolicyChecklist({ password }: { password: string }) {
  return (
    <ul aria-label="Password policy" className="space-y-1 text-sm">
      {passwordRules(password).map((rule) => (
        <li
          className={rule.satisfied ? 'flex items-center gap-2 text-success' : 'flex items-center gap-2 text-muted-foreground'}
          key={rule.id}
        >
          {rule.satisfied ? (
            <Check aria-hidden className="size-4 shrink-0" />
          ) : (
            <X aria-hidden className="size-4 shrink-0" />
          )}
          <span>{rule.label}</span>
          <span className="sr-only">{rule.satisfied ? 'met' : 'not met'}</span>
        </li>
      ))}
    </ul>
  )
}
