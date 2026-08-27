import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createTimeEntry, timeEntryKeys } from '../time-entry-api'
import { newTimeEntrySchema, type TimeEntry } from '../time-entry-schema'

export function TimeEntryForm() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string>()
  const mutation = useMutation({
    mutationFn: createTimeEntry,
    onSuccess: (entry) => {
      queryClient.setQueryData<TimeEntry[]>(timeEntryKeys.all, (current = []) => [entry, ...current])
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = newTimeEntrySchema.safeParse({
      project: form.get('project'),
      durationMinutes: form.get('durationMinutes'),
      notes: form.get('notes') || undefined,
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message)
      return
    }
    setError(undefined)
    mutation.mutate(result.data)
    event.currentTarget.reset()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add work entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block space-y-1 text-sm font-medium">
            Project
            <Input name="project" placeholder="Project name" />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Minutes
            <Input min="1" name="durationMinutes" type="number" />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Notes
            <Input name="notes" placeholder="Optional" />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={mutation.isPending} type="submit">
            Save entry
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
