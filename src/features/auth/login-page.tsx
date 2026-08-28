import { Clock } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/errors'
import { credentialsSchema, INVALID_CREDENTIALS_MESSAGE } from './auth-schema'
import { useLogin } from './session-queries'

/** Entry point of the application while nobody is signed in. */
export function LoginPage({ onRegister }: { onRegister: () => void }) {
  const login = useLogin()
  const [error, setError] = useState<string>()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = credentialsSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message)
      return
    }

    try {
      await login.mutateAsync(result.data)
    } catch (failure) {
      setError(errorMessage(failure, INVALID_CREDENTIALS_MESSAGE))
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-5 text-foreground">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-2">
            <Clock className="size-6 text-primary" />
            <h1 className="text-lg font-semibold">Sign in to TimeTrack</h1>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <label className="block space-y-1 text-sm font-medium">
              Email
              <Input autoComplete="username" name="email" placeholder="you@example.com" type="email" />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Password
              <Input autoComplete="current-password" name="password" type="password" />
            </label>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
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
