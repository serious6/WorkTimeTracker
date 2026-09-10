import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toast-store'
import { errorMessage } from '@/lib/errors'
import { useCreateNoteTemplate, useUpdateNoteTemplate } from '../note-template-queries'
import { saveNoteTemplateSchema, type NoteTemplate } from '../note-template-schema'

export function NoteTemplateDialog({
  open,
  template,
  onClose,
}: {
  open: boolean
  template?: NoteTemplate
  onClose: () => void
}) {
  const createTemplate = useCreateNoteTemplate()
  const updateTemplate = useUpdateNoteTemplate()
  const [error, setError] = useState<string>()
  const [openedFor, setOpenedFor] = useState<number | null>(null)

  const openedKey = template?.id ?? 0
  if (open && openedFor !== openedKey) {
    setOpenedFor(openedKey)
    setError(undefined)
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = saveNoteTemplateSchema.safeParse({
      name: form.get('name'),
      text: form.get('text'),
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message)
      return
    }

    try {
      if (template) {
        await updateTemplate.mutateAsync({ id: template.id, input: result.data })
        toast('Template updated', 'Notes already saved keep their text')
      } else {
        await createTemplate.mutateAsync(result.data)
        toast('Template created', result.data.name)
      }
      setError(undefined)
      onClose()
    } catch (failure) {
      setError(errorMessage(failure, 'The note template could not be saved.'))
    }
  }

  return (
    <Dialog
      onClose={onClose}
      open={open}
      title={template ? 'Edit note template' : 'Create note template'}
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Name">
          <Input
            defaultValue={template?.name ?? ''}
            maxLength={100}
            name="name"
            placeholder="Daily standup"
          />
        </Field>
        <Field
          hint="Inserted into a note field, where it stays editable."
          label="Note text"
        >
          <Textarea
            defaultValue={template?.text ?? ''}
            maxLength={500}
            name="text"
            placeholder="Daily standup with the team"
          />
        </Field>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={createTemplate.isPending || updateTemplate.isPending} type="submit">
            {template ? 'Save template' : 'Create template'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
