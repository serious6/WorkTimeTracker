import { useState, type FormEvent } from 'react'
import { AppLogo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/errors'
import { credentialsSchema, INVALID_CREDENTIALS_MESSAGE } from './auth-schema'
import { useLogin } from './session-queries'

/** Entry point of the application while nobody is signed in. */
export function LoginPage({ onRegister }: { onRegister: () => void }) {
  const login = useLogin()
  const [error, setError] = useState<{ field: string | null; message: string }>()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = credentialsSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    })
    if (!result.success) {
      const issue = result.error.issues[0]
      setError({ field: typeof issue?.path[0] === 'string' ? issue.path[0] : null, message: issue?.message ?? '' })
      return
    }

    try {
      await login.mutateAsync(result.data)
    } catch (failure) {
      setError({ field: null, message: errorMessage(failure, INVALID_CREDENTIALS_MESSAGE) })
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-5 text-foreground">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-2">
            <AppLogo className="size-6 text-primary" />
            <h1 className="text-lg font-semibold">Sign in to TimeTrack</h1>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <Field error={error?.field === 'email' ? error.message : undefined} label="Email">
              <Input autoComplete="username" name="email" placeholder="you@example.com" type="email" />
            </Field>
            <Field error={error?.field === 'password' ? error.message : undefined} label="Password">
              <Input autoComplete="current-password" name="password" type="password" />
            </Field>
            {error?.field === null && (
              <p className="text-sm text-destructive" role="alert">
                {error.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={onRegister} variant="outline">
                Register
              </Button>
              <Button disabled={login.isPending} type="submit">
                Login
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
