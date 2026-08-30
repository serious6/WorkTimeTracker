import { Clock } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/errors'
import { registrationSchema } from './auth-schema'
import { PasswordPolicyChecklist } from './components/password-policy-checklist'
import { useRegister } from './session-queries'

interface UserCreationPageProps {
  onCancel: () => void
  onSuccess?: () => void
}

/** Registration page; the new account is signed in right away. */
export function UserCreationPage({ onCancel, onSuccess }: UserCreationPageProps) {
  const register = useRegister()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<{ field: string | null; message: string }>()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = registrationSchema.safeParse({ email: form.get('email'), password })
    if (!result.success) {
      const issue = result.error.issues[0]
      setError({ field: typeof issue?.path[0] === 'string' ? issue.path[0] : null, message: issue?.message ?? '' })
      return
    }

    try {
      await register.mutateAsync(result.data)
      onSuccess?.()
    } catch (failure) {
      setError({ field: null, message: errorMessage(failure, 'The account could not be created.') })
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-5 text-foreground">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-2">
            <Clock className="size-6 text-primary" />
            <h1 className="text-lg font-semibold">Create your account</h1>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <Field error={error?.field === 'email' ? error.message : undefined} label="Email">
              <Input autoComplete="username" name="email" placeholder="you@example.com" type="email" />
            </Field>
            <Field error={error?.field === 'password' ? error.message : undefined} label="Password">
              <Input
                autoComplete="new-password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </Field>
            <PasswordPolicyChecklist password={password} />
            {error?.field === null && (
              <p className="text-sm text-destructive" role="alert">
                {error.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={onCancel} variant="outline">
                Cancel
              </Button>
              <Button disabled={register.isPending} type="submit">
                Register
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
